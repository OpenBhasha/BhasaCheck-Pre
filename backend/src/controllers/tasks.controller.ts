import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Task } from '../models/Task';
import { Dataset } from '../models/Dataset';
import { Annotation } from '../models/Annotation';
import { assertProjectAccess } from '../middleware/authorize';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { processAndUploadAudio } from '../services/audio/audioUpload.service';
import { enqueueAudioProcessing } from '../queues/audioProcessing.queue';
import { logger } from '../config/logger';

export const uploadAudioTask = asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.query.projectId as string;
  if (!Types.ObjectId.isValid(projectId)) throw ApiError.badRequest('Invalid project id');
  await assertProjectAccess(req.user!, projectId, ['admin']);

  const file = req.file;
  if (!file) throw ApiError.badRequest('Missing audio file (field name "audio")');

  const { audioRef } = await processAndUploadAudio(file, projectId);
  const { language, speakerLabel } = req.body;

  const task = await Task.create({
    project: projectId,
    audioUrl: audioRef.url,
    audioDurationSec: audioRef.durationSec,
    language,
    speakerLabel,
    status: 'unassigned',
  });

  const dataset = await Dataset.create({
    task: task._id,
    project: projectId,
    originalAudio: audioRef,
    processing: { status: 'pending' },
  });

  task.dataset = dataset._id;
  await task.save();

  await enqueueAudioProcessing({ taskId: task._id.toString(), datasetId: dataset._id.toString(), language });
  logger.info(`Task ${task._id.toString()} created + queued for processing (project ${projectId})`);

  res.status(201).json({ task, dataset });
});

export const listTasks = asyncHandler(async (req: Request, res: Response) => {
  const { projectId, status, assignedTo } = req.query;
  if (!projectId || !Types.ObjectId.isValid(projectId as string)) {
    throw ApiError.badRequest('projectId query parameter is required');
  }
  await assertProjectAccess(req.user!, projectId as string);

  const filter: Record<string, unknown> = { project: projectId };
  if (status) filter.status = status;
  if (assignedTo) {
    filter.$or = [{ assignedAnnotator: assignedTo }, { assignedReviewer: assignedTo }];
  }

  const tasks = await Task.find(filter).sort({ createdAt: -1 });
  res.json({ tasks });
});

export const getTask = asyncHandler(async (req: Request, res: Response) => {
  const task = await Task.findById(req.params.id).populate('currentAnnotation');
  if (!task) throw ApiError.notFound('Task not found');
  await assertProjectAccess(req.user!, task.project);

  const dataset = task.dataset ? await Dataset.findById(task.dataset) : null;
  res.json({ task, dataset });
});

export const assignTask = asyncHandler(async (req: Request, res: Response) => {
  const task = await Task.findById(req.params.id);
  if (!task) throw ApiError.notFound('Task not found');
  const project = await assertProjectAccess(req.user!, task.project, ['admin']);

  const { assignedAnnotator, assignedReviewer } = req.body as {
    assignedAnnotator?: string | null;
    assignedReviewer?: string | null;
  };

  const memberHasRole = (userId: string, roles: string[]) =>
    project.members.some((m) => m.user.toString() === userId && roles.includes(m.projectRole));

  if (assignedAnnotator !== undefined) {
    if (assignedAnnotator && !memberHasRole(assignedAnnotator, ['annotator', 'admin'])) {
      throw ApiError.badRequest('assignedAnnotator must be a project member with role annotator or admin');
    }
    task.assignedAnnotator = assignedAnnotator ? new Types.ObjectId(assignedAnnotator) : null;
  }

  if (assignedReviewer !== undefined) {
    if (assignedReviewer && !memberHasRole(assignedReviewer, ['reviewer', 'admin'])) {
      throw ApiError.badRequest('assignedReviewer must be a project member with role reviewer or admin');
    }
    task.assignedReviewer = assignedReviewer ? new Types.ObjectId(assignedReviewer) : null;
  }

  if (
    task.assignedAnnotator &&
    task.assignedReviewer &&
    task.assignedAnnotator.toString() === task.assignedReviewer.toString()
  ) {
    throw ApiError.badRequest('assignedReviewer cannot be the same user as assignedAnnotator');
  }

  await task.save();
  res.json({ task });
});

export const listTaskAnnotations = asyncHandler(async (req: Request, res: Response) => {
  const task = await Task.findById(req.params.id);
  if (!task) throw ApiError.notFound('Task not found');
  await assertProjectAccess(req.user!, task.project);

  const annotations = await Annotation.find({ task: task._id }).sort({ createdAt: 1 });
  res.json({ annotations });
});
