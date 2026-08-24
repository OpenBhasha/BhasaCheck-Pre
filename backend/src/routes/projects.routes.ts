import { Router } from 'express';
import * as projectsController from '../controllers/projects.controller';
import { authenticate, requireApproved } from '../middleware/auth';
import { requireGlobalRole, requireProjectMembership, requireProjectRole } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import {
  addMemberSchema,
  createProjectSchema,
  updateMemberSchema,
  updateProjectSchema,
} from '../validators/project.validators';

const router = Router();

router.use(authenticate, requireApproved);

router.post('/', requireGlobalRole('admin', 'super_admin'), validate(createProjectSchema), projectsController.createProject);
router.get('/', projectsController.listProjects);

router.get('/:id', requireProjectMembership(), projectsController.getProject);
router.patch('/:id', requireProjectRole(['admin']), validate(updateProjectSchema), projectsController.updateProject);
router.delete('/:id', requireProjectRole(['admin']), projectsController.deleteProject);

router.post('/:id/members', requireProjectRole(['admin']), validate(addMemberSchema), projectsController.addMember);
router.patch(
  '/:id/members/:userId',
  requireProjectRole(['admin']),
  validate(updateMemberSchema),
  projectsController.updateMemberRole
);
router.delete('/:id/members/:userId', requireProjectRole(['admin']), projectsController.removeMember);

router.get('/:id/tasks', requireProjectMembership(), projectsController.listProjectTasks);
router.get('/:id/export', requireProjectRole(['admin']), projectsController.exportProject);

export default router;
