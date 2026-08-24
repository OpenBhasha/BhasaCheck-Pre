import { User } from '../src/models/User';
import { hashPassword } from '../src/utils/password';
import { signAccessToken } from '../src/utils/jwt';
import { GlobalRole, UserStatus } from '../src/types';

const DEFAULT_PASSWORD = 'password123';

export async function createUser(overrides: {
  email: string;
  password?: string;
  role?: GlobalRole;
  status?: UserStatus;
  name?: string;
}) {
  const passwordHash = await hashPassword(overrides.password ?? DEFAULT_PASSWORD);
  return User.create({
    name: overrides.name ?? 'Test User',
    email: overrides.email,
    passwordHash,
    role: overrides.role ?? 'annotator',
    status: overrides.status ?? 'approved',
  });
}

export function authHeader(user: InstanceType<typeof User>): { Authorization: string } {
  const token = signAccessToken(user._id.toString(), user.role, user.status);
  return { Authorization: `Bearer ${token}` };
}
