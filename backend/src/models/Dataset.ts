import { Schema, model, Document, Types } from 'mongoose';
import { ProcessingStatus } from '../types';

export interface IAudioRef {
  url: string;
  publicId: string;
  format?: string;
  durationSec?: number | null;
  fileSizeBytes?: number | null;
  sampleRate?: number | null;
  channels?: number | null;
}

export interface IProcessedAudioRef {
  url: string;
  publicId: string;
}

export interface IProcessingInfo {
  status: ProcessingStatus;
  progress: number;
  error: string | null;
  retryCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
  modelsUsed: {
    musicRemoval?: string;
    vad?: string;
    diarization?: string;
    transcription?: string;
  };
}

export interface IBinarySegment {
  startTime: number;
  endTime: number;
  isSpeech: boolean;
}

export interface ISpeakerSegment {
  startTime: number;
  endTime: number;
  speaker: string;
  overlappingSpeakers: string[];
}

export interface ITranscriptSegment {
  startTime: number;
  endTime: number;
  isSpeech: boolean;
  speaker: string | null;
  overlappingSpeakers: string[];
  language: string | null;
  text: string;
  transcriptionModel: string | null;
  confidence: number | null;
}

export interface IDataset extends Document {
  _id: Types.ObjectId;
  task: Types.ObjectId;
  project: Types.ObjectId;
  originalAudio: IAudioRef;
  processedAudio: IProcessedAudioRef | null;
  processing: IProcessingInfo;
  binarySegments: IBinarySegment[];
  speakerSegments: ISpeakerSegment[];
  transcriptSegments: ITranscriptSegment[];
  createdAt: Date;
  updatedAt: Date;
}

const audioRefSchema = new Schema<IAudioRef>(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    format: { type: String },
    durationSec: { type: Number, default: null },
    fileSizeBytes: { type: Number, default: null },
    sampleRate: { type: Number, default: null },
    channels: { type: Number, default: null },
  },
  { _id: false }
);

const processedAudioRefSchema = new Schema<IProcessedAudioRef>(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false }
);

const processingSchema = new Schema<IProcessingInfo>(
  {
    status: {
      type: String,
      enum: [
        'pending',
        'processing',
        'music_removal',
        'binary_segmentation',
        'speaker_diarization',
        'transcription',
        'completed',
        'failed',
      ],
      default: 'pending',
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    error: { type: String, default: null },
    retryCount: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    modelsUsed: {
      musicRemoval: { type: String },
      vad: { type: String },
      diarization: { type: String },
      transcription: { type: String },
    },
  },
  { _id: false }
);

const binarySegmentSchema = new Schema<IBinarySegment>(
  {
    startTime: { type: Number, required: true },
    endTime: { type: Number, required: true },
    isSpeech: { type: Boolean, required: true },
  },
  { _id: false }
);

const speakerSegmentSchema = new Schema<ISpeakerSegment>(
  {
    startTime: { type: Number, required: true },
    endTime: { type: Number, required: true },
    speaker: { type: String, required: true },
    overlappingSpeakers: { type: [String], default: [] },
  },
  { _id: false }
);

const transcriptSegmentSchema = new Schema<ITranscriptSegment>(
  {
    startTime: { type: Number, required: true },
    endTime: { type: Number, required: true },
    isSpeech: { type: Boolean, required: true },
    speaker: { type: String, default: null },
    overlappingSpeakers: { type: [String], default: [] },
    language: { type: String, default: null },
    text: { type: String, default: '' },
    transcriptionModel: { type: String, default: null },
    confidence: { type: Number, default: null },
  },
  { _id: false }
);

const datasetSchema = new Schema<IDataset>(
  {
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true, unique: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    originalAudio: { type: audioRefSchema, required: true },
    processedAudio: { type: processedAudioRefSchema, default: null },
    processing: { type: processingSchema, default: () => ({}) },
    binarySegments: { type: [binarySegmentSchema], default: [] },
    speakerSegments: { type: [speakerSegmentSchema], default: [] },
    transcriptSegments: { type: [transcriptSegmentSchema], default: [] },
  },
  { timestamps: true }
);

export const Dataset = model<IDataset>('Dataset', datasetSchema);
