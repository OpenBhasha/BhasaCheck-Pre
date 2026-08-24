import { Schema, model, Document, Types } from 'mongoose';
import { TaskStatus } from '../types';

export interface ITask extends Document {
  _id: Types.ObjectId;
  project: Types.ObjectId;
  dataset: Types.ObjectId | null;
  audioUrl: string;
  audioDurationSec: number | null;
  rsmlTextOriginal: string;
  language?: string;
  speakerLabel?: string;
  assignedAnnotator: Types.ObjectId | null;
  assignedReviewer: Types.ObjectId | null;
  status: TaskStatus;
  currentAnnotation: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<ITask>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    dataset: { type: Schema.Types.ObjectId, ref: 'Dataset', default: null },
    audioUrl: { type: String, required: true },
    audioDurationSec: { type: Number, default: null },
    rsmlTextOriginal: { type: String, default: '' },
    language: { type: String, trim: true },
    speakerLabel: { type: String, trim: true },
    assignedAnnotator: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    assignedReviewer: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: {
      type: String,
      enum: [
        'unassigned',
        'annotation_in_progress',
        'annotated',
        'review_in_progress',
        'accepted',
        'rejected',
      ],
      default: 'unassigned',
    },
    currentAnnotation: { type: Schema.Types.ObjectId, ref: 'Annotation', default: null },
  },
  { timestamps: true }
);

taskSchema.index({ project: 1, status: 1 });
taskSchema.index({ assignedAnnotator: 1 });
taskSchema.index({ assignedReviewer: 1 });

export const Task = model<ITask>('Task', taskSchema);
