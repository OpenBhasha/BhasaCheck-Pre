import { Schema, model, Document, Types } from 'mongoose';
import { ProjectRole, ProjectStatus } from '../types';

export interface IProjectMember {
  user: Types.ObjectId;
  projectRole: ProjectRole;
  addedAt: Date;
}

export interface IProject extends Document {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  language?: string;
  createdBy: Types.ObjectId;
  members: IProjectMember[];
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}

const projectMemberSchema = new Schema<IProjectMember>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    projectRole: { type: String, enum: ['admin', 'reviewer', 'annotator'], required: true },
    addedAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

const projectSchema = new Schema<IProject>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    language: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [projectMemberSchema], default: [] },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
  },
  { timestamps: true }
);

export const Project = model<IProject>('Project', projectSchema);
