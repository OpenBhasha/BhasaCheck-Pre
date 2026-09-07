import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Project } from '../models/Project';
import { User } from '../models/User';
import { Task } from '../models/Task';
import { Annotation } from '../models/Annotation';
import { Dataset } from '../models/Dataset';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

export const createProject = asyncHandler(async (req: Request, res: Response) => {
  const { name, description, language } = req.body;
  const project = await Project.create({
    name,
    description,
    language,
    createdBy: req.user!._id,
    members: [{ user: req.user!._id, projectRole: 'admin', addedAt: new Date() }],
  });
  res.status(201).json({ project });
});

export const listProjects = asyncHandler(async (req: Request, res: Response) => {
  const filter = req.user!.role === 'super_admin' ? {} : { 'members.user': req.user!._id };
  const projects = await Project.find(filter).sort({ createdAt: -1 });
  res.json({ projects });
});

export const getProject = asyncHandler(async (req: Request, res: Response) => {
  const project = req.project ?? (await Project.findById(req.params.id));
  if (!project) throw ApiError.notFound('Project not found');

  const memberDocs = await User.find({ _id: { $in: project.members.map((m) => m.user) } });
  const membersWithDetail = project.members.map((m) => {
    const user = memberDocs.find((u) => u._id.toString() === m.user.toString());
    return {
      user: user ? { id: user._id, name: user.name, email: user.email } : m.user,
      projectRole: m.projectRole,
      addedAt: m.addedAt,
    };
  });

  res.json({ project: { ...project.toObject(), members: membersWithDetail } });
});

export const updateProject = asyncHandler(async (req: Request, res: Response) => {
  const project = req.project ?? (await Project.findById(req.params.id));
  if (!project) throw ApiError.notFound('Project not found');

  const { name, description, status } = req.body;
  if (name !== undefined) project.name = name;
  if (description !== undefined) project.description = description;
  if (status !== undefined) project.status = status;
  await project.save();
  res.json({ project });
});

export const deleteProject = asyncHandler(async (req: Request, res: Response) => {
  const project = req.project ?? (await Project.findById(req.params.id));
  if (!project) throw ApiError.notFound('Project not found');

  const tasks = await Task.find({ project: project._id }).select('_id');
  const taskIds = tasks.map((t) => t._id);

  await Annotation.deleteMany({ task: { $in: taskIds } });
  await Dataset.deleteMany({ project: project._id });
  await Task.deleteMany({ project: project._id });
  await project.deleteOne();

  res.status(204).send();
});

export const addMember = asyncHandler(async (req: Request, res: Response) => {
  const project = req.project ?? (await Project.findById(req.params.id));
  if (!project) throw ApiError.notFound('Project not found');

  const { userId, projectRole } = req.body;
  if (!Types.ObjectId.isValid(userId)) throw ApiError.badRequest('Invalid user id');

  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  const already = project.members.some((m) => m.user.toString() === userId);
  if (already) throw ApiError.conflict('User is already a member of this project');

  project.members.push({ user: user._id, projectRole, addedAt: new Date() });
  await project.save();
  res.status(201).json({ project });
});

export const updateMemberRole = asyncHandler(async (req: Request, res: Response) => {
  const project = req.project ?? (await Project.findById(req.params.id));
  if (!project) throw ApiError.notFound('Project not found');

  const { userId } = req.params;
  const { projectRole } = req.body;

  const member = project.members.find((m) => m.user.toString() === userId);
  if (!member) throw ApiError.notFound('User is not a member of this project');

  member.projectRole = projectRole;
  await project.save();
  res.json({ project });
});

export const removeMember = asyncHandler(async (req: Request, res: Response) => {
  const project = req.project ?? (await Project.findById(req.params.id));
  if (!project) throw ApiError.notFound('Project not found');

  const { userId } = req.params;
  project.members = project.members.filter((m) => m.user.toString() !== userId);
  await project.save();
  res.status(204).send();
});

export const listProjectTasks = asyncHandler(async (req: Request, res: Response) => {
  const { status, assignedTo } = req.query;
  const filter: Record<string, unknown> = { project: req.params.id };
  if (status) filter.status = status;
  if (assignedTo) {
    filter.$or = [{ assignedAnnotator: assignedTo }, { assignedReviewer: assignedTo }];
  }
  const tasks = await Task.find(filter).sort({ createdAt: -1 }).populate('currentAnnotation');
  res.json({ tasks });
});

export const exportProject = asyncHandler(async (req: Request, res: Response) => {
  const format = (req.query.format as string) ?? 'json';
  const tasks = await Task.find({ project: req.params.id, status: 'accepted' }).populate(
    'currentAnnotation'
  );

  const rows = tasks.map((task) => ({
    taskId: task._id.toString(),
    audioUrl: task.audioUrl,
    language: task.language ?? '',
    speakerLabel: task.speakerLabel ?? '',
    rsmlText: (task.currentAnnotation as unknown as { rsmlText?: string } | null)?.rsmlText ?? '',
  }));

  if (format === 'csv') {
    const header = 'taskId,audioUrl,language,speakerLabel,rsmlText';
    const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines = rows.map((r) =>
      [r.taskId, r.audioUrl, r.language, r.speakerLabel, r.rsmlText].map(csvEscape).join(',')
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="project-${req.params.id}-export.csv"`);
    res.send([header, ...lines].join('\n'));
    return;
  }

  res.json({ rows });
});
