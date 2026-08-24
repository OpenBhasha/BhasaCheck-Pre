import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { applyStageUpdate } from '../services/ml/audioProcessing.service';
import { logger } from '../config/logger';

export const receiveStageUpdate = asyncHandler(async (req: Request, res: Response) => {
  const { stage, error } = req.body as { stage: string; error?: string };
  if (stage === 'failed') {
    logger.error(`Dataset ${req.params.datasetId} processing failed: ${error}`);
  } else {
    logger.info(`Dataset ${req.params.datasetId} stage update: ${stage}`);
  }

  await applyStageUpdate(req.params.datasetId, req.body);
  res.status(204).send();
});
