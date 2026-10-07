'use client';

import React, { useState } from 'react';
import { AlertCircle, CalendarClock, Paperclip, Send, Pencil, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button, IconButton } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useScheduled, ScheduledMessage } from '@/lib/scheduled';
import { getErrorMessage } from '@/lib/utils';
import { ScheduleDialog, formatScheduleTime } from './ScheduleDialog';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  roomName: string;
}

export function ScheduledMessagesModal({ isOpen, onClose, roomId, roomName }: Props) {
  const { byRoom } = useScheduled();
  const items = byRoom[roomId] || [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Scheduled messages"
      description={`Messages waiting to be sent to ${roomName}.`}
      maxWidth="md"
    >
      {items.length === 0 ? (
        <div className="py-8 text-center">
          <CalendarClock className="w-6 h-6 mx-auto text-subtle mb-2" />
          <p className="text-sm text-muted">Nothing scheduled here.</p>
          <p className="text-[13px] text-subtle mt-1">
            Write a message, then use the clock button next to Send.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line -mx-1">
          {items.map((item) => (
            <ScheduledRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </Modal>
  );
}

function ScheduledRow({ item }: { item: ScheduledMessage }) {
  const { reschedule, cancel, sendNow } = useScheduled();
  const { toast, confirm } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.content || '');
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const when = new Date(item.scheduledFor);
  const failed = item.status === 'FAILED';

  const run = async (fn: () => Promise<void>, success: string, failure: string) => {
    try {
      setBusy(true);
      await fn();
      toast(success);
    } catch (err) {
      toast(getErrorMessage(err, failure), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: 'Delete scheduled message?',
      message: "It won't be sent.",
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) run(() => cancel(item.id), 'Scheduled message deleted', "Couldn't delete it");
  };

  return (
    <li className="px-1 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={
              failed ? 'text-[13px] font-medium text-danger' : 'text-[13px] font-medium text-accent'
            }
          >
            {failed ? 'Not sent' : formatScheduleTime(when)}
          </p>
          {editing ? (
            <div className="mt-1.5">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                autoFocus
                className="w-full resize-none rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                aria-label="Edit scheduled message"
              />
              <div className="flex justify-end gap-2 mt-1.5">
                <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  loading={busy}
                  disabled={!draft.trim() && !item.attachments?.length}
                  onClick={() =>
                    run(
                      async () => {
                        await reschedule(item.id, { content: draft });
                        setEditing(false);
                      },
                      'Scheduled message updated',
                      "Couldn't save your changes"
                    )
                  }
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <>
              {item.unreadable && (
                <p className="mt-0.5 text-[13px] text-muted italic">
                  Encrypted on another device. It will still be sent on time.
                </p>
              )}
              {item.content && (
                <p className="mt-0.5 text-sm text-fg whitespace-pre-wrap break-words line-clamp-4">
                  {item.content}
                </p>
              )}
              {!!item.attachments?.length && (
                <p className="mt-0.5 text-[13px] text-muted inline-flex items-center gap-1">
                  <Paperclip className="w-3.5 h-3.5" />
                  {item.attachments.length === 1
                    ? item.attachments[0].fileName
                    : `${item.attachments.length} attachments`}
                </p>
              )}
            </>
          )}
          {failed && (
            <p className="mt-1 text-[12px] text-danger inline-flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {item.error || 'Something went wrong.'} Was due {formatScheduleTime(when)}.
            </p>
          )}
        </div>

        {!editing && (
          <div className="flex items-center shrink-0 -mr-1">
            <IconButton
              label={failed ? 'Retry now' : 'Send now'}
              size="sm"
              disabled={busy}
              onClick={() => run(() => sendNow(item.id), 'Sent', "Couldn't send it")}
            >
              <Send className="w-4 h-4" />
            </IconButton>
            <IconButton
              label="Change time"
              size="sm"
              disabled={busy}
              onClick={() => setPicking(true)}
            >
              <CalendarClock className="w-4 h-4" />
            </IconButton>
            {item.content !== null && (
              <IconButton
                label="Edit text"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setDraft(item.content || '');
                  setEditing(true);
                }}
              >
                <Pencil className="w-4 h-4" />
              </IconButton>
            )}
            <IconButton label="Delete" size="sm" disabled={busy} onClick={onDelete}>
              <Trash2 className="w-4 h-4" />
            </IconButton>
          </div>
        )}
      </div>

      <ScheduleDialog
        isOpen={picking}
        onClose={() => setPicking(false)}
        title="Change send time"
        confirmLabel="Reschedule"
        initial={failed ? undefined : when}
        onConfirm={async (date) => {
          await reschedule(item.id, { scheduledFor: date });
          toast(`Rescheduled for ${formatScheduleTime(date)}`);
        }}
      />
    </li>
  );
}
