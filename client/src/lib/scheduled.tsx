'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { getSocket } from './socket';
import { useAuth } from './auth-context';
import { useChat } from './chat-context';
import { e2ee, Envelope, EncryptedAttachment, StickerRef } from './e2ee';

export interface ScheduledMessage {
  id: string;
  roomId: string;
  content: string | null;
  attachments: EncryptedAttachment[] | null;
  e2ee?: Envelope | null;
  /** Client-only: set when this device can't decrypt the scheduled message. */
  unreadable?: boolean;
  sticker?: StickerRef;
  replyToId: string | null;
  scheduledFor: string;
  status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED';
  error: string | null;
}

interface ScheduledContextType {
  /** Pending and failed scheduled messages, soonest first. */
  items: ScheduledMessage[];
  byRoom: Record<string, ScheduledMessage[]>;
  schedule: (input: {
    roomId: string;
    memberIds: string[];
    content?: string;
    attachments?: EncryptedAttachment[];
    replyToId?: string;
    scheduledFor: Date;
  }) => Promise<void>;
  reschedule: (id: string, patch: { content?: string; scheduledFor?: Date }) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  sendNow: (id: string) => Promise<void>;
}

const ScheduledContext = createContext<ScheduledContextType | undefined>(undefined);

export function ScheduledProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const { rooms } = useChat();
  const [items, setItems] = useState<ScheduledMessage[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get('/messages/scheduled');
      const raw: ScheduledMessage[] = res.data?.data || [];
      const me = userId;
      // Your scheduled messages are encrypted to your own devices too, so they can be shown here
      const decrypted = await Promise.all(
        raw.map(async (item) => {
          if (!item.e2ee || !me) return item;
          const r = await e2ee.decrypt(item.e2ee, me, item.roomId);
          if (r.state !== 'ok') return { ...item, content: null, unreadable: true };
          return {
            ...item,
            content: r.payload?.text ?? null,
            attachments: r.payload?.attachments ?? null,
            sticker: r.payload?.sticker,
          };
        })
      );
      setItems(decrypted);
    } catch {
      // Feature unavailable (e.g. server not migrated yet): keep the list empty
    }
  }, [userId]);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sets state after the request resolves
    refresh();
    const socket = getSocket();
    if (!socket) return;
    const onChanged = () => refresh();
    socket.on('scheduled:changed', onChanged);
    socket.on('session:ready', onChanged);
    return () => {
      socket.off('scheduled:changed', onChanged);
      socket.off('session:ready', onChanged);
    };
  }, [user, refresh]);

  const schedule = useCallback<ScheduledContextType['schedule']>(
    async ({ roomId, memberIds, content, attachments, replyToId, scheduledFor }) => {
      // Encrypted now, for the members at schedule time; the server only stores the envelope
      const { envelope } = await e2ee.encryptForMembers(
        memberIds,
        {
          text: content || undefined,
          attachments: attachments?.length ? attachments : undefined,
        },
        roomId
      );
      await api.post('/messages/scheduled', {
        roomId,
        e2ee: envelope,
        replyToId,
        scheduledFor: scheduledFor.toISOString(),
      });
      await refresh();
    },
    [refresh]
  );

  const reschedule = useCallback<ScheduledContextType['reschedule']>(
    async (id, patch) => {
      let envelope: Envelope | undefined;
      if (patch.content !== undefined) {
        // Edited text is re-encrypted for the room's current members
        const item = items.find((i) => i.id === id);
        const room = rooms.find((r) => r.id === item?.roomId);
        if (!item || !room) throw new Error('Scheduled message not found');
        envelope = (
          await e2ee.encryptForMembers(
            room.members.map((m) => m.userId),
            {
              text: patch.content || undefined,
              attachments: item.attachments?.length ? item.attachments : undefined,
              sticker: item.sticker,
            },
            item.roomId
          )
        ).envelope;
      }
      await api.patch(`/messages/scheduled/${id}`, {
        e2ee: envelope,
        scheduledFor: patch.scheduledFor?.toISOString(),
      });
      await refresh();
    },
    [refresh, items, rooms]
  );

  const cancel = useCallback(
    async (id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      try {
        await api.delete(`/messages/scheduled/${id}`);
      } finally {
        await refresh();
      }
    },
    [refresh]
  );

  const sendNow = useCallback(
    async (id: string) => {
      await api.post(`/messages/scheduled/${id}/send-now`);
      await refresh();
    },
    [refresh]
  );

  const byRoom = useMemo(() => {
    const out: Record<string, ScheduledMessage[]> = {};
    for (const item of items) (out[item.roomId] ||= []).push(item);
    return out;
  }, [items]);

  return (
    <ScheduledContext.Provider value={{ items, byRoom, schedule, reschedule, cancel, sendNow }}>
      {children}
    </ScheduledContext.Provider>
  );
}

export function useScheduled(): ScheduledContextType {
  const context = useContext(ScheduledContext);
  if (!context) throw new Error('useScheduled must be used within a ScheduledProvider');
  return context;
}
