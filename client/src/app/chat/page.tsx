'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Users, Loader2 } from 'lucide-react';
import { Sidebar } from '@/components/chat/Sidebar';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { MessageList } from '@/components/chat/MessageList';
import { MessageInput } from '@/components/chat/MessageInput';
import { NewChatModal } from '@/components/modals/NewChatModal';
import { CreateGroupModal } from '@/components/modals/CreateGroupModal';
import { useAuth } from '@/lib/auth-context';
import { useChat } from '@/lib/chat-context';

export default function ChatDashboardPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const { activeRoom } = useChat();
  const router = useRouter();

  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
        <span className="text-xs font-medium text-neutral-500">Connecting to CEngine...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-screen w-screen overflow-hidden bg-white dark:bg-neutral-950">
      {/* Sidebar: Always visible on desktop; on mobile, only visible when no activeRoom */}
      <div
        className={`${
          activeRoom ? 'hidden md:flex' : 'flex'
        } w-full md:w-auto h-full flex-shrink-0`}
      >
        <Sidebar />
      </div>

      {/* Main Chat Area: On mobile, only visible when activeRoom is selected */}
      <main
        className={`${
          activeRoom ? 'flex' : 'hidden md:flex'
        } flex-1 flex-col h-full overflow-hidden bg-neutral-50 dark:bg-neutral-950`}
      >
        {activeRoom ? (
          <div className="flex flex-col h-full">
            <ChatHeader />
            <MessageList />
            <MessageInput />
          </div>
        ) : (
          /* Empty Chat Area on Desktop */
          <div className="hidden md:flex flex-1 flex-col items-center justify-center text-center p-8 select-none">
            <div className="w-16 h-16 rounded-3xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4 shadow-sm">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
              Welcome to CEngine
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mt-1 mb-6">
              Select a conversation from the left to start chatting, or start a new 1:1 conversation or group.
            </p>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setIsNewChatOpen(true)}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors shadow-sm"
              >
                <MessageSquare className="w-4 h-4" />
                <span>New Direct Chat</span>
              </button>
              <button
                onClick={() => setIsCreateGroupOpen(true)}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <Users className="w-4 h-4" />
                <span>Create Group</span>
              </button>
            </div>
          </div>
        )}
      </main>

      <NewChatModal isOpen={isNewChatOpen} onClose={() => setIsNewChatOpen(false)} />
      <CreateGroupModal isOpen={isCreateGroupOpen} onClose={() => setIsCreateGroupOpen(false)} />
    </div>
  );
}
