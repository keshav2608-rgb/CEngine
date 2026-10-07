'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, Loader2, Lock } from 'lucide-react';
import { MessageItem } from './MessageItem';
import { ImageLightbox } from './ImageLightbox';
import { MessageInfoModal } from './MessageInfoModal';
import { useChat, Message, Attachment } from '@/lib/chat-context';
import { useAuth } from '@/lib/auth-context';
import { usePreferences } from '@/lib/preferences';
import { useToast } from '@/components/ui/Toast';
import { cn, editMinutesLeft, formatDayDivider } from '@/lib/utils';

const GROUP_WINDOW_MS = 5 * 60 * 1000;
const NEAR_BOTTOM_PX = 120;
const LOAD_OLDER_PX = 300;
const MAX_JUMP_PAGES = 20;

export const JUMP_TO_LATEST_EVENT = 'cengine:jump-latest';

function isContinuation(prev: Message | undefined, msg: Message): boolean {
  if (!prev || prev.senderId !== msg.senderId) return false;
  if (prev.messageType === 'SYSTEM' || msg.messageType === 'SYSTEM') return false;
  const a = new Date(prev.createdAt);
  const b = new Date(msg.createdAt);
  return a.toDateString() === b.toDateString() && b.getTime() - a.getTime() < GROUP_WINDOW_MS;
}

