import { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { Project, IProject } from '../models/Project';
import { IUser } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { GlobalRole, ProjectRole } from '../types';

/**
 * Plain (non-middleware) helpers for controllers whose route param isn't the
 * project id directly (e.g. task-scoped routes) and so need to resolve/check
 * project access explicitly rather than via the :id-based middleware below.
 */
export async function assertProjectAccess(
  user: IUser,
  projectId: Types.ObjectId | string,
  allowedRoles?: ProjectRole[]
): Promise<IProject> {
  const project = await Project.findById(projectId);
  if (!project) throw ApiError.notFound('Project not found');

  if (user.role === 'super_admin') return project;

  const membership = project.members.find((m) => m.user.toString() === user._id.toString());
  if (!membership) throw ApiError.forbidden('Not a member of this project');
  if (allowedRoles && !allowedRoles.includes(membership.projectRole)) {
    throw ApiError.forbidden('Insufficient project role');
  }
  return project;
}

/** Restricts a route to users whose global role is one of `roles`. */
export function requireGlobalRole(...roles: GlobalRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw ApiError.forbidden('Insufficient role');
    }
    next();
  };
}

/**
 * Restricts a route to members of the project identified by `paramName`
 * (defaults to req.params.id, falling back to req.params.projectId), whose
 * projectRole is one of `roles`. Super Admin always bypasses.
 * Attaches the resolved project doc to req.project.
 */
export function requireProjectRole(roles: ProjectRole[], paramName?: string) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw ApiError.unauthorized();
    if (req.user.role === 'super_admin') return next();

    const projectId = paramName ? req.params[paramName] : req.params.id ?? req.params.projectId;
    if (!projectId || !Types.ObjectId.isValid(projectId)) {
      throw ApiError.badRequest('Invalid project id');
    }

    const project = await Project.findById(projectId);
    if (!project) throw ApiError.notFound('Project not found');

    const membership = project.members.find((m) => m.user.toString() === req.user!._id.toString());
    if (!membership || !roles.includes(membership.projectRole)) {
      throw ApiError.forbidden('Insufficient project role');
    }

    req.project = project;
    next();
  });
}

/** Restricts a route to any member of the project (or Super Admin). */
export function requireProjectMembership(paramName?: string) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw ApiError.unauthorized();
    if (req.user.role === 'super_admin') return next();

    const projectId = paramName ? req.params[paramName] : req.params.id ?? req.params.projectId;
    if (!projectId || !Types.ObjectId.isValid(projectId)) {
      throw ApiError.badRequest('Invalid project id');
    }

    const project = await Project.findById(projectId);
    if (!project) throw ApiError.notFound('Project not found');

    const isMember = project.members.some((m) => m.user.toString() === req.user!._id.toString());
    if (!isMember) {
      throw ApiError.forbidden('Not a member of this project');
    }

    req.project = project;
    next();
  });
}
