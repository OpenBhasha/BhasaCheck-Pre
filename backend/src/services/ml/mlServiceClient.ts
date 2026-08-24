import { env } from '../../config/env';

export interface RunPipelineRequest {
  taskId: string;
  datasetId: string;
  audioUrl: string;
  language?: string;
}

export interface RunPipelineResponse {
  status: 'completed' | 'failed';
  error?: string;
}

/**
 * Kicks off the full preprocessing pipeline on the Python ML service and
 * waits for it to finish. The ML service reports per-stage progress back to
 * Node's own internal API as it goes (see routes/internal.routes.ts) so
 * Dataset stays up to date well before this call resolves; this response is
 * only the final completed/failed ack.
 */
export async function runPipeline(payload: RunPipelineRequest): Promise<RunPipelineResponse> {
  const response = await fetch(`${env.mlServiceUrl}/pipeline/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': env.internalServiceSecret,
    },
    body: JSON.stringify({
      ...payload,
      callbackUrl: `${env.internalCallbackUrl}/api/internal/datasets/${payload.datasetId}/stage`,
      callbackSecret: env.internalServiceSecret,
    }),
    // The pipeline runs synchronously on the ML side; a full run (music
    // removal + VAD + diarization + transcription) can legitimately take
    // several minutes for longer audio.
    signal: AbortSignal.timeout(30 * 60 * 1000),
  });

  const body = (await response.json().catch(() => ({}))) as { error?: string };

  if (!response.ok) {
    throw new Error(`ML service returned ${response.status}: ${body?.error ?? response.statusText}`);
  }

  return body as RunPipelineResponse;
}
