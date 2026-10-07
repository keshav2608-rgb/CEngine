'use client';

import React, { useState } from 'react';
import { ArrowLeft, Bell, BellOff, PanelRight } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/Button';
import { useChat } from '@/lib/chat-context';
import { useAuth } from '@/lib/auth-context';
import { usePreferences } from '@/lib/preferences';
import { useToast } from '@/components/ui/Toast';
import { formatLastSeen } from '@/lib/utils';
import { ConversationDetailsModal } from '@/components/modals/ConversationDetailsModal';
import { DeviceChangeBanner, KeyChangeBanner } from './Encryption';

export function ChatHeader() {
  const { user } = useAuth();
  const { activeRoom, setActiveRoom, onlineMap, lastSeenMap, typingUsers } = useChat();
  const { prefs, toggleMute } = usePreferences();
  const { toast } = useToast();
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  if (!activeRoom) return null;

  const isGroup = activeRoom.isGroup;
  const peer = !isGroup ? activeRoom.members.find((m) => m.userId !== user?.id) : null;
  const isPeerOnline = peer ? (onlineMap[peer.userId] ?? peer.user.isOnline ?? false) : false;
  const isMuted = prefs.mutedRooms.includes(activeRoom.id);

  const title = isGroup ? activeRoom.name || 'Group' : peer?.user.displayName || 'Direct message';
  const onlineCount = isGroup
    ? activeRoom.members.filter(
        (m) => m.userId !== user?.id && (onlineMap[m.userId] ?? m.user.isOnline)
      ).length
    : 0;

  let subtitle: React.ReactNode;
  if (typingUsers.length) {
    subtitle = (
      <span className="text-accent">{isGroup ? `${typingUsers[0]} is typing…` : 'typing…'}</span>
    );
  } else if (isGroup) {
    subtitle = `${activeRoom.members.length} members${onlineCount ? ` · ${onlineCount} online` : ''}`;
  } else if (isPeerOnline) {
    subtitle = 'Online';
  } else {
    subtitle = formatLastSeen(peer ? (lastSeenMap[peer.userId] ?? peer.user.lastSeenAt) : null);
  }

  const onToggleMute = () => {
    toggleMute(activeRoom.id);
    toast(isMuted ? 'Notifications turned on' : 'Conversation muted. You won’t get notifications.');
  };

  return (
    <>
      <header className="h-14 shrink-0 px-2 sm:px-4 border-b border-line bg-surface flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          <IconButton
            label="Back to conversations"
            onClick={() => setActiveRoom(null)}
            className="md:hidden"
          >
            <ArrowLeft className="w-5 h-5" />
          </IconButton>

          <button
            onClick={() => setIsDetailsOpen(true)}
            className="flex items-center gap-3 min-w-0 text-left rounded-md px-1.5 py-1 hover:bg-surface-2 transition-colors"
          >
            <Avatar
              src={isGroup ? activeRoom.avatarUrl : peer?.user.avatarUrl}
              name={title}
              size="sm"
              showPresence={!isGroup}
              isOnline={isPeerOnline}
            />
            <div className="min-w-0">
              <h2 className="text-[14px] font-semibold text-fg truncate leading-tight">{title}</h2>
              <p className="text-[12px] text-muted truncate leading-tight mt-0.5">{subtitle}</p>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <IconButton
            label={isMuted ? 'Unmute conversation' : 'Mute conversation'}
            onClick={onToggleMute}
            active={isMuted}
          >
            {isMuted ? (
              <BellOff className="w-[18px] h-[18px]" />
            ) : (
              <Bell className="w-[18px] h-[18px]" />
            )}
          </IconButton>
          <IconButton label="Conversation details" onClick={() => setIsDetailsOpen(true)}>
            <PanelRight className="w-[18px] h-[18px]" />
          </IconButton>
        </div>
      </header>

      <KeyChangeBanner room={activeRoom} onReview={() => setIsDetailsOpen(true)} />
      <DeviceChangeBanner room={activeRoom} />

      <ConversationDetailsModal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        room={activeRoom}
      />
    </>
  );
}
