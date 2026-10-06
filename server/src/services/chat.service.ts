import crypto from 'crypto';
import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/errors.js';
import { sanitizeInput } from '../utils/sanitize.js';
import { UserService } from './user.service.js';

export class ChatService {
  /**
   * Find or create a direct (1:1) chat room between two users
   */
  static async getOrCreateDirectRoom(userAId: string, userBId: string) {
    if (userAId === userBId) {
      throw new AppError('Cannot start a chat with yourself.', 400);
    }

    // Check if blocked
    const blocked = await UserService.isBlocked(userAId, userBId);
    if (blocked) {
      throw new AppError('Cannot create chat with this user due to block settings.', 403);
    }

    // Find if a 1:1 room already exists between these two users
    const existingRoom = await prisma.room.findFirst({
      where: {
        isGroup: false,
        AND: [
          { members: { some: { userId: userAId } } },
          { members: { some: { userId: userBId } } },
        ],
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
                status: true,
                lastSeenAt: true,
              },
            },
          },
        },
      },
    });

    if (existingRoom) {
      return existingRoom;
    }

    // Create new direct room
    const newRoom = await prisma.room.create({
      data: {
        isGroup: false,
        members: {
          create: [
            { userId: userAId, role: 'MEMBER' },
            { userId: userBId, role: 'MEMBER' },
          ],
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
                status: true,
                lastSeenAt: true,
              },
            },
          },
        },
      },
    });

    return newRoom;
  }

  /**
   * Create a new group chat room
   */
  static async createGroup(
    creatorId: string,
    data: {
      name: string;
      description?: string;
      avatarUrl?: string;
      memberIds?: string[];
    }
  ) {
    const cleanName = sanitizeInput(data.name.trim());
    if (!cleanName) {
      throw new AppError('Group name is required.', 400);
    }

    // Generate unique invite code for browser-based joining
    const inviteCode = crypto.randomBytes(6).toString('hex');

    // Filter out creatorId from memberIds to avoid duplicate
    const additionalMembers = (data.memberIds || []).filter((id) => id !== creatorId);

    const room = await prisma.room.create({
      data: {
        isGroup: true,
        name: cleanName,
        description: data.description ? sanitizeInput(data.description.trim()) : undefined,
        avatarUrl: data.avatarUrl,
        inviteCode,
        members: {
          create: [
            { userId: creatorId, role: 'OWNER' },
            ...additionalMembers.map((mId) => ({
              userId: mId,
              role: 'MEMBER' as const,
            })),
          ],
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
                status: true,
                lastSeenAt: true,
              },
            },
          },
        },
      },
    });

    return room;
  }

  /**
   * Get all chat rooms for a user, with unread count and latest message
   */
  static async getUserRooms(userId: string) {
    const memberships = await prisma.roomMember.findMany({
      where: { userId },
      select: { roomId: true },
    });

    const roomIds = memberships.map((m) => m.roomId);

    const rooms = await prisma.room.findMany({
      where: { id: { in: roomIds } },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
                status: true,
                lastSeenAt: true,
              },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: {
            sender: {
              select: {
                id: true,
                displayName: true,
              },
            },
            attachments: true,
            receipts: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Calculate unread counts for each room
    const roomsWithUnread = await Promise.all(
      rooms.map(async (room) => {
        const unreadCount = await prisma.messageReceipt.count({
          where: {
            userId,
            message: { roomId: room.id },
            status: { not: 'READ' },
          },
        });

        const lastMessage = room.messages[0] || null;

        return {
          id: room.id,
          isGroup: room.isGroup,
          name: room.name,
          description: room.description,
          avatarUrl: room.avatarUrl,
          inviteCode: room.inviteCode,
          createdAt: room.createdAt,
          updatedAt: room.updatedAt,
          members: room.members,
          lastMessage,
          unreadCount,
        };
      })
    );

    return roomsWithUnread;
  }

  /**
   * Get single room details
   */
  static async getRoom(roomId: string, userId: string) {
    const membership = await prisma.roomMember.findUnique({
      where: {
        roomId_userId: { roomId, userId },
      },
    });

    if (!membership) {
      throw new AppError('You are not a member of this chat.', 403);
    }

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
                status: true,
                lastSeenAt: true,
              },
            },
          },
        },
      },
    });

    if (!room) {
      throw new AppError('Chat room not found.', 404);
    }

    return room;
  }

  /**
   * Update group room info
   */
  static async updateGroup(
    roomId: string,
    userId: string,
    data: { name?: string; description?: string; avatarUrl?: string }
  ) {
    const membership = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });

    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
      throw new AppError('Only group owners or admins can edit group settings.', 403);
    }

    const updateData: { name?: string; description?: string; avatarUrl?: string } = {};

    if (data.name !== undefined) {
      updateData.name = sanitizeInput(data.name.trim());
      if (!updateData.name) {
        throw new AppError('Group name cannot be empty.', 400);
      }
    }

    if (data.description !== undefined) {
      updateData.description = sanitizeInput(data.description.trim());
    }

    if (data.avatarUrl !== undefined) {
      updateData.avatarUrl = data.avatarUrl;
    }

    return prisma.room.update({
      where: { id: roomId },
      data: updateData,
    });
  }

  /**
   * Add members to group
   */
  static async addMembers(roomId: string, requesterId: string, userIdsToAdd: string[]) {
    const requester = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: requesterId } },
    });

    if (!requester || (requester.role !== 'OWNER' && requester.role !== 'ADMIN')) {
      throw new AppError('Only group owners or admins can add members.', 403);
    }

    const currentMembers = await prisma.roomMember.findMany({
      where: { roomId },
      select: { userId: true },
    });
    const currentMemberIds = new Set(currentMembers.map((m) => m.userId));

    const newMemberIds = userIdsToAdd.filter((id) => !currentMemberIds.has(id));

    if (newMemberIds.length === 0) {
      return;
    }

    await prisma.roomMember.createMany({
      data: newMemberIds.map((userId) => ({
        roomId,
        userId,
        role: 'MEMBER',
      })),
    });
  }

  /**
   * Remove member or leave group
   */
  static async removeMember(roomId: string, requesterId: string, targetUserId: string) {
    const requester = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: requesterId } },
    });

    if (!requester) {
      throw new AppError('You are not a member of this chat.', 403);
    }

    const target = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: targetUserId } },
    });

    if (!target) {
      throw new AppError('Target user is not a member of this group.', 404);
    }

    // Leaving group
    if (requesterId === targetUserId) {
      if (requester.role === 'OWNER') {
        // If owner is leaving, check if there are other members to promote
        const otherMembers = await prisma.roomMember.findMany({
          where: { roomId, userId: { not: requesterId } },
          orderBy: { joinedAt: 'asc' },
        });

        if (otherMembers.length > 0) {
          // Promote first admin or oldest member to owner
          const admin = otherMembers.find((m) => m.role === 'ADMIN');
          const successorId = admin ? admin.userId : otherMembers[0].userId;

          await prisma.roomMember.update({
            where: { roomId_userId: { roomId, userId: successorId } },
            data: { role: 'OWNER' },
          });
        }
      }

      await prisma.roomMember.delete({
        where: { roomId_userId: { roomId, userId: requesterId } },
      });
      return;
    }

    // Removing another member
    if (requester.role === 'MEMBER') {
      throw new AppError('Regular members cannot remove other members.', 403);
    }

    if (requester.role === 'ADMIN' && (target.role === 'OWNER' || target.role === 'ADMIN')) {
      throw new AppError('Admins cannot remove other admins or the group owner.', 403);
    }

    await prisma.roomMember.delete({
      where: { roomId_userId: { roomId, userId: targetUserId } },
    });
  }

  /**
   * Join group directly via invite code
   */
  static async joinByInviteCode(inviteCode: string, userId: string) {
    const room = await prisma.room.findUnique({
      where: { inviteCode },
      include: { members: true },
    });

    if (!room) {
      throw new AppError('Invalid or expired invite link.', 404);
    }

    const alreadyMember = room.members.some((m) => m.userId === userId);
    if (alreadyMember) {
      return room;
    }

    await prisma.roomMember.create({
      data: {
        roomId: room.id,
        userId,
        role: 'MEMBER',
      },
    });

    return room;
  }
}
