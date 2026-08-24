import { Request, Response } from 'express';
import { User } from '../models/User';
import { RefreshToken } from '../models/RefreshToken';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { comparePassword, hashPassword } from '../utils/password';
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { env } from '../config/env';
import { logger } from '../config/logger';

function refreshExpiryDate(): Date {
  const match = /^(\d+)([smhd])$/.exec(env.jwtRefreshExpiresIn);
  const amount = match ? Number(match[1]) : 7;
  const unit = match ? match[2] : 'd';
  const multiplier = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 86_400_000;
  return new Date(Date.now() + amount * multiplier);
}

async function issueTokenPair(userId: string, role: 'super_admin' | 'admin' | 'reviewer' | 'annotator', status: string) {
  const accessToken = signAccessToken(userId, role, status as never);
  const refreshToken = signRefreshToken(userId);
  await RefreshToken.create({
    user: userId,
    tokenHash: hashToken(refreshToken),
    expiresAt: refreshExpiryDate(),
  });
  return { accessToken, refreshToken };
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password } = req.body;

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const passwordHash = await hashPassword(password);
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    passwordHash,
    role: 'annotator',
    status: 'pending',
  });

  logger.info(`User registered: ${user.email} (${user._id.toString()})`);

  res.status(201).json({
    user: { id: user._id, name: user.name, email: user.email, role: user.role, status: user.status },
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user) {
    logger.warn(`Login failed: no account for ${email}`);
    throw ApiError.unauthorized('Invalid email or password');
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    logger.warn(`Login failed: wrong password for ${email}`);
    throw ApiError.unauthorized('Invalid email or password');
  }

  logger.info(`User logged in: ${user.email} (${user._id.toString()})`);
  const tokens = await issueTokenPair(user._id.toString(), user.role, user.status);
  res.json({
    ...tokens,
    user: { id: user._id, name: user.name, email: user.email, role: user.role, status: user.status },
  });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const tokenHash = hashToken(refreshToken);
  const stored = await RefreshToken.findOne({ tokenHash, user: payload.sub });
  if (!stored || stored.revoked || stored.expiresAt < new Date()) {
    logger.warn(`Refresh token rejected for user ${payload.sub}`);
    throw ApiError.unauthorized('Refresh token is no longer valid');
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    throw ApiError.unauthorized('User no longer exists');
  }

  stored.revoked = true;
  await stored.save();

  const tokens = await issueTokenPair(user._id.toString(), user.role, user.status);
  res.json(tokens);
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    const tokenHash = hashToken(refreshToken);
    await RefreshToken.updateOne({ tokenHash }, { revoked: true });
  }
  res.status(204).send();
});
