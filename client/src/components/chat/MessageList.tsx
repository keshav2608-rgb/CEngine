'use client';

import React, { useRef, useEffect } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { MessageItem } from './MessageItem';
import { useChat } from '@/lib/chat-context';

export function MessageList() {
  const {
    messages,
    activeRoom,
    isLoadingMessages,
    hasMoreMessages,
    loadOlderMessages,
    typingUsers,
  } = useChat();

  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevMessagesLength = useRef(messages.length);

  // Group messages by date
  const formatDateDivider = (dateString: string) => {
    try {
      const d = new Date(dateString);
      if (isToday(d)) return 'Today';
      if (isYesterday(d)) return 'Yesterday';
      return format(d, 'MMMM d, yyyy');
    } catch {
      return '';
    }
  };

  // Scroll to bottom on initial load or new message sent
  useEffect(() => {
    if (messages.length > prevMessagesLength.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessagesLength.current = messages.length;
  }, [messages.length]);

  // Handle scroll upwards to load older messages
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollTop === 0 && hasMoreMessages && !isLoadingMessages) {
      loadOlderMessages();
    }
  };

  if (!activeRoom) return null;

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto py-4 space-y-1 bg-neutral-50/50 dark:bg-neutral-950/40"
    >
      {/* Loading older messages spinner */}
      {isLoadingMessages && (
        <div className="flex justify-center py-2">
          <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
        </div>
      )}

      {/* Empty State */}
      {messages.length === 0 && !isLoadingMessages ? (
        <div className="flex flex-col items-center justify-center h-full text-center px-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
            💬
          </div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            No messages yet
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Say hello and start the conversation!
          </p>
        </div>
      ) : (
        messages.map((message, index) => {
          const prevMsg = messages[index - 1];
          const isNewDay =
            !prevMsg ||
            new Date(prevMsg.createdAt).toDateString() !==
              new Date(message.createdAt).toDateString();

          return (
            <React.Fragment key={message.id}>
              {/* Date Divider */}
              {isNewDay && (
                <div className="flex items-center justify-center my-4">
                  <span className="px-3 py-1 rounded-full text-[11px] font-medium bg-neutral-200/60 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 shadow-2xs">
                    {formatDateDivider(message.createdAt)}
                  </span>
                </div>
              )}

              <MessageItem message={message} isGroup={activeRoom.isGroup} />
            </React.Fragment>
          );
        })
      )}

      {/* Typing Indicator */}
      {typingUsers.length > 0 && (
        <div className="flex items-center space-x-2 px-6 py-1 text-xs text-neutral-500 italic animate-pulse">
          <div className="flex space-x-1">
            <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" />
          </div>
          <span>
            {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
          </span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
