import { z } from 'zod';

const audioRefSchema = z.object({ url: z.string(), publicId: z.string() });

const binarySegmentSchema = z.object({
  startTime: z.number(),
  endTime: z.number(),
  isSpeech: z.boolean(),
});

const speakerSegmentSchema = z.object({
  startTime: z.number(),
  endTime: z.number(),
  speaker: z.string(),
  overlappingSpeakers: z.array(z.string()).default([]),
});

const transcriptSegmentSchema = z.object({
  startTime: z.number(),
  endTime: z.number(),
  isSpeech: z.boolean(),
  speaker: z.string().nullable().default(null),
  overlappingSpeakers: z.array(z.string()).default([]),
  language: z.string().nullable().default(null),
  text: z.string().default(''),
  transcriptionModel: z.string().nullable().default(null),
  confidence: z.number().nullable().default(null),
});

export const stageUpdateSchema = z.object({
  body: z.object({
    stage: z.enum([
      'processing',
      'music_removal',
      'binary_segmentation',
      'speaker_diarization',
      'transcription',
      'completed',
      'failed',
    ]),
    progress: z.number().min(0).max(100).optional(),
    error: z.string().optional(),
    modelUsed: z.string().optional(),
    processedAudio: audioRefSchema.optional(),
    binarySegments: z.array(binarySegmentSchema).optional(),
    speakerSegments: z.array(speakerSegmentSchema).optional(),
    transcriptSegments: z.array(transcriptSegmentSchema).optional(),
  }),
});
