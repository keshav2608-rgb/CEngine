import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { prisma } from '../db/prisma.js';
import { config } from '../config/index.js';
import { AppError } from '../utils/errors.js';
import { sanitizeInput } from '../utils/sanitize.js';

export interface TokenPayload {
  userId: string;
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
    status: string;
    isEmailVerified: boolean;
  };
}

export class AuthService {
  /**
   * Generates JWT access and refresh token pair
   */
  static generateTokens(payload: TokenPayload): { accessToken: string; refreshToken: string } {
    const accessToken = jwt.sign(payload, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiresIn as jwt.SignOptions['expiresIn'],
    });

    const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'],
    });

    return { accessToken, refreshToken };
  }

  /**
   * Register a new user with email and password
   */
  static async register(email: string, password: string, displayName: string): Promise<AuthTokens> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanDisplayName = sanitizeInput(displayName.trim());

    if (!cleanEmail || !password || !cleanDisplayName) {
      throw new AppError('Email, password, and display name are required.', 400);
    }

    if (password.length < 6) {
      throw new AppError('Password must be at least 6 characters long.', 400);
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (existingUser) {
      throw new AppError('An account with this email already exists.', 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email: cleanEmail,
        passwordHash,
        displayName: cleanDisplayName,
        status: 'Available',
        // In local development, we can auto-verify or generate verification token
        isEmailVerified: false,
      },
    });

    // Create verification token (valid for 24 hours)
    const verificationToken = randomUUID();
    await prisma.verificationToken.create({
      data: {
        token: verificationToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // In dev, log verification link to console for easy testing
    console.log(`[Verification Email] Link for ${user.email}: ${config.clientUrl}/verify-email?token=${verificationToken}`);

    const { accessToken, refreshToken } = this.generateTokens({
      userId: user.id,
      email: user.email,
    });

    // Store refresh token in DB
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        status: user.status,
        isEmailVerified: user.isEmailVerified,
      },
    };
  }

  /**
   * Log in an existing user
   */
  static async login(email: string, password: string): Promise<AuthTokens> {
    const cleanEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (!user || !user.passwordHash) {
      throw new AppError('Invalid email or password.', 401);
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError('Invalid email or password.', 401);
    }

    // Update last seen
    await prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    });

    const { accessToken, refreshToken } = this.generateTokens({
      userId: user.id,
      email: user.email,
    });

    // Save refresh token
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        status: user.status,
        isEmailVerified: user.isEmailVerified,
      },
    };
  }

  /**
   * Refresh JWT token pair with token rotation
   */
  static async refresh(oldRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    if (!oldRefreshToken) {
      throw new AppError('Refresh token required.', 400);
    }

    let payload: TokenPayload;
    try {
      payload = jwt.verify(oldRefreshToken, config.jwt.refreshSecret) as TokenPayload;
    } catch {
      throw new AppError('Invalid or expired refresh token.', 401);
    }

    // Check database record
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: oldRefreshToken },
    });

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
      throw new AppError('Refresh token is invalid, expired, or revoked.', 401);
    }

    // Revoke old refresh token (rotation)
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    const { accessToken, refreshToken } = this.generateTokens({
      userId: payload.userId,
      email: payload.email,
    });

    // Save new refresh token
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: payload.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  /**
   * Revoke refresh token on logout
   */
  static async logout(refreshToken: string): Promise<void> {
    if (!refreshToken) return;
    try {
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Ignore if token doesn't exist
    }
  }

  /**
   * Verify email via token
   */
  static async verifyEmail(token: string): Promise<boolean> {
    const record = await prisma.verificationToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!record || record.expiresAt < new Date()) {
      throw new AppError('Invalid or expired email verification link.', 400);
    }

    await prisma.user.update({
      where: { id: record.userId },
      data: { isEmailVerified: true },
    });

    await prisma.verificationToken.delete({
      where: { id: record.id },
    });

    return true;
  }

  /**
   * Request password reset token
   */
  static async requestPasswordReset(email: string): Promise<void> {
    const cleanEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });

    // Do not reveal whether user exists
    if (!user) return;

    const resetToken = randomUUID();
    await prisma.passwordResetToken.create({
      data: {
        token: resetToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    console.log(`[Password Reset] Link for ${user.email}: ${config.clientUrl}/reset-password?token=${resetToken}`);
  }

  /**
   * Reset password with valid token
   */
  static async resetPassword(token: string, newPassword: string): Promise<void> {
    if (newPassword.length < 6) {
      throw new AppError('Password must be at least 6 characters long.', 400);
    }

    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetRecord || resetRecord.expiresAt < new Date()) {
      throw new AppError('Invalid or expired password reset token.', 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: resetRecord.userId },
      data: { passwordHash },
    });

    // Revoke all existing refresh tokens for security
    await prisma.refreshToken.updateMany({
      where: { userId: resetRecord.userId },
      data: { revokedAt: new Date() },
    });

    // Delete token
    await prisma.passwordResetToken.delete({
      where: { id: resetRecord.id },
    });
  }

  /**
   * Google Sign-in / Sign-up
   */
  static async googleAuth(googleProfile: {
    googleId: string;
    email: string;
    displayName: string;
    avatarUrl?: string;
  }): Promise<AuthTokens> {
    const cleanEmail = googleProfile.email.trim().toLowerCase();

    let user = await prisma.user.findFirst({
      where: {
        OR: [{ googleId: googleProfile.googleId }, { email: cleanEmail }],
      },
    });

    if (!user) {
      // Create user
      user = await prisma.user.create({
        data: {
          email: cleanEmail,
          googleId: googleProfile.googleId,
          displayName: sanitizeInput(googleProfile.displayName || 'Google User'),
          avatarUrl: googleProfile.avatarUrl || null,
          isEmailVerified: true,
          status: 'Available',
        },
      });
    } else {
      // Update googleId if matched by email
      if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: googleProfile.googleId,
            isEmailVerified: true,
            avatarUrl: user.avatarUrl || googleProfile.avatarUrl,
          },
        });
      }
    }

    const { accessToken, refreshToken } = this.generateTokens({
      userId: user.id,
      email: user.email,
    });

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        status: user.status,
        isEmailVerified: user.isEmailVerified,
      },
    };
  }

  /**
   * Delete account and all user data (Privacy requirement)
   */
  static async deleteAccount(userId: string): Promise<void> {
    // Prisma cascading deletes will remove tokens, receipts, memberships, blocks, etc.
    await prisma.user.delete({
      where: { id: userId },
    });
  }
}
