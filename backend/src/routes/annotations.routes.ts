import { Router } from 'express';
import * as annotationsController from '../controllers/annotations.controller';
import { authenticate, requireApproved } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  createAnnotationSchema,
  reviewAnnotationSchema,
  updateAnnotationSchema,
} from '../validators/annotation.validators';

const router = Router();

router.use(authenticate, requireApproved);

router.post('/', validate(createAnnotationSchema), annotationsController.createAnnotation);
router.get('/:id', annotationsController.getAnnotation);
router.patch('/:id', validate(updateAnnotationSchema), annotationsController.updateAnnotation);
router.post('/:id/submit', annotationsController.submitAnnotation);
router.post('/:id/review', validate(reviewAnnotationSchema), annotationsController.reviewAnnotation);

export default router;
