import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { comparePassword, hashPassword } from '../utils/password';

function serializeUser(user: InstanceType<typeof User>) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    approvedBy: user.approvedBy,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  res.json({ user: serializeUser(req.user!) });
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body;
  if (name) req.user!.name = name;
  await req.user!.save();
  res.json({ user: serializeUser(req.user!) });
});

export const changeMyPassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user!._id).select('+passwordHash');
  const valid = await comparePassword(currentPassword, user!.passwordHash);
  if (!valid) {
    throw ApiError.unauthorized('Current password is incorrect');
  }
  user!.passwordHash = await hashPassword(newPassword);
  await user!.save();
  res.status(204).send();
});

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const filter =
    req.user!.role === 'super_admin' ? {} : { role: { $nin: ['admin', 'super_admin'] } };
  const users = await User.find(filter).sort({ createdAt: -1 });
  res.json({ users: users.map(serializeUser) });
});

export const listPendingUsers = asyncHandler(async (_req: Request, res: Response) => {
  const users = await User.find({ status: 'pending' }).sort({ createdAt: 1 });
  res.json({ users: users.map(serializeUser) });
});

async function findManageableTarget(req: Request): Promise<InstanceType<typeof User>> {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) throw ApiError.badRequest('Invalid user id');
  const target = await User.findById(id);
  if (!target) throw ApiError.notFound('User not found');

  if (req.user!.role === 'admin' && ['admin', 'super_admin'].includes(target.role)) {
    throw ApiError.forbidden('Admins cannot manage other Admin/Super Admin accounts');
  }
  return target;
}

export const approveUser = asyncHandler(async (req: Request, res: Response) => {
  const target = await findManageableTarget(req);
  target.status = 'approved';
  target.approvedBy = req.user!._id;
  await target.save();
  res.json({ user: serializeUser(target) });
});

export const rejectUser = asyncHandler(async (req: Request, res: Response) => {
  const target = await findManageableTarget(req);
  target.status = 'rejected';
  await target.save();
  res.json({ user: serializeUser(target) });
});

export const deactivateUser = asyncHandler(async (req: Request, res: Response) => {
  const target = await findManageableTarget(req);
  target.status = 'deactivated';
  await target.save();
  res.json({ user: serializeUser(target) });
});

export const reactivateUser = asyncHandler(async (req: Request, res: Response) => {
  const target = await findManageableTarget(req);
  target.status = 'approved';
  await target.save();
  res.json({ user: serializeUser(target) });
});

export const changeUserRole = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { role } = req.body;
  if (!Types.ObjectId.isValid(id)) throw ApiError.badRequest('Invalid user id');

  const target = await User.findById(id);
  if (!target) throw ApiError.notFound('User not found');

  target.role = role;
  await target.save();
  res.json({ user: serializeUser(target) });
});