export function MessageList() {
  const { user } = useAuth();
  const {
    messages,
    activeRoom,
    isLoadingMessages,
    isLoadingOlder,
    hasMoreMessages,
    loadOlderMessages,
    typingUsers,
    unreadMarkerId,
    editingMessageId,
    jumpTarget,
    jumpToMessage,
    clearJumpTarget,
    setReplyingTo,
    setEditingMessageId,
    editMessage,
    deleteMessage,
    retryMessage,
    discardMessage,
  } = useChat();
  const { prefs } = usePreferences();
  const { toast } = useToast();

  const containerRef = useRef<HTMLDivElement>(null);
  const snapshot = useRef({ scrollTop: 0, scrollHeight: 0, firstId: '', lastId: '', count: 0 });
  const initialScrollRoom = useRef<string | null>(null);
  const jumpPages = useRef(0);
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const [lightbox, setLightbox] = useState<Attachment | null>(null);
  const [infoId, setInfoId] = useState<string | null>(null);
  // One shared clock for edit windows; messages re-render only when their minutes-left changes
  const now = useNow(30 * 1000);
  const onShowInfo = useCallback((m: Message) => setInfoId(m.id), []);

  const roomId = activeRoom?.id ?? null;
  const recipientCount = Math.max((activeRoom?.members.length ?? 2) - 1, 1);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    setNewCount(0);
  }, []);

  // Reset per-room UI state when the conversation changes (adjusted during render)
  const [listRoom, setListRoom] = useState(roomId);
  if (listRoom !== roomId) {
    setListRoom(roomId);
    setNewCount(0);
    setAtBottom(true);
  }

  // Forget the previous room's initial-scroll marker (declared before the scroll logic so it runs first)
  useLayoutEffect(() => {
    initialScrollRoom.current = null;
  }, [roomId]);

  // A new jump target gets a fresh paging budget
  useEffect(() => {
    jumpPages.current = 0;
  }, [jumpTarget]);

  // Keep scroll position stable when history is prepended; follow new messages only when at bottom
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const prev = snapshot.current;
    const first = messages[0]?.id ?? '';
    const last = messages[messages.length - 1]?.id ?? '';

    if (
      !isLoadingMessages &&
      messages.length &&
      messages[0].roomId === roomId &&
      initialScrollRoom.current !== roomId
    ) {
      // First paint for this room: land on the first unread message, or the bottom
      initialScrollRoom.current = roomId;
      const marker = unreadMarkerId && el.querySelector<HTMLElement>(`[data-divider="unread"]`);
      if (marker) {
        el.scrollTop = Math.max(0, marker.offsetTop - 80);
      } else {
        el.scrollTop = el.scrollHeight;
      }
    } else if (prev.count && first !== prev.firstId && last === prev.lastId) {
      // Older messages were prepended above
      el.scrollTop = prev.scrollTop + (el.scrollHeight - prev.scrollHeight);
    } else if (last !== prev.lastId && prev.count) {
      const lastMsg = messages[messages.length - 1];
      const nearBottom = prev.scrollHeight - prev.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
      if (lastMsg?.senderId === user?.id || nearBottom) {
        el.scrollTop = el.scrollHeight;
      } else {
        setNewCount((n) => n + 1);
      }
    }

    snapshot.current = {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      firstId: first,
      lastId: last,
      count: messages.length,
    };
  }, [messages, isLoadingMessages, roomId, unreadMarkerId, user?.id]);

  // Keep the typing indicator in view if the user is following along
  useLayoutEffect(() => {
    if (atBottom && typingUsers.length) scrollToBottom();
  }, [typingUsers.length, atBottom, scrollToBottom]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    snapshot.current.scrollTop = el.scrollTop;
    snapshot.current.scrollHeight = el.scrollHeight;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    setAtBottom(bottom);
    if (bottom) setNewCount(0);
    if (el.scrollTop < LOAD_OLDER_PX && hasMoreMessages && !isLoadingOlder && !isLoadingMessages) {
      loadOlderMessages();
    }
  };

  // Esc from the composer (or the button) jumps to the latest message
  useEffect(() => {
    const onJump = () => scrollToBottom(true);
    window.addEventListener(JUMP_TO_LATEST_EVENT, onJump);
    return () => window.removeEventListener(JUMP_TO_LATEST_EVENT, onJump);
  }, [scrollToBottom]);

  // Jump to a specific message (reply quote / search result), paging back through history if needed
  useEffect(() => {
    // Wait until this room's first page has rendered (avoids acting on the previous room's list)
    if (!jumpTarget || isLoadingMessages || initialScrollRoom.current !== roomId) return;
    const el = containerRef.current?.querySelector<HTMLElement>(
      `[data-mid="${CSS.escape(jumpTarget)}"]`
    );
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.remove('flash-highlight');
      void el.offsetWidth; // restart the animation
      el.classList.add('flash-highlight');
      jumpPages.current = 0;
      clearJumpTarget();
    } else if (hasMoreMessages && jumpPages.current < MAX_JUMP_PAGES) {
      if (!isLoadingOlder) {
        jumpPages.current += 1;
        loadOlderMessages();
      }
    } else {
      jumpPages.current = 0;
      clearJumpTarget();
      toast("That message isn't available anymore.");
    }
  }, [
    jumpTarget,
    messages,
    roomId,
    isLoadingMessages,
    isLoadingOlder,
    hasMoreMessages,
    loadOlderMessages,
    clearJumpTarget,
    toast,
  ]);

  const onStartEdit = useCallback((id: string) => setEditingMessageId(id), [setEditingMessageId]);
  const onCancelEdit = useCallback(() => setEditingMessageId(null), [setEditingMessageId]);
  const onSaveEdit = useCallback(
    async (id: string, content: string) => {
      await editMessage(id, content);
      setEditingMessageId(null);
    },
    [editMessage, setEditingMessageId]
  );
  const onJumpTo = useCallback(
    (id: string) => {
      if (roomId) jumpToMessage(roomId, id);
    },
    [roomId, jumpToMessage]
  );

  const onCopy = useCallback(
    (text: string) => {
      navigator.clipboard?.writeText(text).then(
        () => toast('Copied to clipboard'),
        () => toast("Couldn't copy to clipboard", { tone: 'error' })
      );
    },
    [toast]
  );

  if (!activeRoom) return null;

  const showSkeleton = isLoadingMessages && messages.length === 0;
  const peerName = !activeRoom.isGroup
    ? activeRoom.members.find((m) => m.userId !== user?.id)?.user.displayName
    : null;

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto overscroll-contain pb-3"
        role="log"
        aria-label="Messages"
        aria-live="polite"
        aria-relevant="additions"
      >
        {isLoadingOlder && (
          <div className="flex justify-center py-3 text-subtle">
            <Loader2 className="w-4 h-4 animate-spin" aria-label="Loading earlier messages" />
          </div>
        )}
        {!hasMoreMessages && messages.length > 0 && !isLoadingMessages && (
          <div className="flex flex-col items-center gap-2 pt-6 pb-2 px-4 text-center">
            <EncryptionNotice />
            <p className="text-[12px] text-subtle">
              This is the beginning of{' '}
              {activeRoom.isGroup ? <>{activeRoom.name}</> : <>your conversation with {peerName}</>}
              .
            </p>
          </div>
        )}

        {showSkeleton ? (
          <MessageSkeleton />
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <EncryptionNotice />
            <p className="mt-4 text-sm font-medium text-fg">No messages yet</p>
            <p className="text-[13px] text-muted mt-1 max-w-xs">
              {peerName
                ? `Send a message to start your conversation with ${peerName}.`
                : 'Send the first message to the group.'}
            </p>
          </div>
        ) : (
          messages.map((message, index) => {
            const prev = messages[index - 1];
            const isNewDay =
              !prev ||
              new Date(prev.createdAt).toDateString() !==
                new Date(message.createdAt).toDateString();
            const isUnreadStart = message.id === unreadMarkerId;

            return (
              <React.Fragment key={message.clientId || message.id}>
                {isNewDay && (
                  <div className="sticky top-0 z-[5] flex justify-center pt-3 pb-1 pointer-events-none">
                    <span className="px-2.5 py-0.5 rounded-full text-[12px] font-medium text-muted bg-app/90 backdrop-blur-sm border border-line">
                      {formatDayDivider(message.createdAt)}
                    </span>
                  </div>
                )}
                {isUnreadStart && (
                  <div
                    data-divider="unread"
                    className="flex items-center gap-3 px-4 mt-3"
                    role="separator"
                  >
                    <div className="flex-1 h-px bg-danger/50" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-danger">
                      New
                    </span>
                  </div>
                )}
                <MessageItem
                  message={message}
                  isOwn={message.senderId === user?.id}
                  isGroup={activeRoom.isGroup}
                  isContinuation={!isNewDay && !isUnreadStart && isContinuation(prev, message)}
                  isEditing={editingMessageId === message.id}
                  editMinutesLeft={
                    message.senderId === user?.id && !message.isDeleted && !message.sendStatus
                      ? editMinutesLeft(message.createdAt, now)
                      : 0
                  }
                  compact={prefs.compactMode}
                  recipientCount={recipientCount}
                  sendKey={prefs.sendKey}
                  onReply={setReplyingTo}
                  onStartEdit={onStartEdit}
                  onCancelEdit={onCancelEdit}
                  onSaveEdit={onSaveEdit}
                  onDelete={deleteMessage}
                  onRetry={retryMessage}
                  onDiscard={discardMessage}
                  onJumpTo={onJumpTo}
                  onOpenImage={setLightbox}
                  onCopy={onCopy}
                  onShowInfo={onShowInfo}
                />
              </React.Fragment>
            );
          })
        )}

        {typingUsers.length > 0 && (
          <div
            className="flex items-center gap-2 px-4 mt-3 text-[12px] text-muted"
            aria-live="polite"
          >
            <span className="inline-flex gap-0.5 px-2.5 py-2 rounded-xl bg-bubble-other border border-line">
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-subtle" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-subtle [animation-delay:150ms]" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-subtle [animation-delay:300ms]" />
            </span>
            <span>{formatTyping(typingUsers)}</span>
          </div>
        )}
      </div>

      {!atBottom && (
        <button
          onClick={() => scrollToBottom(true)}
          className={cn(
            'absolute bottom-3 right-4 z-10 inline-flex items-center gap-1.5 h-8 rounded-full shadow-md border text-[13px] font-medium transition-colors',
            newCount > 0
              ? 'pl-3 pr-3.5 bg-accent text-accent-fg border-transparent hover:bg-accent-hover'
              : 'w-8 justify-center bg-surface text-muted border-line hover:text-fg'
          )}
          aria-label={newCount > 0 ? `Jump to latest, ${newCount} new` : 'Jump to latest'}
          title="Jump to latest (Esc)"
        >
          <ArrowDown className="w-4 h-4" />
          {newCount > 0 && <span>{newCount} new</span>}
        </button>
      )}

      <ImageLightbox attachment={lightbox} onClose={() => setLightbox(null)} />
      {/* Looked up by id so receipts stay live while the dialog is open */}
      <MessageInfoModal
        message={messages.find((m) => m.id === infoId) ?? null}
        room={activeRoom}
        myId={user?.id}
        onClose={() => setInfoId(null)}
      />
    </div>
  );
}

function EncryptionNotice() {
  return (
    <p className="inline-flex items-start gap-1.5 max-w-sm px-3 py-2 rounded-lg bg-warning-soft text-warning text-[12px] leading-snug text-left">
      <Lock className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden />
      Messages and files you send here are end-to-end encrypted. No one outside this chat, not even
      CEngine, can read them.
    </p>
  );
}

/** Current time, refreshed every `intervalMs`. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatTyping(names: string[]): string {
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names[0]} and ${names.length - 1} others are typing…`;
}

function MessageSkeleton() {
  const rows = [
    { own: false, w: 'w-48' },
    { own: false, w: 'w-64' },
    { own: true, w: 'w-40' },
    { own: false, w: 'w-56' },
    { own: true, w: 'w-72' },
    { own: true, w: 'w-32' },
  ];
  return (
    <div className="px-4 pt-6 space-y-3 animate-pulse" aria-label="Loading messages">
      {rows.map((r, i) => (
        <div key={i} className={cn('flex', r.own ? 'justify-end' : 'justify-start')}>
          <div className={cn('h-9 rounded-xl bg-surface-3', r.w)} />
        </div>
      ))}
    </div>
  );
}
