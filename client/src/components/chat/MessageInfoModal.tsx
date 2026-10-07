'use client';

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import type { Message, Room } from '@/lib/chat-context';
import {
  decodeEntities,
  formatFullTimestamp,
  formatChatTimestamp,
  formatMessageTime,
} from '@/lib/utils';
import { StatusTicks, deliveryState, DeliveryState } from './StatusTicks';

interface Props {
  message: Message | null;
  room: Room;
  myId?: string;
  onClose: () => void;
}

const SECTIONS: {
  state: Exclude<DeliveryState, 'SENDING' | 'FAILED'>;
  title: string;
  empty: string;
}[] = [
  { state: 'READ', title: 'Read by', empty: 'No one has read it yet.' },
  { state: 'DELIVERED', title: 'Delivered to', empty: '' },
  { state: 'SENT', title: 'Not delivered yet', empty: '' },
];

export function MessageInfoModal({ message, room, myId, onClose }: Props) {
  if (!message) return null;
  const recipients = room.members.filter((m) => m.userId !== myId);
  const overall = deliveryState(message, recipients.length);

  const byState: Record<string, { name: string; avatarUrl: string | null; at?: string }[]> = {
    READ: [],
    DELIVERED: [],
    SENT: [],
  };
  for (const member of recipients) {
    const receipt = message.receipts?.find((r) => r.userId === member.userId);
    byState[receipt?.status ?? 'SENT'].push({
      name: member.user.displayName,
      avatarUrl: member.user.avatarUrl,
      at: receipt?.status !== 'SENT' ? receipt?.updatedAt : undefined,
    });
  }

  return (
    <Modal isOpen onClose={onClose} title="Message info" maxWidth="sm">
      <div className="rounded-lg bg-surface-2 px-3 py-2.5 mb-4">
        <p className="text-sm text-fg line-clamp-3 whitespace-pre-wrap break-words">
          {message.content
            ? decodeEntities(message.content)
            : `${message.attachments?.length || 0} attachment(s)`}
        </p>
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted">
          <StatusTicks {...overall} />
          <span>{overall.label}</span>
          <span aria-hidden>·</span>
          <time title={formatFullTimestamp(message.createdAt)}>
            Sent {formatChatTimestamp(message.createdAt)}
            {formatChatTimestamp(message.createdAt) !== formatMessageTime(message.createdAt) &&
              `, ${formatMessageTime(message.createdAt)}`}
          </time>
        </p>
      </div>

      <div className="space-y-4">
        {SECTIONS.map(({ state, title, empty }) => {
          const people = byState[state];
          if (!people.length && !empty) return null;
          return (
            <section key={state}>
              <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-fg mb-1.5">
                <StatusTicks state={state} label={title} />
                {title}
                {room.isGroup && <span className="text-muted font-normal">· {people.length}</span>}
              </h3>
              {people.length ? (
                <ul>
                  {people.map((p) => (
                    <li key={p.name} className="flex items-center gap-2.5 py-1.5">
                      <Avatar src={p.avatarUrl} name={p.name} size="xs" />
                      <span className="flex-1 truncate text-sm text-fg">{p.name}</span>
                      {p.at && (
                        <time className="text-[12px] text-muted" title={formatFullTimestamp(p.at)}>
                          {formatChatTimestamp(p.at)}
                        </time>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-subtle">{empty}</p>
              )}
            </section>
          );
        })}
      </div>

      <div className="mt-5 pt-3 border-t border-line grid grid-cols-3 gap-2 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <StatusTicks state="SENT" label="Sent" /> Sent
        </span>
        <span className="flex items-center gap-1">
          <StatusTicks state="DELIVERED" label="Delivered" /> Delivered
        </span>
        <span className="flex items-center gap-1">
          <StatusTicks state="READ" label="Read" /> Read
        </span>
      </div>
    </Modal>
  );
}
