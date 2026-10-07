'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowUp,
  Paperclip,
  X,
  FileText,
  CornerUpLeft,
  CalendarClock,
  ChevronRight,
  Smile,
  Lock,
} from 'lucide-react';
import { ExpressionPicker } from './ExpressionPicker';
import { useChat } from '@/lib/chat-context';
import { e2ee, EncryptedAttachment, StickerRef } from '@/lib/e2ee';
import { useAuth } from '@/lib/auth-context';
import { notifyDraftsChanged, readDraft, writeDraft, usePreferences } from '@/lib/preferences';
import { useToast } from '@/components/ui/Toast';
import {
  cn,
  editMinutesLeft,
  decodeEntities,
  formatFileSize,
  getErrorMessage,
  isMac,
  resolveFileUrl,
} from '@/lib/utils';
import { useScheduled } from '@/lib/scheduled';
import { JUMP_TO_LATEST_EVENT } from './MessageList';
import { ScheduleDialog, formatScheduleTime } from './ScheduleDialog';
import { ScheduledMessagesModal } from './ScheduledMessagesModal';

export const FILES_DROPPED_EVENT = 'cengine:files';

const MAX_FILE_MB = 15;
const MAX_FILES = 10;

interface PendingUpload {
  key: string;
  name: string;
  size: number;
  progress: number;
  previewUrl?: string;
  result?: EncryptedAttachment;
}

