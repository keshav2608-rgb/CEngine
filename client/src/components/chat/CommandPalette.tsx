'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Loader2, Hash, MessageSquare, SquarePen, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useChat, Room } from '@/lib/chat-context';
import { useAuth } from '@/lib/auth-context';
import { e2ee } from '@/lib/e2ee';
import { cn, decodeEntities, formatChatTimestamp } from '@/lib/utils';
import { getRoomTitle } from './Sidebar';

interface SearchHit {
  id: string;
  roomId: string;
  content: string | null;
  createdAt: string;
  sender: { id: string; displayName: string; avatarUrl: string | null };
  room?: { id: string; name: string | null; isGroup: boolean };
  /** Found in this device's index of decrypted messages (content is already plain text). */
  local?: boolean;
}

type Item =
  | { kind: 'room'; key: string; room: Room }
  | { kind: 'message'; key: string; hit: SearchHit }
  | { kind: 'action'; key: string; label: string; icon: React.ReactNode; run: () => void };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onNewGroup: () => void;
}

/** Ctrl/Cmd+K: jump to any conversation or search message history. */
export function CommandPalette(props: Props) {
  // Mount the body only while open so it starts fresh every time
  return props.isOpen ? <PaletteBody {...props} /> : null;
}

function PaletteBody({ onClose, onNewChat, onNewGroup }: Props) {
  const { user } = useAuth();
  const { rooms, setActiveRoom, jumpToMessage } = useChat();
  const [query, setQuery] = useState('');
  const [resolved, setResolved] = useState<{ query: string; hits: SearchHit[] }>({
    query: '',
    hits: [],
  });
  const [rawIndex, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const searchQuery = query.trim().length >= 2 ? query.trim() : '';
  const hits = useMemo(
    () => (searchQuery && resolved.query === searchQuery ? resolved.hits : []),
    [searchQuery, resolved]
  );
  const searching = !!searchQuery && resolved.query !== searchQuery;

  // Debounced server-side message search
  useEffect(() => {
    if (!searchQuery) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      // Messages are end-to-end encrypted, so search runs only over what this device has
      // decrypted. Search terms are never sent to the server.
      const local = await e2ee.searchLocal(searchQuery, 30);
      const merged: SearchHit[] = local.map((e) => ({
        id: e.id,
        roomId: e.roomId,
        content: e.text,
        createdAt: e.createdAt,
        sender: { id: e.senderId, displayName: e.senderName, avatarUrl: null },
        local: true,
      }));
      if (!cancelled) setResolved({ query: searchQuery, hits: merged });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const matchedRooms = q
      ? rooms.filter((r) => getRoomTitle(r, user?.id).toLowerCase().includes(q))
      : [...rooms]
          .sort((a, b) => (b.unreadCount > 0 ? 1 : 0) - (a.unreadCount > 0 ? 1 : 0))
          .slice(0, 8);

    const list: Item[] = matchedRooms
      .slice(0, 8)
      .map((room) => ({ kind: 'room', key: `r-${room.id}`, room }));
    hits.forEach((hit) => list.push({ kind: 'message', key: `m-${hit.id}`, hit }));
    if (!q) {
      list.push(
        {
          kind: 'action',
          key: 'a-new',
          label: 'New message',
          icon: <SquarePen className="w-4 h-4" />,
          run: onNewChat,
        },
        {
          kind: 'action',
          key: 'a-group',
          label: 'New group',
          icon: <Users className="w-4 h-4" />,
          run: onNewGroup,
        }
      );
    }
    return list;
  }, [query, rooms, hits, user?.id, onNewChat, onNewGroup]);

  const index = Math.min(rawIndex, Math.max(items.length - 1, 0));

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const select = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    if (item.kind === 'room') setActiveRoom(item.room);
    else if (item.kind === 'message') jumpToMessage(item.hit.roomId, item.hit.id);
    else item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      select(items[index]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  const roomItems = items.filter((i) => i.kind === 'room');
  const messageItems = items.filter((i) => i.kind === 'message');
  const actionItems = items.filter((i) => i.kind === 'action');
  const q = query.trim();

  const renderItem = (item: Item) => {
    const i = items.indexOf(item);
    const active = i === index;
    const common = {
      'data-index': i,
      role: 'option',
      'aria-selected': active,
      onMouseMove: () => setIndex(i),
      onClick: () => select(item),
      className: cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-md text-left',
        active ? 'bg-surface-2' : ''
      ),
    } as const;

    if (item.kind === 'room') {
      const title = getRoomTitle(item.room, user?.id);
      const peer = !item.room.isGroup ? item.room.members.find((m) => m.userId !== user?.id) : null;
      return (
        <button key={item.key} {...common}>
          <Avatar
            src={item.room.isGroup ? item.room.avatarUrl : peer?.user.avatarUrl}
            name={title}
            size="xs"
          />
          <span className="flex-1 truncate text-sm text-fg">{highlight(title, q)}</span>
          {item.room.unreadCount > 0 && (
            <span className="text-[11px] font-semibold text-accent">
              {item.room.unreadCount} unread
            </span>
          )}
        </button>
      );
    }
    if (item.kind === 'message') {
      const room = rooms.find((r) => r.id === item.hit.roomId);
      const where = room ? getRoomTitle(room, user?.id) : item.hit.room?.name || 'Conversation';
      return (
        <button key={item.key} {...common} className={cn(common.className, 'items-start')}>
          <MessageSquare className="w-4 h-4 mt-0.5 text-subtle shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="flex items-baseline justify-between gap-2 text-[12px] text-muted">
              <span className="truncate">
                <span className="font-medium text-fg">{item.hit.sender.displayName}</span>
                {room?.isGroup && <> in {where}</>}
              </span>
              <span className="shrink-0">{formatChatTimestamp(item.hit.createdAt)}</span>
            </span>
            <span className="block text-[13px] text-fg line-clamp-2">
              {highlight(
                snippet(
                  item.hit.local ? item.hit.content || '' : decodeEntities(item.hit.content || ''),
                  q
                ),
                q
              )}
            </span>
          </span>
        </button>
      );
    }
    return (
      <button key={item.key} {...common}>
        <span className="text-subtle">{item.icon}</span>
        <span className="text-sm text-fg">{item.label}</span>
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/40"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="w-full max-w-xl bg-surface border border-line rounded-xl shadow-2xl overflow-hidden"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2.5 px-4 h-12 border-b border-line">
          <Search className="w-4 h-4 text-subtle shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            placeholder="Search conversations and messages on this device"
            className="flex-1 bg-transparent outline-none text-[15px] text-fg placeholder:text-subtle"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
          />
          {searching && <Loader2 className="w-4 h-4 animate-spin text-subtle" />}
        </div>

        <div
          id="palette-results"
          ref={listRef}
          role="listbox"
          className="max-h-[55vh] overflow-y-auto p-2"
        >
          {roomItems.length > 0 && (
            <Section label={q ? 'Conversations' : 'Jump to'}>{roomItems.map(renderItem)}</Section>
          )}
          {messageItems.length > 0 && (
            <Section label="Messages">{messageItems.map(renderItem)}</Section>
          )}
          {actionItems.length > 0 && (
            <Section label="Actions">{actionItems.map(renderItem)}</Section>
          )}
          {q && !searching && items.length === 0 && (
            <div className="py-10 text-center">
              <Hash className="w-5 h-5 mx-auto text-subtle mb-2" />
              <p className="text-sm text-muted">No results for &ldquo;{q}&rdquo;</p>
            </div>
          )}
          {q.length === 1 && (
            <p className="px-3 py-2 text-[12px] text-subtle">
              Type at least 2 characters to search messages.
            </p>
          )}
        </div>

        <div className="flex items-center gap-4 px-4 h-9 border-t border-line text-[11px] text-subtle">
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate
          </span>
          <span>
            <Kbd>Enter</Kbd> open
          </span>
          <span>
            <Kbd>Esc</Kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-3 pt-2 pb-1 text-[11px] font-medium text-subtle">{label}</p>
      {children}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="font-sans px-1 py-px rounded border border-line bg-surface-2">{children}</kbd>
  );
}

function snippet(text: string, q: string): string {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 40) return text;
  return '…' + text.slice(i - 30);
}

function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-highlight text-fg rounded-sm">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}
