import { HydratedDocument } from 'mongoose';
import { IUser } from '../models/User';
import { IProject } from '../models/Project';

declare global {
  namespace Express {
    interface Request {
      user?: HydratedDocument<IUser>;
      project?: HydratedDocument<IProject>;
    }
  }
}

export {};
