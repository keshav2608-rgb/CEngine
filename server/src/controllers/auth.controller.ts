import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';
import { AppError } from '../utils/errors.js';

// In production the client (e.g. Vercel) and API (e.g. Render) live on different sites, so the
// refresh cookie must be SameSite=None (which browsers only accept together with Secure).
const isProd = process.env.NODE_ENV === 'production';
const clearRefreshCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? ('none' as const) : ('lax' as const),
};
const refreshCookieOptions = { ...clearRefreshCookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 };

export class AuthController {
  static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, displayName } = req.body;
      const result = await AuthService.register(email, password, displayName);

      // Set refresh token in httpOnly cookie
      res.cookie('refreshToken', result.refreshToken, refreshCookieOptions);

      res.status(201).json({
        success: true,
        message: 'Account created successfully. Please verify your email.',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);

      res.cookie('refreshToken', result.refreshToken, refreshCookieOptions);

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
      if (!refreshToken) {
        throw new AppError('Refresh token required.', 401);
      }

      const tokens = await AuthService.refresh(refreshToken);

      res.cookie('refreshToken', tokens.refreshToken, refreshCookieOptions);

      res.json({
        success: true,
        data: tokens,
      });
    } catch (err) {
      next(err);
    }
  }

  static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
      if (refreshToken) {
        await AuthService.logout(refreshToken);
      }

      res.clearCookie('refreshToken', clearRefreshCookieOptions);
      res.json({
        success: true,
        message: 'Logged out successfully.',
      });
    } catch (err) {
      next(err);
    }
  }

  static async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.body;
      if (!token) {
        throw new AppError('Verification token required.', 400);
      }

      await AuthService.verifyEmail(token);
      res.json({
        success: true,
        message: 'Email verified successfully.',
      });
    } catch (err) {
      next(err);
    }
  }

  static async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;
      if (!email) {
        throw new AppError('Email required.', 400);
      }

      await AuthService.requestPasswordReset(email);
      res.json({
        success: true,
        message: 'If the email exists, a password reset link has been dispatched.',
      });
    } catch (err) {
      next(err);
    }
  }

  static async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        throw new AppError('Token and new password are required.', 400);
      }

      await AuthService.resetPassword(token, password);
      res.json({
        success: true,
        message: 'Password reset successfully. You can now log in.',
      });
    } catch (err) {
      next(err);
    }
  }

  static async googleAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { googleId, email, displayName, avatarUrl } = req.body;
      if (!googleId || !email) {
        throw new AppError('Google profile credentials incomplete.', 400);
      }

      const result = await AuthService.googleAuth({
        googleId,
        email,
        displayName,
        avatarUrl,
      });

      res.cookie('refreshToken', result.refreshToken, refreshCookieOptions);

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async deleteAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      await AuthService.deleteAccount(userId);

      res.clearCookie('refreshToken', clearRefreshCookieOptions);
      res.json({
        success: true,
        message: 'Your account and all associated data have been permanently deleted.',
      });
    } catch (err) {
      next(err);
    }
  }
}
