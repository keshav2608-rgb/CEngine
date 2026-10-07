'use client';

import React, { memo, useEffect, useRef, useState } from 'react';
import {
  CalendarClock,
  Copy,
  CornerUpLeft,
  Download,
  FileText,
  Info,
  Pencil,
  Trash2,
  AlertCircle,
  ImageOff,
  Loader2,
  Lock,
} from 'lucide-react';
import { StatusTicks, deliveryState } from './StatusTicks';
import { StickerView } from './Stickers';
import { useFileUrl } from './useFileUrl';
import { Avatar } from '@/components/ui/Avatar';
import { Message, Attachment } from '@/lib/chat-context';
import {
  cn,
  decodeEntities,
  formatFileSize,
  formatFullTimestamp,
  formatMessageTime,
} from '@/lib/utils';

export interface MessageItemProps {
  message: Message;
  isOwn: boolean;
  isGroup: boolean;
  /** Same sender as the previous message within a few minutes: hide name/avatar. */
  isContinuation: boolean;
  isEditing: boolean;
  /** Minutes left in the edit window for your own messages (0 = can no longer edit). */
  editMinutesLeft: number;
  compact: boolean;
  /** Number of other members in the room, for "Read by x of y". */
  recipientCount: number;
  sendKey: 'enter' | 'mod-enter';
  onReply: (message: Message) => void;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, content: string) => Promise<void>;
  onDelete: (id: string) => void;
  onRetry: (clientId: string) => void;
  onDiscard: (clientId: string) => void;
  onJumpTo: (messageId: string) => void;
  onOpenImage: (attachment: Attachment) => void;
  onCopy: (text: string) => void;
  onShowInfo: (message: Message) => void;
}

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;
const EMOJI_ONLY_RE = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s){1,24}$/u;

