import { Router } from 'express';
import * as tasksController from '../controllers/tasks.controller';
import { authenticate, requireApproved } from '../middleware/auth';
import { audioUpload } from '../middleware/upload';
import { validate } from '../middleware/validate';
import { assignTaskSchema, uploadAudioTaskSchema } from '../validators/task.validators';

const router = Router();

router.use(authenticate, requireApproved);

router.post(
  '/',
  audioUpload.single('audio'),
  validate(uploadAudioTaskSchema),
  tasksController.uploadAudioTask
);
router.get('/', tasksController.listTasks);
router.get('/:id', tasksController.getTask);
router.patch('/:id/assign', validate(assignTaskSchema), tasksController.assignTask);
router.get('/:id/annotations', tasksController.listTaskAnnotations);

export default router;
