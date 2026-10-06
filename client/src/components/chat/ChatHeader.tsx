'use client';

import React, { useState } from 'react';
import { ArrowLeft, MoreVertical, Users, Info } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useChat } from '@/lib/chat-context';
import { useAuth } from '@/lib/auth-context';
import { GroupDetailsModal } from '@/components/modals/GroupDetailsModal';

export function ChatHeader() {
  const { user } = useAuth();
  const { activeRoom, setActiveRoom, onlineMap } = useChat();
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  if (!activeRoom) return null;

  const isGroup = activeRoom.isGroup;
  const peer = !isGroup ? activeRoom.members.find((m) => m.userId !== user?.id) : null;
  const isPeerOnline = peer ? onlineMap[peer.userId] ?? peer.user.isOnline ?? false : false;

  const title = isGroup ? activeRoom.name : peer?.user.displayName || 'Direct Chat';
  const subtitle = isGroup
    ? `${activeRoom.members.length} members`
    : isPeerOnline
    ? 'Online'
    : peer?.user.status || 'Offline';

  const avatarSrc = isGroup ? activeRoom.avatarUrl : peer?.user.avatarUrl;

  return (
    <>
      <header className="h-16 px-4 border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md flex items-center justify-between select-none z-10">
        <div className="flex items-center space-x-3 min-w-0">
          {/* Back button on small screens */}
          <button
            onClick={() => setActiveRoom(null)}
            className="md:hidden p-1.5 -ml-1 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl"
            title="Back to chats"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <button
            onClick={() => isGroup && setIsDetailsOpen(true)}
            className="flex items-center space-x-3 min-w-0 text-left hover:opacity-85 transition-opacity"
          >
            <Avatar
              src={avatarSrc}
              name={title}
              size="md"
              showPresence={!isGroup}
              isOnline={isPeerOnline}
            />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                {title}
              </h2>
              <p
                className={`text-xs truncate ${
                  isPeerOnline && !isGroup
                    ? 'text-emerald-500 font-medium'
                    : 'text-neutral-500 dark:text-neutral-400'
                }`}
              >
                {subtitle}
              </p>
            </div>
          </button>
        </div>

        <div className="flex items-center space-x-1">
          {isGroup && (
            <button
              onClick={() => setIsDetailsOpen(true)}
              title="Group info & members"
              className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
            >
              <Info className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {isGroup && (
        <GroupDetailsModal
          isOpen={isDetailsOpen}
          onClose={() => setIsDetailsOpen(false)}
          room={activeRoom}
        />
      )}
    </>
  );
}