function renderText(text: string) {
  const parts = text.split(URL_RE);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 decoration-current/40 hover:decoration-current break-all"
      >
        {part}
      </a>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

function MessageItemImpl({
  message,
  isOwn,
  isGroup,
  isContinuation,
  isEditing,
  editMinutesLeft,
  compact,
  recipientCount,
  sendKey,
  onReply,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onRetry,
  onDiscard,
  onJumpTo,
  onOpenImage,
  onCopy,
  onShowInfo,
}: MessageItemProps) {
  // Encrypted text is exactly what the sender typed; legacy text was HTML-encoded by the server
  const isEncrypted = !!message.e2eeState;
  const text = message.content
    ? isEncrypted
      ? message.content
      : decodeEntities(message.content)
    : '';
  const undecryptable = isEncrypted && message.e2eeState !== 'ok' && !message.isDeleted;
  const sticker = !message.isDeleted && !undecryptable ? message.sticker : undefined;
  const isPending = message.sendStatus === 'sending';
  const isFailed = message.sendStatus === 'failed';
  const isOptimistic = !!message.sendStatus;
  const attachments = message.attachments || [];
  const images = attachments.filter((a) => a.mimeType.startsWith('image/'));
  const files = attachments.filter((a) => !a.mimeType.startsWith('image/'));
  // Emoji-only messages and stickers render without a bubble
  const emojiOnly =
    !!sticker ||
    (!message.isDeleted && !attachments.length && !message.replyTo && EMOJI_ONLY_RE.test(text));
  const showName = isGroup && !isOwn && !isContinuation;
  const showAvatar = isGroup && !isOwn;
  const status = isOwn ? deliveryState(message, recipientCount) : null;
  const wasScheduled = message.metadata?.scheduled === true;

  if (message.messageType === 'SYSTEM') {
    return (
      <div className="flex justify-center px-4 my-2">
        <span className="text-[12px] text-muted">{text}</span>
      </div>
    );
  }

  const meta = (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] leading-none whitespace-nowrap select-none',
        isOwn && !emojiOnly ? 'text-bubble-own-fg/60' : 'text-subtle'
      )}
    >
      {wasScheduled && !message.isDeleted && (
        <CalendarClock className="w-3 h-3" aria-label="Sent on a schedule" />
      )}
      {message.isEdited && !message.isDeleted && <span>edited</span>}
      <time dateTime={message.createdAt} title={formatFullTimestamp(message.createdAt)}>
        {formatMessageTime(message.createdAt)}
      </time>
      {status && !message.isDeleted && !isFailed && <StatusTicks {...status} />}
    </span>
  );

  return (
    <div
      data-mid={message.id}
      className={cn(
        'group relative flex gap-2 px-4 rounded-md',
        isOwn ? 'flex-row-reverse' : 'flex-row',
        isContinuation ? (compact ? 'mt-px' : 'mt-0.5') : compact ? 'mt-2' : 'mt-3'
      )}
    >
      {showAvatar && (
        <div className="w-8 shrink-0">
          {!isContinuation && (
            <Avatar src={message.sender.avatarUrl} name={message.sender.displayName} size="sm" />
          )}
        </div>
      )}

      <div
        className={cn(
          'flex flex-col min-w-0 max-w-[min(80%,36rem)]',
          isOwn ? 'items-end' : 'items-start'
        )}
      >
        {showName && (
          <span className="text-[12px] font-medium text-muted mb-0.5 px-1">
            {message.sender.displayName}
          </span>
        )}

        <div className="relative">
          {/* Hover / focus action bar */}
          {!message.isDeleted && !isEditing && !isOptimistic && (
            <div
              className={cn(
                'absolute -top-4 z-10 flex items-center rounded-md border border-line bg-surface shadow-sm',
                'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto',
                'group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity',
                isOwn ? 'right-1' : 'left-1'
              )}
            >
              <ActionButton label="Reply" onClick={() => onReply(message)}>
                <CornerUpLeft className="w-3.5 h-3.5" />
              </ActionButton>
              {text && (
                <ActionButton label="Copy text" onClick={() => onCopy(text)}>
                  <Copy className="w-3.5 h-3.5" />
                </ActionButton>
              )}
              {isOwn && (
                <ActionButton label="Message info" onClick={() => onShowInfo(message)}>
                  <Info className="w-3.5 h-3.5" />
                </ActionButton>
              )}
              {isOwn && text && editMinutesLeft > 0 && (
                <ActionButton
                  label={`Edit (${editMinutesLeft} min left)`}
                  onClick={() => onStartEdit(message.id)}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </ActionButton>
              )}
              {isOwn && (
                <ActionButton label="Delete" danger onClick={() => onDelete(message.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </ActionButton>
              )}
            </div>
          )}

          <div
            tabIndex={-1}
            className={cn(
              'relative outline-none text-[14px] leading-[1.45]',
              emojiOnly
                ? 'px-1'
                : message.isDeleted
                  ? 'px-3 py-1.5 rounded-xl border border-dashed border-line-strong text-muted italic'
                  : isOwn
                    ? 'bg-bubble-own text-bubble-own-fg rounded-xl px-3 py-1.5'
                    : 'bg-bubble-other text-fg border border-line rounded-xl px-3 py-1.5',
              !emojiOnly && !message.isDeleted && isOwn && !isContinuation && 'rounded-tr-sm',
              !emojiOnly && !message.isDeleted && !isOwn && !isContinuation && 'rounded-tl-sm',
              isPending && 'opacity-70',
              isFailed && 'ring-1 ring-danger'
            )}
          >
            {message.isDeleted ? (
              <span className="text-[13px]">This message was deleted</span>
            ) : undecryptable ? (
              <span className="inline-flex items-center gap-1.5 text-[13px] italic opacity-80 pr-14">
                <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden />
                {message.e2eeState === 'not-for-device'
                  ? 'Encrypted before this device was set up'
                  : "Couldn't decrypt this message"}
              </span>
            ) : isEditing ? (
              <EditBox
                initial={text}
                minutesLeft={editMinutesLeft}
                sendKey={sendKey}
                onCancel={onCancelEdit}
                onSave={(value) => onSaveEdit(message.id, value)}
              />
            ) : (
              <>
                {message.replyTo && (
                  <button
                    type="button"
                    onClick={() => onJumpTo(message.replyTo!.id)}
                    className={cn(
                      'block w-full text-left mt-0.5 mb-1.5 pl-2 pr-2 py-1 rounded border-l-2 text-[12.5px]',
                      isOwn
                        ? 'border-bubble-own-fg/60 bg-black/10 hover:bg-black/15'
                        : 'border-accent bg-surface-2 hover:bg-surface-3'
                    )}
                  >
                    <span className="block font-medium truncate">
                      {message.replyTo.sender.displayName}
                    </span>
                    <span className="block truncate opacity-80">
                      {message.replyTo.content
                        ? message.replyTo.e2ee
                          ? message.replyTo.content
                          : decodeEntities(message.replyTo.content)
                        : 'Attachment'}
                    </span>
                  </button>
                )}

                {sticker && (
                  <div className="py-0.5">
                    <StickerView sticker={sticker} size={140} />
                  </div>
                )}

                {images.length > 0 && (
                  <div className={cn('grid gap-1 my-1', images.length > 1 && 'grid-cols-2')}>
                    {images.map((att) => (
                      <button
                        key={att.id}
                        type="button"
                        onClick={() => onOpenImage(att)}
                        className="block overflow-hidden rounded-lg bg-black/5"
                        aria-label={`Open image ${att.fileName}`}
                      >
                        <AttachmentImage att={att} multiple={images.length > 1} />
                      </button>
                    ))}
                  </div>
                )}

                {files.map((att) => (
                  <AttachmentFile key={att.id} att={att} isOwn={isOwn} />
                ))}

                {text && (
                  <p
                    className={cn(
                      'whitespace-pre-wrap break-words',
                      emojiOnly && 'text-[2rem] leading-tight'
                    )}
                  >
                    {renderText(text)}
                    {/* Reserve space so the timestamp can float on the last line */}
                    {!emojiOnly && (
                      <span
                        className={cn(
                          'inline-block',
                          message.isEdited
                            ? isOwn
                              ? 'w-[6.5rem]'
                              : 'w-[5.25rem]'
                            : isOwn
                              ? 'w-[4.5rem]'
                              : 'w-14'
                        )}
                        aria-hidden
                      />
                    )}
                  </p>
                )}
              </>
            )}

            {!isEditing && (
              <div
                className={cn(
                  text && !emojiOnly ? 'absolute right-2.5 bottom-1.5' : 'flex justify-end mt-0.5'
                )}
              >
                {meta}
              </div>
            )}
          </div>
        </div>

        {isFailed && (
          <div className="flex items-center gap-2 mt-1 text-[12px] text-danger" role="alert">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>
              {message.sendError && message.sendError !== 'Not delivered'
                ? message.sendError
                : 'Not sent.'}
            </span>
            <button
              className="font-medium underline underline-offset-2"
              onClick={() => onRetry(message.clientId!)}
            >
              Retry
            </button>
            <button
              className="text-muted hover:text-fg"
              onClick={() => onDiscard(message.clientId!)}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AttachmentImage({ att, multiple }: { att: Attachment; multiple: boolean }) {
  const { url, failed } = useFileUrl(att);
  if (!url) {
    // Reserve the image's shape while it downloads and decrypts
    const ratio = att.width && att.height ? `${att.width} / ${att.height}` : '4 / 3';
    return (
      <span
        className={cn(
          'flex items-center justify-center bg-black/5 text-subtle',
          multiple ? 'w-36 h-36' : 'w-60 max-h-80'
        )}
        style={multiple ? undefined : { aspectRatio: ratio }}
      >
        {failed ? (
          <ImageOff className="w-5 h-5" aria-label="Image unavailable" />
        ) : (
          <Loader2 className="w-5 h-5 animate-spin" aria-label="Decrypting image" />
        )}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={att.fileName}
      loading="lazy"
      width={att.width}
      height={att.height}
      className={cn(
        'object-cover',
        multiple ? 'w-36 h-36' : 'max-w-[18rem] max-h-80 w-auto h-auto'
      )}
    />
  );
}

function AttachmentFile({ att, isOwn }: { att: Attachment; isOwn: boolean }) {
  const { url, failed, loading } = useFileUrl(att);
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      download={att.fileName}
      aria-disabled={!url}
      onClick={(e) => {
        if (!url) e.preventDefault();
      }}
      className={cn(
        'flex items-center gap-2.5 my-1 p-2 rounded-lg min-w-[14rem] transition-colors',
        isOwn ? 'bg-black/10 hover:bg-black/15' : 'bg-surface-2 hover:bg-surface-3',
        !url && 'cursor-default'
      )}
    >
      <FileText className="w-5 h-5 shrink-0 opacity-80" />
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium truncate">{att.fileName}</span>
        <span className="block text-[11px] opacity-70">
          {failed ? "Couldn't decrypt" : formatFileSize(att.fileSize)}
        </span>
      </span>
      {loading ? (
        <Loader2 className="w-4 h-4 shrink-0 opacity-70 animate-spin" />
      ) : (
        <Download className="w-4 h-4 shrink-0 opacity-70" />
      )}
    </a>
  );
}

function ActionButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'w-7 h-7 inline-flex items-center justify-center text-muted first:rounded-l-md last:rounded-r-md',
        danger ? 'hover:text-danger hover:bg-danger-soft' : 'hover:text-fg hover:bg-surface-2'
      )}
    >
      {children}
    </button>
  );
}

function EditBox({
  initial,
  minutesLeft,
  sendKey,
  onCancel,
  onSave,
}: {
  initial: string;
  minutesLeft: number;
  sendKey: 'enter' | 'mod-enter';
  onCancel: () => void;
  onSave: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const expired = minutesLeft <= 0;

  const save = async () => {
    if (expired) return;
    const trimmed = value.trim();
    if (!trimmed || trimmed === initial.trim()) return onCancel();
    setSaving(true);
    try {
      await onSave(trimmed);
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="w-[min(28rem,70vw)] py-0.5">
      <textarea
        ref={ref}
        value={value}
        rows={1}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
          const wantsSave =
            e.key === 'Enter' && (sendKey === 'enter' ? !e.shiftKey : e.ctrlKey || e.metaKey);
          if (wantsSave) {
            e.preventDefault();
            save();
          }
        }}
        className="w-full resize-none rounded-md bg-surface text-fg border border-line-strong px-2 py-1.5 text-[14px] outline-none focus:border-accent"
        aria-label="Edit message"
        readOnly={expired}
      />
      <div className="flex items-center justify-between gap-3 mt-1.5 text-[11px] opacity-80">
        {expired ? (
          <span className="font-medium">The 30-minute editing window has ended.</span>
        ) : (
          <span>
            Esc to cancel · {sendKey === 'enter' ? 'Enter' : 'Ctrl+Enter'} to save · {minutesLeft}{' '}
            min left
          </span>
        )}
        <span className="flex gap-1">
          <button type="button" onClick={onCancel} className="px-2 py-1 rounded hover:bg-black/10">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || expired}
            className="px-2 py-1 rounded font-semibold bg-surface text-fg hover:opacity-90 disabled:opacity-50"
          >
            Save
          </button>
        </span>
      </div>
    </div>
  );
}

export const MessageItem = memo(MessageItemImpl);
