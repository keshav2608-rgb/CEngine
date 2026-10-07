import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/errors.js';
import { getIO } from '../sockets/io-registry.js';

const MAX_DEVICES_PER_USER = 10;
// Base64 SPKI of an uncompressed P-256 public key is ~124 characters
const PUBLIC_KEY_RE = /^[A-Za-z0-9+/]{80,200}={0,2}$/;

const deviceSelect = {
  id: true,
  userId: true,
  publicKey: true,
  name: true,
  createdAt: true,
  lastSeenAt: true,
} as const;

/** Tell everyone who shares a room with this user (and the user's other tabs) to refetch keys. */
async function announceKeyChange(userId: string) {
  const io = getIO();
  if (!io) return;
  const memberships = await prisma.roomMember.findMany({ where: { userId }, select: { roomId: true } });
  const targets = [`user:${userId}`, ...memberships.map((m) => `room:${m.roomId}`)];
  io.to(targets).emit('keys:changed', { userId });
}

export class KeyService {
  static async registerDevice(userId: string, publicKey: string, name: string) {
    if (!PUBLIC_KEY_RE.test(publicKey)) throw new AppError('Invalid public key.', 400);

    // Never evict silently: that would make an existing device lose access to new messages
    const count = await prisma.device.count({ where: { userId } });
    if (count >= MAX_DEVICES_PER_USER) {
      throw new AppError(
        `You have ${MAX_DEVICES_PER_USER} devices set up. Remove one in Settings → Security, then try again.`,
        409
      );
    }

    const device = await prisma.device.create({
      data: { userId, publicKey, name: name.slice(0, 80) || 'Browser' },
      select: deviceSelect,
    });
    await announceKeyChange(userId);
    return device;
  }

  static async listOwnDevices(userId: string) {
    return prisma.device.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: deviceSelect,
    });
  }

  /** Mark a device as active (called when it connects). */
  static async touchDevice(userId: string, deviceId: string) {
    await prisma.device.updateMany({ where: { id: deviceId, userId }, data: { lastSeenAt: new Date() } });
  }

  /**
   * Public keys for the given users. Only returns keys for users who share a room with the
   * requester (or the requester themself), so the directory can't be used to enumerate people.
   */
  static async getDevicesForUsers(requesterId: string, userIds: string[]) {
    const unique = [...new Set(userIds)].slice(0, 200);
    if (unique.length === 0) return [];

    const myRooms = await prisma.roomMember.findMany({
      where: { userId: requesterId },
      select: { roomId: true },
    });
    const visible = await prisma.roomMember.findMany({
      where: { roomId: { in: myRooms.map((r) => r.roomId) }, userId: { in: unique } },
      select: { userId: true },
      distinct: ['userId'],
    });
    const allowed = new Set(visible.map((v) => v.userId));
    if (unique.includes(requesterId)) allowed.add(requesterId);

    return prisma.device.findMany({
      where: { userId: { in: [...allowed] } },
      orderBy: { createdAt: 'asc' },
      select: deviceSelect,
    });
  }

  static async removeDevice(userId: string, deviceId: string) {
    const result = await prisma.device.deleteMany({ where: { id: deviceId, userId } });
    if (result.count === 0) throw new AppError('Device not found.', 404);
    await announceKeyChange(userId);
  }
}