export function MessageInput() {
  const { user } = useAuth();
  const {
    sendMessage,
    replyingTo,
    setReplyingTo,
    sendTypingStatus,
    activeRoom,
    messages,
    setEditingMessageId,
  } = useChat();
  const { prefs } = usePreferences();
  const { toast } = useToast();
  const { schedule, byRoom } = useScheduled();
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isScheduledListOpen, setIsScheduledListOpen] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const roomId = activeRoom?.id;
  const [content, setContent] = useState(() => (roomId ? readDraft(roomId) : ''));
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [composerRoom, setComposerRoom] = useState(roomId);

  // Switching conversations: load that room's draft (state adjusted during render, not in an effect)
  if (composerRoom !== roomId) {
    setComposerRoom(roomId);
    setContent(roomId ? readDraft(roomId) : '');
    setUploads([]);
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftNotifyRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!roomId) return;
    requestAnimationFrame(() => textareaRef.current?.focus());
    return () => {
      // Refresh sidebar draft previews for the room we're leaving
      if (draftNotifyRef.current) {
        clearTimeout(draftNotifyRef.current);
        draftNotifyRef.current = null;
        notifyDraftsChanged();
      }
      sendTypingStatus(false);
    };
  }, [roomId, sendTypingStatus]);

  useEffect(() => {
    if (replyingTo) textareaRef.current?.focus();
  }, [replyingTo]);

  // Auto-grow the textarea up to a limit
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [content]);

  const persistDraft = (text: string) => {
    if (!roomId) return;
    // Save immediately so nothing is lost; refresh previews at most every 500ms
    writeDraft(roomId, text, false);
    if (draftNotifyRef.current) clearTimeout(draftNotifyRef.current);
    draftNotifyRef.current = setTimeout(() => {
      draftNotifyRef.current = null;
      notifyDraftsChanged();
    }, 500);
  };

  const handleChange = (text: string) => {
    setContent(text);
    persistDraft(text);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (text.trim()) {
      sendTypingStatus(true);
      typingTimeoutRef.current = setTimeout(() => sendTypingStatus(false), 3000);
    } else {
      sendTypingStatus(false);
    }
  };

  const uploadFiles = useCallback(
    (files: File[]) => {
      const room = roomId;
      if (!room || files.length === 0) return;
      const accepted = files.slice(0, MAX_FILES);
      if (files.length > MAX_FILES) toast(`You can attach up to ${MAX_FILES} files at once.`);

      accepted.forEach((file) => {
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          toast(`${file.name} is larger than ${MAX_FILE_MB} MB.`, { tone: 'error' });
          return;
        }
        const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
        const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
        setUploads((prev) => [
          ...prev,
          { key, name: file.name, size: file.size, progress: 0, previewUrl },
        ]);

        // Files are encrypted on this device before upload; the server stores an opaque blob
        e2ee
          .uploadEncryptedFile(file, (progress) =>
            setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, progress } : u)))
          )
          .then((result) => {
            setUploads((prev) =>
              prev.map((u) => (u.key === key ? { ...u, progress: 100, result } : u))
            );
          })
          .catch((err) => {
            setUploads((prev) => prev.filter((u) => u.key !== key));
            toast(getErrorMessage(err, `Couldn't upload ${file.name}.`), { tone: 'error' });
          });
      });
    },
    [roomId, toast]
  );

  // Files dropped anywhere on the conversation
  useEffect(() => {
    const onFiles = (e: Event) => uploadFiles((e as CustomEvent<File[]>).detail);
    window.addEventListener(FILES_DROPPED_EVENT, onFiles);
    return () => window.removeEventListener(FILES_DROPPED_EVENT, onFiles);
  }, [uploadFiles]);

  const removeUpload = (key: string) => {
    setUploads((prev) => {
      const u = prev.find((x) => x.key === key);
      if (u?.previewUrl) URL.revokeObjectURL(u.previewUrl);
      return prev.filter((x) => x.key !== key);
    });
  };

  const isUploading = uploads.some((u) => !u.result);
  const canSend = (content.trim().length > 0 || uploads.length > 0) && !isUploading;

  const resetComposer = () => {
    if (!roomId) return;
    uploads.forEach((u) => u.previewUrl && URL.revokeObjectURL(u.previewUrl));
    setContent('');
    setUploads([]);
    if (draftNotifyRef.current) clearTimeout(draftNotifyRef.current);
    draftNotifyRef.current = null;
    writeDraft(roomId, '');
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    sendTypingStatus(false);
    textareaRef.current?.focus();
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSend || !roomId) return;
    sendMessage(content.trim(), uploads.map((u) => u.result!).filter(Boolean));
    resetComposer();
  };

  const handleSchedule = async (when: Date) => {
    if (!roomId) return;
    await schedule({
      roomId,
      memberIds: activeRoom!.members.map((m) => m.userId),
      content: content.trim(),
      attachments: uploads.map((u) => u.result!).filter(Boolean),
      replyToId: replyingTo?.id,
      scheduledFor: when,
    });
    setReplyingTo(null);
    resetComposer();
    toast(`Scheduled for ${formatScheduleTime(when)}`, {
      action: { label: 'View', onClick: () => setIsScheduledListOpen(true) },
    });
  };

  const sendSticker = (sticker: StickerRef) => {
    setIsPickerOpen(false);
    sendMessage('', [], sticker);
    textareaRef.current?.focus();
  };

  /** Insert an emoji at the cursor, keeping the picker open for more. */
  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? content.length;
    const end = el?.selectionEnd ?? content.length;
    const next = content.slice(0, start) + emoji + content.slice(end);
    handleChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const scheduled = roomId ? byRoom[roomId] || [] : [];
  const failedCount = scheduled.filter((s) => s.status === 'FAILED').length;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return; // IME composition (e.g. CJK input)

    if (e.key === 'Enter') {
      const modifier = e.ctrlKey || e.metaKey;
      const shouldSend = prefs.sendKey === 'enter' ? !e.shiftKey && !modifier : modifier;
      if (shouldSend) {
        e.preventDefault();
        handleSubmit();
      }
      return;
    }

    if (e.key === 'Escape') {
      if (replyingTo) setReplyingTo(null);
      else window.dispatchEvent(new Event(JUMP_TO_LATEST_EVENT));
      return;
    }

    // Up arrow in an empty composer edits your most recent message
    if (e.key === 'ArrowUp' && !content) {
      const lastOwn = [...messages]
        .reverse()
        .find(
          (m) =>
            m.senderId === user?.id &&
            !m.isDeleted &&
            !m.sendStatus &&
            m.content &&
            editMinutesLeft(m.createdAt, Date.now()) > 0
        );
      if (lastOwn) {
        e.preventDefault();
        setEditingMessageId(lastOwn.id);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      uploadFiles(files);
    }
  };

  const modKey = isMac ? '⌘' : 'Ctrl';
  const hint =
    prefs.sendKey === 'enter'
      ? 'Enter to send · Shift+Enter for a new line'
      : `${modKey}+Enter to send · Enter for a new line`;
  const closePicker = useCallback(() => setIsPickerOpen(false), []);

  return (
    <div className="relative px-3 sm:px-4 pb-3 pt-1">
      {scheduled.length > 0 && (
        <button
          type="button"
          onClick={() => setIsScheduledListOpen(true)}
          className={cn(
            'mb-2 w-full flex items-center gap-2 h-8 px-3 rounded-lg border text-[13px] bg-surface/95 backdrop-blur-sm transition-colors hover:bg-surface-2',
            failedCount ? 'border-danger/40 text-danger' : 'border-line text-muted'
          )}
        >
          <CalendarClock className="w-4 h-4 shrink-0" />
          <span className="truncate text-left flex-1">
            {failedCount
              ? `${failedCount} scheduled message${failedCount > 1 ? 's' : ''} couldn't be sent`
              : `${scheduled.length} scheduled · next ${formatScheduleTime(new Date(scheduled[0].scheduledFor))}`}
          </span>
          <ChevronRight className="w-4 h-4 shrink-0" />
        </button>
      )}
      <form onSubmit={handleSubmit} className="rounded-xl border border-line bg-surface">
        {replyingTo && (
          <div className="flex items-center gap-2 mx-2 mt-2 pl-2.5 pr-1 py-1.5 rounded-lg bg-surface-2 border-l-2 border-accent">
            <CornerUpLeft className="w-3.5 h-3.5 text-muted shrink-0" />
            <div className="min-w-0 flex-1 text-[13px]">
              <span className="text-muted">Replying to </span>
              <span className="font-medium text-fg">
                {replyingTo.senderId === user?.id ? 'yourself' : replyingTo.sender.displayName}
              </span>
              <p className="truncate text-muted">
                {replyingTo.content ? decodeEntities(replyingTo.content) : 'Attachment'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              aria-label="Cancel reply"
              title="Cancel reply (Esc)"
              className="w-7 h-7 inline-flex items-center justify-center rounded-md text-subtle hover:text-fg hover:bg-surface-3"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {uploads.length > 0 && (
          <div className="flex flex-wrap gap-2 px-2 pt-2">
            {uploads.map((u) => (
              <div
                key={u.key}
                className="relative flex items-center gap-2 h-12 pl-1.5 pr-8 rounded-lg border border-line bg-surface-2 max-w-[15rem] overflow-hidden"
              >
                {u.previewUrl || (u.result && u.result.mimeType.startsWith('image/')) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={u.previewUrl || resolveFileUrl(u.result!.fileUrl)}
                    alt=""
                    className="w-9 h-9 rounded object-cover shrink-0"
                  />
                ) : (
                  <span className="w-9 h-9 rounded bg-surface-3 inline-flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-muted" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-medium text-fg truncate">{u.name}</span>
                  <span className="block text-[11px] text-muted">
                    {u.result ? formatFileSize(u.size) : `Uploading… ${u.progress}%`}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeUpload(u.key)}
                  aria-label={`Remove ${u.name}`}
                  className="absolute right-1 top-1 w-6 h-6 inline-flex items-center justify-center rounded text-subtle hover:text-fg hover:bg-surface-3"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                {!u.result && (
                  <span
                    className="absolute left-0 bottom-0 h-0.5 bg-accent transition-[width]"
                    style={{ width: `${u.progress}%` }}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="relative flex items-end gap-1 p-1.5">
          {isPickerOpen && (
            <ExpressionPicker onClose={closePicker} onEmoji={insertEmoji} onSticker={sendSticker} />
          )}
          <button
            type="button"
            onClick={() => setIsPickerOpen((open) => !open)}
            aria-label="Emoji and stickers"
            aria-expanded={isPickerOpen}
            title="Emoji and stickers"
            className={cn(
              'w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-lg hover:text-fg hover:bg-surface-2',
              isPickerOpen ? 'text-accent' : 'text-muted'
            )}
          >
            <Smile className="w-[18px] h-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach files"
            title="Attach files (or paste / drop)"
            className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-lg text-muted hover:text-fg hover:bg-surface-2"
          >
            <Paperclip className="w-[18px] h-[18px]" />
          </button>
          <input
            type="file"
            multiple
            ref={fileInputRef}
            onChange={(e) => {
              uploadFiles(Array.from(e.target.files || []));
              e.target.value = '';
            }}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.txt,.zip"
          />

          <textarea
            ref={textareaRef}
            rows={1}
            placeholder={`Message ${activeRoomLabel(activeRoom, user?.id)}`}
            value={content}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={() => sendTypingStatus(false)}
            aria-label="Message"
            className="flex-1 min-w-0 resize-none bg-transparent px-1.5 py-2 text-[14px] leading-5 text-fg placeholder:text-subtle outline-none max-h-[220px]"
          />

          <button
            type="button"
            disabled={!canSend}
            onClick={() => setIsScheduleOpen(true)}
            aria-label="Schedule message"
            title="Schedule for later"
            className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-lg text-muted hover:text-fg hover:bg-surface-2 disabled:opacity-40 disabled:pointer-events-none"
          >
            <CalendarClock className="w-[18px] h-[18px]" />
          </button>

          <button
            type="submit"
            disabled={!canSend}
            onContextMenu={(e) => {
              // Right-click / long-press on Send also opens scheduling
              if (!canSend) return;
              e.preventDefault();
              setIsScheduleOpen(true);
            }}
            aria-label="Send message"
            title={prefs.sendKey === 'enter' ? 'Send (Enter)' : `Send (${modKey}+Enter)`}
            className={cn(
              'w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-lg transition-colors',
              canSend
                ? 'bg-accent text-accent-fg hover:bg-accent-hover'
                : 'bg-surface-2 text-subtle'
            )}
          >
            <ArrowUp className="w-[18px] h-[18px]" strokeWidth={2.25} />
          </button>
        </div>
      </form>
      <p className="hidden sm:flex items-center gap-1 mt-1.5 px-1 text-[11px] text-subtle">
        <Lock className="w-3 h-3" aria-hidden />
        End-to-end encrypted · {hint}
      </p>

      <ScheduleDialog
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        onConfirm={handleSchedule}
      />
      {roomId && (
        <ScheduledMessagesModal
          isOpen={isScheduledListOpen}
          onClose={() => setIsScheduledListOpen(false)}
          roomId={roomId}
          roomName={activeRoomLabel(activeRoom, user?.id)}
        />
      )}
    </div>
  );
}

function activeRoomLabel(
  room: {
    isGroup: boolean;
    name: string | null;
    members: { userId: string; user: { displayName: string } }[];
  } | null,
  myId?: string
): string {
  if (!room) return '';
  if (room.isGroup) return room.name || 'group';
  return room.members.find((m) => m.userId !== myId)?.user.displayName || '';
}
