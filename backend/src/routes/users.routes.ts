import { Router } from 'express';
import * as usersController from '../controllers/users.controller';
import { authenticate, requireApproved } from '../middleware/auth';
import { requireGlobalRole } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { changePasswordSchema, changeRoleSchema, updateMeSchema } from '../validators/user.validators';

const router = Router();

router.use(authenticate);

router.get('/me', usersController.getMe);
router.patch('/me', validate(updateMeSchema), usersController.updateMe);
router.patch('/me/password', validate(changePasswordSchema), usersController.changeMyPassword);

router.use(requireApproved);

router.get('/', requireGlobalRole('admin', 'super_admin'), usersController.listUsers);
router.get('/pending', requireGlobalRole('admin', 'super_admin'), usersController.listPendingUsers);
router.post('/:id/approve', requireGlobalRole('admin', 'super_admin'), usersController.approveUser);
router.post('/:id/reject', requireGlobalRole('admin', 'super_admin'), usersController.rejectUser);
router.patch('/:id/deactivate', requireGlobalRole('admin', 'super_admin'), usersController.deactivateUser);
router.patch('/:id/reactivate', requireGlobalRole('admin', 'super_admin'), usersController.reactivateUser);
router.patch('/:id/role', requireGlobalRole('super_admin'), validate(changeRoleSchema), usersController.changeUserRole);

export default router;
