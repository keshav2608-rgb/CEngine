import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/errors.js';
import { sanitizeInput } from '../utils/sanitize.js';

export class UserService {
  /**
   * Get user profile by ID
   */
  static async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        isEmailVerified: true,
        createdAt: true,
        lastSeenAt: true,
      },
    });

    if (!user) {
      throw new AppError('User not found.', 404);
    }

    return user;
  }

  /**
   * Update profile details
   */
  static async updateProfile(
    userId: string,
    data: { displayName?: string; status?: string; avatarUrl?: string }
  ) {
    const updateData: { displayName?: string; status?: string; avatarUrl?: string } = {};

    if (data.displayName !== undefined) {
      updateData.displayName = sanitizeInput(data.displayName.trim());
      if (!updateData.displayName) {
        throw new AppError('Display name cannot be empty.', 400);
      }
    }

    if (data.status !== undefined) {
      updateData.status = sanitizeInput(data.status.trim()) || 'Available';
    }

    if (data.avatarUrl !== undefined) {
      updateData.avatarUrl = data.avatarUrl;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        isEmailVerified: true,
        updatedAt: true,
      },
    });

    return updated;
  }

  /**
   * Search users by display name or email (excluding current user)
   */
  static async searchUsers(query: string, currentUserId: string, limit = 20) {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return [];

    // Also exclude users blocked by current user
    const blocked = await prisma.block.findMany({
      where: { blockerId: currentUserId },
      select: { blockedId: true },
    });
    const blockedIds = blocked.map((b) => b.blockedId);

    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: currentUserId } },
          { id: { notIn: blockedIds } },
          {
            OR: [
              { displayName: { contains: cleanQuery, mode: 'insensitive' } },
              { email: { contains: cleanQuery, mode: 'insensitive' } },
            ],
          },
        ],
      },
      take: limit,
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        lastSeenAt: true,
      },
    });

    return users;
  }

  /**
   * Block a user
   */
  static async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new AppError('You cannot block yourself.', 400);
    }

    const targetUser = await prisma.user.findUnique({ where: { id: blockedId } });
    if (!targetUser) {
      throw new AppError('User not found.', 404);
    }

    const existing = await prisma.block.findUnique({
      where: {
        blockerId_blockedId: { blockerId, blockedId },
      },
    });

    if (existing) {
      return existing;
    }

    return prisma.block.create({
      data: { blockerId, blockedId },
    });
  }

  /**
   * Unblock a user
   */
  static async unblockUser(blockerId: string, blockedId: string) {
    await prisma.block.deleteMany({
      where: { blockerId, blockedId },
    });
  }

  /**
   * Get list of users blocked by the current user
   */
  static async getBlockedUsers(userId: string) {
    return prisma.block.findMany({
      where: { blockerId: userId },
      include: {
        blocked: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  /**
   * Check if a block relationship exists between two users
   */
  static async isBlocked(userAId: string, userBId: string): Promise<boolean> {
    const block = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userAId, blockedId: userBId },
          { blockerId: userBId, blockedId: userAId },
        ],
      },
    });
    return !!block;
  }

  /**
   * Report a user
   */
  static async reportUser(
    reporterId: string,
    reportedId: string,
    reason: string,
    details?: string
  ) {
    if (reporterId === reportedId) {
      throw new AppError('You cannot report yourself.', 400);
    }

    const cleanReason = sanitizeInput(reason.trim());
    if (!cleanReason) {
      throw new AppError('Report reason is required.', 400);
    }

    return prisma.report.create({
      data: {
        reporterId,
        reportedId,
        reason: cleanReason,
        details: details ? sanitizeInput(details.trim()) : undefined,
      },
    });
  }
}
