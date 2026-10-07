'use client';

import React, { useMemo, useState } from 'react';
import {
  SquarePen,
  Users,
  Search,
  Settings,
  LogOut,
  BellOff,
  Paperclip,
  CalendarClock,
  MonitorDown,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth-context';
import { useChat, Room, messagePreviewText } from '@/lib/chat-context';
import { useDrafts, usePreferences } from '@/lib/preferences';
import { useScheduled } from '@/lib/scheduled';
import { usePwa } from '@/lib/pwa';
import { useSignOut } from '@/lib/sign-out';
import { StatusTicks, deliveryState } from './StatusTicks';
import { cn, formatChatTimestamp, isMac } from '@/lib/utils';

interface SidebarProps {
  onNewChat: () => void;
  onNewGroup: () => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
}

type Filter = 'all' | 'unread';

export function getRoomTitle(room: Room, myId?: string) {
  if (room.isGroup) return room.name || 'Group';
  return room.members.find((m) => m.userId !== myId)?.user.displayName || 'Direct message';
}

export function Sidebar({ onNewChat, onNewGroup, onOpenSettings, onOpenSearch }: SidebarProps) {
  const { user } = useAuth();
  const signOut = useSignOut();
  const { rooms, activeRoom, setActiveRoom, onlineMap, isLoadingRooms, typingByRoom } = useChat();
  const { prefs } = usePreferences();
  const [filter, setFilter] = useState<Filter>('all');
  const { byRoom: scheduledByRoom } = useScheduled();
  const pwa = usePwa();
  const drafts = useDrafts(useMemo(() => rooms.map((r) => r.id), [rooms]));

  const unreadRooms = rooms.filter((r) => r.unreadCount > 0).length;
  const visibleRooms =
    filter === 'unread' ? rooms.filter((r) => r.unreadCount > 0 || r.id === activeRoom?.id) : rooms;

  return (
    <aside className="w-full md:w-[320px] lg:w-[340px] h-full flex flex-col bg-surface border-r border-line">
      {/* Header */}
      <div className="h-14 shrink-0 flex items-center justify-between pl-4 pr-2">
        <h1 className="text-[15px] font-semibold text-fg">Messages</h1>
        <div className="flex items-center gap-0.5">
          <IconButton label="New group" onClick={onNewGroup}>
            <Users className="w-[18px] h-[18px]" />
          </IconButton>
          <IconButton label="New message" onClick={onNewChat}>
            <SquarePen className="w-[18px] h-[18px]" />
          </IconButton>
        </div>
      </div>

      {/* Search trigger */}
      <div className="px-3 pb-2">
        <button
          onClick={onOpenSearch}
          className="w-full h-9 flex items-center gap-2 px-3 rounded-md border border-line bg-surface-2 text-[13px] text-subtle hover:border-line-strong transition-colors"
        >
          <Search className="w-4 h-4" />
          <span className="flex-1 text-left">Search or jump to…</span>
          <kbd className="hidden sm:inline font-sans text-[11px] px-1.5 py-0.5 rounded border border-line bg-surface">
            {isMac ? '⌘' : 'Ctrl'} K
          </kbd>
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-1 px-3 pb-2" role="tablist" aria-label="Filter conversations">
        {(['all', 'unread'] as Filter[]).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              'h-7 px-2.5 rounded-md text-[13px] font-medium transition-colors',
              filter === f ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg hover:bg-surface-2'
            )}
          >
            {f === 'all' ? 'All' : 'Unread'}
            {f === 'unread' && unreadRooms > 0 && (
              <span className="ml-1 text-muted">{unreadRooms}</span>
            )}
          </button>
        ))}
      </div>

      {/* Conversation list */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2" aria-label="Conversations">
        {isLoadingRooms && rooms.length === 0 ? (
          <RoomSkeleton />
        ) : visibleRooms.length > 0 ? (
          <ul className="space-y-px">
            {visibleRooms.map((room) => (
              <li key={room.id}>
                <RoomRow
                  room={room}
                  myId={user?.id}
                  isActive={activeRoom?.id === room.id}
                  isMuted={prefs.mutedRooms.includes(room.id)}
                  typing={typingByRoom[room.id]}
                  draft={activeRoom?.id === room.id ? undefined : drafts[room.id]}
                  scheduledCount={scheduledByRoom[room.id]?.length ?? 0}
                  isPeerOnline={(() => {
                    if (room.isGroup) return false;
                    const peer = room.members.find((m) => m.userId !== user?.id);
                    return peer ? (onlineMap[peer.userId] ?? peer.user.isOnline ?? false) : false;
                  })()}
                  onSelect={() => setActiveRoom(room)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-4 py-10 text-center">
            {filter === 'unread' ? (
              <p className="text-[13px] text-muted">You&apos;re all caught up.</p>
            ) : (
              <>
                <p className="text-sm font-medium text-fg">No conversations yet</p>
                <p className="text-[13px] text-muted mt-1 mb-4">
                  Find someone by name or email to start chatting.
                </p>
                <button
                  onClick={onNewChat}
                  className="h-8 px-3 rounded-md bg-accent text-accent-fg text-[13px] font-medium hover:bg-accent-hover"
                >
                  New message
                </button>
              </>
            )}
          </div>
        )}
      </nav>

      {/* Current user */}
      <div className="shrink-0 border-t border-line p-2 flex items-center gap-1">
        <button
          onClick={onOpenSettings}
          className="flex-1 min-w-0 flex items-center gap-2.5 p-1.5 rounded-md hover:bg-surface-2 text-left"
        >
          <Avatar src={user?.avatarUrl} name={user?.displayName} size="sm" showPresence isOnline />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-fg truncate">
              {user?.displayName}
            </span>
            <span className="block text-[12px] text-muted truncate">
              {user?.status || 'Set a status'}
            </span>
          </span>
        </button>
        {pwa.canInstall && !pwa.isInstalled && (
          <IconButton label="Install app" onClick={() => pwa.install()}>
            <MonitorDown className="w-[18px] h-[18px]" />
          </IconButton>
        )}
        <IconButton label="Settings" onClick={onOpenSettings}>
          <Settings className="w-[18px] h-[18px]" />
        </IconButton>
        <IconButton label="Log out" onClick={signOut}>
          <LogOut className="w-[18px] h-[18px]" />
        </IconButton>
      </div>
    </aside>
  );
}

function RoomRow({
  room,
  myId,
  isActive,
  isMuted,
  isPeerOnline,
  typing,
  draft,
  scheduledCount,
  onSelect,
}: {
  room: Room;
  myId?: string;
  isActive: boolean;
  isMuted: boolean;
  isPeerOnline: boolean;
  typing?: string[];
  draft?: string;
  scheduledCount: number;
  onSelect: () => void;
}) {
  const title = getRoomTitle(room, myId);
  const peer = !room.isGroup ? room.members.find((m) => m.userId !== myId) : null;
  const lastMsg = room.lastMessage;
  const hasUnread = room.unreadCount > 0 && !isActive;

  let preview: React.ReactNode;
  if (typing?.length) {
    preview = (
      <span className="text-accent">{room.isGroup ? `${typing[0]} is typing…` : 'typing…'}</span>
    );
  } else if (draft) {
    preview = (
      <>
        <span className="text-danger font-medium">Draft: </span>
        {draft}
      </>
    );
  } else if (!lastMsg) {
    preview = <span className="text-subtle">No messages yet</span>;
  } else if (lastMsg.isDeleted) {
    preview = <span className="italic">Message deleted</span>;
  } else {
    const isOwnLast = lastMsg.senderId === myId;
    const author = isOwnLast
      ? ''
      : room.isGroup
        ? `${lastMsg.sender.displayName.split(' ')[0]}: `
        : '';
    const body =
      lastMsg.content || lastMsg.sticker || (lastMsg.e2eeState && lastMsg.e2eeState !== 'ok') ? (
        messagePreviewText(lastMsg)
      ) : lastMsg.attachments?.length ? (
        <span className="inline-flex items-center gap-1 align-bottom">
          <Paperclip className="w-3 h-3" />
          {lastMsg.attachments.length > 1
            ? `${lastMsg.attachments.length} attachments`
            : lastMsg.attachments[0].fileName}
        </span>
      ) : (
        ''
      );
    preview = (
      <>
        {isOwnLast && (
          <span className="inline-flex align-[-3px] mr-1">
            <StatusTicks {...deliveryState(lastMsg, Math.max(room.members.length - 1, 1))} />
          </span>
        )}
        {author}
        {body}
      </>
    );
  }

  return (
    <button
      onClick={onSelect}
      aria-current={isActive ? 'true' : undefined}
      className={cn(
        'w-full flex items-center gap-3 px-2 py-2 rounded-md text-left transition-colors',
        isActive ? 'bg-accent-soft' : 'hover:bg-surface-2',
        isMuted && !isActive && 'opacity-70'
      )}
    >
      <Avatar
        src={room.isGroup ? room.avatarUrl : peer?.user.avatarUrl}
        name={title}
        size="md"
        showPresence={!room.isGroup}
        isOnline={isPeerOnline}
      />
      <span className="flex-1 min-w-0">
        <span className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              'truncate text-[14px]',
              hasUnread ? 'font-semibold text-fg' : 'font-medium text-fg',
              isActive && 'text-accent-soft-fg'
            )}
          >
            {title}
          </span>
          {lastMsg && (
            <span
              className={cn(
                'shrink-0 text-[11px]',
                hasUnread && !isMuted ? 'text-accent font-medium' : 'text-subtle'
              )}
            >
              {formatChatTimestamp(lastMsg.createdAt)}
            </span>
          )}
        </span>
        <span className="flex items-center justify-between gap-2 mt-0.5">
          <span className={cn('truncate text-[13px]', hasUnread ? 'text-fg' : 'text-muted')}>
            {preview}
          </span>
          <span className="flex items-center gap-1 shrink-0">
            {scheduledCount > 0 && (
              <CalendarClock
                className="w-3.5 h-3.5 text-subtle"
                aria-label={`${scheduledCount} scheduled`}
              />
            )}
            {isMuted && <BellOff className="w-3.5 h-3.5 text-subtle" aria-label="Muted" />}
            {hasUnread && (
              <span
                className={cn(
                  'min-w-[18px] h-[18px] px-1.5 rounded-full text-[11px] font-semibold inline-flex items-center justify-center',
                  isMuted ? 'bg-surface-3 text-muted' : 'bg-accent text-accent-fg'
                )}
                aria-label={`${room.unreadCount} unread`}
              >
                {room.unreadCount > 99 ? '99+' : room.unreadCount}
              </span>
            )}
          </span>
        </span>
      </span>
    </button>
  );
}

function RoomSkeleton() {
  return (
    <div className="space-y-1 animate-pulse" aria-label="Loading conversations">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2">
          <div className="w-10 h-10 rounded-full bg-surface-3" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/2 rounded bg-surface-3" />
            <div className="h-3 w-3/4 rounded bg-surface-2" />
          </div>
        </div>
      ))}
    </div>
  );
}
