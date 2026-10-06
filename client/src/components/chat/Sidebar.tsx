'use client';

import React, { useState } from 'react';
import {
  MessageSquarePlus,
  Users,
  Search,
  Settings,
  LogOut,
  Check,
  CheckCheck,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/lib/auth-context';
import { useChat, Room } from '@/lib/chat-context';
import { formatChatTimestamp } from '@/lib/utils';
import { NewChatModal } from '@/components/modals/NewChatModal';
import { CreateGroupModal } from '@/components/modals/CreateGroupModal';
import { ProfileModal } from '@/components/modals/ProfileModal';

export function Sidebar() {
  const { user, logout } = useAuth();
  const { rooms, activeRoom, setActiveRoom, onlineMap, isLoadingRooms } = useChat();
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Filter rooms based on query
  const filteredRooms = rooms.filter((room) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    if (room.isGroup) {
      return room.name?.toLowerCase().includes(query);
    }
    const peer = room.members.find((m) => m.userId !== user?.id);
    return peer?.user.displayName.toLowerCase().includes(query);
  });

  const getRoomTitle = (room: Room) => {
    if (room.isGroup) return room.name || 'Group';
    const peer = room.members.find((m) => m.userId !== user?.id);
    return peer?.user.displayName || 'Direct Chat';
  };

  const getRoomAvatar = (room: Room) => {
    if (room.isGroup) {
      return {
        src: room.avatarUrl,
        name: room.name,
        isOnline: false,
        showPresence: false,
      };
    }
    const peer = room.members.find((m) => m.userId !== user?.id);
    const isPeerOnline = peer ? onlineMap[peer.userId] ?? peer.user.isOnline ?? false : false;
    return {
      src: peer?.user.avatarUrl,
      name: peer?.user.displayName,
      isOnline: isPeerOnline,
      showPresence: true,
    };
  };

  return (
    <>
      <aside className="w-full md:w-80 lg:w-96 h-full flex flex-col bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 select-none">
        {/* User Profile & Navigation Header */}
        <div className="p-3.5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <button
            onClick={() => setIsProfileOpen(true)}
            className="flex items-center space-x-2.5 p-1 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800/60 transition-colors text-left group"
          >
            <Avatar
              src={user?.avatarUrl}
              name={user?.displayName}
              size="sm"
              showPresence
              isOnline={true}
            />
            <div className="min-w-0 pr-1">
              <h3 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate group-hover:text-blue-600 transition-colors">
                {user?.displayName}
              </h3>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                {user?.status || 'Online'}
              </p>
            </div>
          </button>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setIsNewChatOpen(true)}
              title="New direct chat"
              className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
            >
              <MessageSquarePlus className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsCreateGroupOpen(true)}
              title="Create group"
              className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
            >
              <Users className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsProfileOpen(true)}
              title="Settings"
              className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={logout}
              title="Log out"
              className="p-2 text-neutral-400 hover:text-red-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-neutral-400"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {isLoadingRooms && rooms.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-400">
              Loading conversations...
            </div>
          ) : filteredRooms.length > 0 ? (
            filteredRooms.map((room) => {
              const title = getRoomTitle(room);
              const avatarProps = getRoomAvatar(room);
              const isActive = activeRoom?.id === room.id;
              const lastMsg = room.lastMessage;

              return (
                <button
                  key={room.id}
                  onClick={() => setActiveRoom(room)}
                  className={`w-full flex items-center space-x-3 p-2.5 rounded-2xl text-left transition-all ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100'
                      : 'hover:bg-neutral-100 dark:hover:bg-neutral-800/60 text-neutral-800 dark:text-neutral-200'
                  }`}
                >
                  <Avatar
                    src={avatarProps.src}
                    name={avatarProps.name}
                    size="md"
                    showPresence={avatarProps.showPresence}
                    isOnline={avatarProps.isOnline}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-semibold truncate">
                        {title}
                      </span>
                      {lastMsg && (
                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 flex-shrink-0 ml-1">
                          {formatChatTimestamp(lastMsg.createdAt)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate pr-2">
                        {lastMsg ? (
                          lastMsg.isDeleted ? (
                            <span className="italic text-neutral-400">Message deleted</span>
                          ) : (
                            lastMsg.content || (lastMsg.attachments?.length ? '📷 Attachment' : '...')
                          )
                        ) : (
                          <span className="text-neutral-400 italic">No messages yet</span>
                        )}
                      </p>

                      {room.unreadCount > 0 && (
                        <span className="flex-shrink-0 min-w-4 h-4 px-1 rounded-full bg-blue-600 text-[10px] font-bold text-white flex items-center justify-center">
                          {room.unreadCount > 99 ? '99+' : room.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="py-12 px-4 text-center">
              <p className="text-xs text-neutral-400 mb-3">
                {searchQuery ? 'No chats found' : 'No chats yet'}
              </p>
              <button
                onClick={() => setIsNewChatOpen(true)}
                className="px-3.5 py-1.5 text-xs font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-xs"
              >
                Start a Conversation
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Modals */}
      <NewChatModal isOpen={isNewChatOpen} onClose={() => setIsNewChatOpen(false)} />
      <CreateGroupModal isOpen={isCreateGroupOpen} onClose={() => setIsCreateGroupOpen(false)} />
      <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
    </>
  );
}
