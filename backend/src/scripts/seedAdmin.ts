/**
 * Bootstraps the first Super Admin account. Registration always creates
 * status=pending/role=annotator, and approving or promoting a user requires
 * an existing Admin/Super Admin — so the very first account has to be
 * created directly against the database instead of through the API.
 *
 * Usage:
 *   npm run seed:admin -- --email=admin@example.com --password=changeme --name="Site Admin"
 *   (or set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME env vars)
 *
 * Safe to re-run: if the email already exists, it is promoted to
 * super_admin/approved and its password is reset to the one provided.
 */
import { connectDB, disconnectDB } from '../config/db';
import { User } from '../models/User';
import { hashPassword } from '../utils/password';
import { logger } from '../config/logger';

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, '').split('=');
      return [key, rest.join('=')];
    })
  );

  const email = args.email ?? process.env.SEED_ADMIN_EMAIL;
  const password = args.password ?? process.env.SEED_ADMIN_PASSWORD;
  const name = args.name ?? process.env.SEED_ADMIN_NAME ?? 'Super Admin';

  if (!email || !password) {
    throw new Error(
      'Missing required email/password. Pass --email=... --password=... or set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD.'
    );
  }
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }

  return { email: email.toLowerCase(), password, name };
}

async function main() {
  const { email, password, name } = parseArgs();

  await connectDB();

  const passwordHash = await hashPassword(password);
  const existing = await User.findOne({ email });

  if (existing) {
    existing.passwordHash = passwordHash;
    existing.role = 'super_admin';
    existing.status = 'approved';
    existing.name = name;
    await existing.save();
    logger.info(`Updated existing user ${email} to super_admin/approved`);
  } else {
    await User.create({
      name,
      email,
      passwordHash,
      role: 'super_admin',
      status: 'approved',
    });
    logger.info(`Created super_admin user ${email}`);
  }

  await disconnectDB();
}

main().catch((err) => {
  logger.error('seed:admin failed', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
