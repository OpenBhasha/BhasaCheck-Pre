import { Schema, model, Document, Types } from 'mongoose';
import { AnnotationStatus, AnnotationType } from '../types';

export interface IEditHistoryEntry {
  editedAt: Date;
  previousText: string;
}

export interface IAnnotation extends Document {
  _id: Types.ObjectId;
  task: Types.ObjectId;
  user: Types.ObjectId;
  type: AnnotationType;
  rsmlText: string;
  parentAnnotation: Types.ObjectId | null;
  status: AnnotationStatus;
  reviewComment: string | null;
  editHistory: IEditHistoryEntry[];
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const editHistorySchema = new Schema<IEditHistoryEntry>(
  {
    editedAt: { type: Date, required: true },
    previousText: { type: String, required: true },
  },
  { _id: false }
);

const annotationSchema = new Schema<IAnnotation>(
  {
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['annotation', 'review'], required: true },
    rsmlText: { type: String, default: '' },
    parentAnnotation: { type: Schema.Types.ObjectId, ref: 'Annotation', default: null },
    status: {
      type: String,
      enum: ['draft', 'submitted', 'accepted', 'rejected', 'to_correct'],
      default: 'draft',
    },
    reviewComment: { type: String, default: null },
    editHistory: { type: [editHistorySchema], default: [] },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Annotation = model<IAnnotation>('Annotation', annotationSchema);
