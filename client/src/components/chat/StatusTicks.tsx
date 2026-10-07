'use client';

import React from 'react';
import { AlertCircle, Check, CheckCheck, Clock } from 'lucide-react';
import type { Message } from '@/lib/chat-context';
import { cn } from '@/lib/utils';

export type DeliveryState = 'SENDING' | 'FAILED' | 'SENT' | 'DELIVERED' | 'READ';

/**
 * Overall status of one of your messages. In groups a message only counts as
 * delivered/read once every recipient has received/read it (like WhatsApp).
 */
export function deliveryState(
  message: Message,
  recipientCount: number
): { state: DeliveryState; label: string } {
  if (message.sendStatus === 'sending') return { state: 'SENDING', label: 'Sending…' };
  if (message.sendStatus === 'failed') return { state: 'FAILED', label: 'Not sent' };

  const receipts = message.receipts || [];
  // Receipts are created for the members at send time; people who joined later never get one
  const total = receipts.length || Math.max(recipientCount, 1);
  const read = receipts.filter((r) => r.status === 'READ').length;
  const delivered = receipts.filter((r) => r.status !== 'SENT').length;
  const group = total > 1;

  if (read >= total) return { state: 'READ', label: group ? 'Read by everyone' : 'Read' };
  if (delivered >= total) {
    return {
      state: 'DELIVERED',
      label: read
        ? `Delivered to everyone · read by ${read} of ${total}`
        : group
          ? 'Delivered to everyone'
          : 'Delivered',
    };
  }
  return {
    state: 'SENT',
    label: delivered
      ? `Sent · delivered to ${delivered} of ${total}${read ? `, read by ${read}` : ''}`
      : 'Sent',
  };
}

/** Sent: one grey tick · Delivered: two grey ticks · Read: two blue ticks. */
export function StatusTicks({
  state,
  label,
  className,
}: {
  state: DeliveryState;
  label: string;
  className?: string;
}) {
  const common = cn('w-[15px] h-[15px] shrink-0', className);
  return (
    <span title={label} aria-label={label} role="img" className="inline-flex">
      {state === 'SENDING' ? (
        <Clock className={cn(common, 'w-3 h-3 text-tick')} />
      ) : state === 'FAILED' ? (
        <AlertCircle className={cn(common, 'w-3.5 h-3.5 text-danger')} />
      ) : state === 'SENT' ? (
        <Check className={cn(common, 'text-tick')} strokeWidth={2.25} />
      ) : (
        <CheckCheck
          className={cn(common, state === 'READ' ? 'text-tick-read' : 'text-tick')}
          strokeWidth={state === 'READ' ? 2.5 : 2.25}
        />
      )}
    </span>
  );
}
