import { Router } from 'express';
import * as internalController from '../controllers/internal.controller';
import { requireInternalSecret } from '../middleware/internalAuth';
import { validate } from '../middleware/validate';
import { stageUpdateSchema } from '../validators/internal.validators';

const router = Router();

router.use(requireInternalSecret);

router.post('/datasets/:datasetId/stage', validate(stageUpdateSchema), internalController.receiveStageUpdate);

export default router;
