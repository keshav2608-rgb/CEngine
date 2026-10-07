'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload, WifiOff } from 'lucide-react';
import { Sidebar } from '@/components/chat/Sidebar';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { MessageList } from '@/components/chat/MessageList';
import { MessageInput, FILES_DROPPED_EVENT } from '@/components/chat/MessageInput';
import { CommandPalette } from '@/components/chat/CommandPalette';
import { NewChatModal } from '@/components/modals/NewChatModal';
import { CreateGroupModal } from '@/components/modals/CreateGroupModal';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth-context';
import { useChat } from '@/lib/chat-context';
import { isMac } from '@/lib/utils';
import { usePreferences } from '@/lib/preferences';
import { ScheduledProvider } from '@/lib/scheduled';
import { WallpaperLayer } from '@/components/chat/Wallpaper';
import { EncryptionUnavailableBanner } from '@/components/chat/Encryption';
import { OPEN_ROOM_EVENT, usePwa } from '@/lib/pwa';

export default function ChatDashboardPage() {
  return (
    <ScheduledProvider>
      <ChatDashboard />
    </ScheduledProvider>
  );
}

function ChatDashboard() {
  const { prefs } = usePreferences();
  const { isAuthenticated, isLoading } = useAuth();
  const { activeRoom, rooms, setActiveRoom, connectionState } = useChat();
  const router = useRouter();

  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
  }, [isAuthenticated, isLoading, router]);

  const openNewChat = useCallback(() => setIsNewChatOpen(true), []);
  const { syncPush } = usePwa();

  // Open a conversation from a notification click or a ?room= link; ?action=new from the app shortcut
  const pendingRoomRef = useRef<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    pendingRoomRef.current = params.get('room');
    if (params.get('action') === 'new') queueMicrotask(() => setIsNewChatOpen(true));
    if (params.has('room') || params.has('action')) window.history.replaceState(null, '', '/chat');
    const onOpen = (e: Event) => {
      pendingRoomRef.current = (e as CustomEvent<string>).detail;
      const room = rooms.find((r) => r.id === pendingRoomRef.current);
      if (room) {
        setActiveRoom(room);
        pendingRoomRef.current = null;
      }
    };
    window.addEventListener(OPEN_ROOM_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ROOM_EVENT, onOpen);
    // Only on mount; rooms are handled by the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const id = pendingRoomRef.current;
    if (!id) return;
    const room = rooms.find((r) => r.id === id);
    if (room) {
      pendingRoomRef.current = null;
      setActiveRoom(room);
    }
  }, [rooms, setActiveRoom]);

  // Keep this device's push subscription (and its muted chats) in sync with the server
  const mutedKey = prefs.mutedRooms.join(',');
  useEffect(() => {
    if (isAuthenticated && prefs.desktopNotifications)
      syncPush(mutedKey ? mutedKey.split(',') : []);
  }, [isAuthenticated, prefs.desktopNotifications, mutedKey, syncPush]);
  const openNewGroup = useCallback(() => setIsCreateGroupOpen(true), []);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen((open) => !open);
        return;
      }
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && rooms.length) {
        e.preventDefault();
        const idx = rooms.findIndex((r) => r.id === activeRoom?.id);
        if (e.shiftKey) {
          // Next unread conversation
          const next = rooms.find((r, i) => r.unreadCount > 0 && i !== idx);
          if (next) setActiveRoom(next);
          return;
        }
        const step = e.key === 'ArrowDown' ? 1 : -1;
        const nextIdx = idx === -1 ? 0 : (idx + step + rooms.length) % rooms.length;
        setActiveRoom(rooms[nextIdx]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rooms, activeRoom?.id, setActiveRoom]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <Loader2 className="w-5 h-5 text-subtle animate-spin" aria-label="Loading" />
      </div>
    );
  }

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

  return (
    <div className="flex-1 flex h-dvh w-full overflow-hidden">
      <div className={`${activeRoom ? 'hidden md:flex' : 'flex'} w-full md:w-auto h-full shrink-0`}>
        <Sidebar
          onNewChat={openNewChat}
          onNewGroup={openNewGroup}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenSearch={() => setIsPaletteOpen(true)}
        />
      </div>

      <main
        className={`${activeRoom ? 'flex' : 'hidden md:flex'} relative flex-1 min-w-0 flex-col h-full bg-app`}
        onDragEnter={(e) => {
          if (!activeRoom || !hasFiles(e)) return;
          dragDepth.current += 1;
          setIsDragging(true);
        }}
        onDragOver={(e) => activeRoom && hasFiles(e) && e.preventDefault()}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setIsDragging(false);
        }}
        onDrop={(e) => {
          if (!activeRoom || !hasFiles(e)) return;
          e.preventDefault();
          dragDepth.current = 0;
          setIsDragging(false);
          window.dispatchEvent(
            new CustomEvent(FILES_DROPPED_EVENT, { detail: Array.from(e.dataTransfer.files) })
          );
        }}
      >
        {connectionState === 'offline' && (
          <div
            role="status"
            className="shrink-0 flex items-center justify-center gap-2 h-8 bg-warning-soft text-warning text-[13px] border-b border-line"
          >
            <WifiOff className="w-3.5 h-3.5" />
            Connection lost. Reconnecting… Messages you send will go out once you&apos;re back
            online.
          </div>
        )}

        <EncryptionUnavailableBanner />

        {activeRoom ? (
          <>
            <ChatHeader />
            <div className="relative flex-1 min-h-0 flex flex-col">
              <WallpaperLayer value={prefs.roomWallpapers[activeRoom.id] ?? prefs.wallpaper} />
              <MessageList />
              <MessageInput />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <h2 className="text-base font-semibold text-fg">
              {rooms.length ? 'Select a conversation' : 'Start your first conversation'}
            </h2>
            <p className="text-[13px] text-muted max-w-xs mt-1 mb-5">
              {rooms.length
                ? `Pick one from the list, or press ${isMac ? '⌘' : 'Ctrl'}+K to jump to any conversation.`
                : 'Message someone directly or create a group for your team.'}
            </p>
            <div className="flex gap-2">
              <Button onClick={openNewChat}>New message</Button>
              <Button variant="secondary" onClick={openNewGroup}>
                New group
              </Button>
            </div>
          </div>
        )}

        {isDragging && (
          <div className="absolute inset-3 z-20 rounded-xl border-2 border-dashed border-accent bg-accent-soft/90 flex flex-col items-center justify-center gap-2 pointer-events-none">
            <Upload className="w-6 h-6 text-accent" />
            <p className="text-sm font-medium text-accent-soft-fg">Drop files to attach</p>
          </div>
        )}
      </main>

      <NewChatModal isOpen={isNewChatOpen} onClose={() => setIsNewChatOpen(false)} />
      <CreateGroupModal isOpen={isCreateGroupOpen} onClose={() => setIsCreateGroupOpen(false)} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        onNewChat={openNewChat}
        onNewGroup={openNewGroup}
      />
    </div>
  );
}
