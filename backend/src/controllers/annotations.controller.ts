import { Request, Response } from 'express';
import { Annotation } from '../models/Annotation';
import { Task } from '../models/Task';
import { Dataset } from '../models/Dataset';
import { assertProjectAccess } from '../middleware/authorize';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { ReviewDecision } from '../types';

function isSameUser(a: unknown, b: unknown): boolean {
  return a?.toString() === b?.toString();
}

export const createAnnotation = asyncHandler(async (req: Request, res: Response) => {
  const { taskId, type, parentAnnotation } = req.body;

  const task = await Task.findById(taskId);
  if (!task) throw ApiError.notFound('Task not found');
  const project = await assertProjectAccess(req.user!, task.project);

  const isAdminOrSuper = req.user!.role === 'super_admin' || project.members.some(
    (m) => m.user.toString() === req.user!._id.toString() && m.projectRole === 'admin'
  );

  if (type === 'annotation') {
    const isAssignedAnnotator = isSameUser(task.assignedAnnotator, req.user!._id);
    if (!isAssignedAnnotator && !isAdminOrSuper) {
      throw ApiError.forbidden('Only the assigned annotator can open an annotation draft for this task');
    }

    const dataset = task.dataset ? await Dataset.findById(task.dataset) : null;
    if (!dataset || dataset.processing.status !== 'completed') {
      throw ApiError.conflict('Audio preprocessing has not completed for this task yet');
    }

    const existingDraft = await Annotation.findOne({ task: task._id, user: req.user!._id, type: 'annotation', status: 'draft' });
    if (existingDraft) {
      res.status(200).json({ annotation: existingDraft });
      return;
    }

    const annotation = await Annotation.create({
      task: task._id,
      user: req.user!._id,
      type: 'annotation',
      rsmlText: task.rsmlTextOriginal,
    });

    if (task.status === 'unassigned') {
      task.status = 'annotation_in_progress';
      await task.save();
    }

    res.status(201).json({ annotation });
    return;
  }

  // type === 'review'
  if (!parentAnnotation) throw ApiError.badRequest('parentAnnotation is required for a review draft');
  const parent = await Annotation.findById(parentAnnotation);
  if (!parent || parent.task.toString() !== task._id.toString() || parent.type !== 'annotation') {
    throw ApiError.badRequest('parentAnnotation must be a submitted annotation on this task');
  }
  if (parent.status !== 'submitted') {
    throw ApiError.conflict('The annotation must be submitted before it can be reviewed');
  }
  if (isSameUser(parent.user, req.user!._id)) {
    throw ApiError.forbidden('You cannot review your own annotation');
  }

  const isAssignedReviewer = isSameUser(task.assignedReviewer, req.user!._id);
  if (!isAssignedReviewer && !isAdminOrSuper) {
    throw ApiError.forbidden('Only the assigned reviewer can open a review draft for this task');
  }

  const annotation = await Annotation.create({
    task: task._id,
    user: req.user!._id,
    type: 'review',
    parentAnnotation: parent._id,
  });

  if (task.status === 'annotated') {
    task.status = 'review_in_progress';
    await task.save();
  }

  res.status(201).json({ annotation });
});

export const getAnnotation = asyncHandler(async (req: Request, res: Response) => {
  const annotation = await Annotation.findById(req.params.id);
  if (!annotation) throw ApiError.notFound('Annotation not found');

  const task = await Task.findById(annotation.task);
  if (!task) throw ApiError.notFound('Task not found');
  await assertProjectAccess(req.user!, task.project);

  res.json({ annotation });
});

export const updateAnnotation = asyncHandler(async (req: Request, res: Response) => {
  const annotation = await Annotation.findById(req.params.id);
  if (!annotation) throw ApiError.notFound('Annotation not found');

  if (!isSameUser(annotation.user, req.user!._id)) {
    throw ApiError.forbidden('You can only edit your own annotation');
  }
  if (annotation.status !== 'draft') {
    throw ApiError.conflict('This annotation is locked and can no longer be edited');
  }

  annotation.editHistory.push({ editedAt: new Date(), previousText: annotation.rsmlText });
  annotation.rsmlText = req.body.rsmlText;
  await annotation.save();

  res.json({ annotation });
});

export const submitAnnotation = asyncHandler(async (req: Request, res: Response) => {
  const annotation = await Annotation.findById(req.params.id);
  if (!annotation) throw ApiError.notFound('Annotation not found');

  if (!isSameUser(annotation.user, req.user!._id)) {
    throw ApiError.forbidden('You can only submit your own annotation');
  }
  if (annotation.status !== 'draft') {
    throw ApiError.conflict('Only a draft annotation can be submitted');
  }

  annotation.status = 'submitted';
  annotation.submittedAt = new Date();
  await annotation.save();

  if (annotation.type === 'annotation') {
    const task = await Task.findById(annotation.task);
    if (task) {
      task.status = 'annotated';
      task.currentAnnotation = annotation._id;
      await task.save();
    }
  }

  res.json({ annotation });
});

const DECISION_TO_STATUS: Record<ReviewDecision, 'accepted' | 'rejected' | 'to_correct'> = {
  accept: 'accepted',
  reject: 'rejected',
  to_correct: 'to_correct',
};

export const reviewAnnotation = asyncHandler(async (req: Request, res: Response) => {
  const review = await Annotation.findById(req.params.id);
  if (!review) throw ApiError.notFound('Annotation not found');
  if (review.type !== 'review') throw ApiError.badRequest('This annotation is not a review row');
  if (review.status !== 'draft') throw ApiError.conflict('This review has already been submitted');

  const parent = await Annotation.findById(review.parentAnnotation);
  if (!parent) throw ApiError.notFound('Parent annotation not found');

  const task = await Task.findById(review.task);
  if (!task) throw ApiError.notFound('Task not found');
  const project = await assertProjectAccess(req.user!, task.project);

  const isAdminOrSuper = req.user!.role === 'super_admin' || project.members.some(
    (m) => m.user.toString() === req.user!._id.toString() && m.projectRole === 'admin'
  );
  const isAssignedReviewer = isSameUser(task.assignedReviewer, req.user!._id);
  if (!isAssignedReviewer && !isAdminOrSuper) {
    throw ApiError.forbidden('Only the assigned reviewer can submit a verdict for this task');
  }
  if (isSameUser(parent.user, req.user!._id)) {
    throw ApiError.forbidden('You cannot review your own annotation');
  }

  const { decision, reviewComment } = req.body as { decision: ReviewDecision; reviewComment?: string };
  const verdictStatus = DECISION_TO_STATUS[decision];

  review.status = verdictStatus;
  review.reviewComment = reviewComment ?? null;
  review.submittedAt = new Date();
  await review.save();

  if (decision === 'to_correct') {
    parent.status = 'draft';
    task.status = 'annotation_in_progress';
  } else {
    parent.status = verdictStatus;
    task.status = decision === 'accept' ? 'accepted' : 'rejected';
  }
  await parent.save();
  await task.save();

  res.json({ review, parentAnnotation: parent });
});
