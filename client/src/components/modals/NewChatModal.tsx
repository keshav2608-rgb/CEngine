'use client';

import React, { useState, useEffect } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { api } from '@/lib/api';
import { useChat } from '@/lib/chat-context';

interface UserResult {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  isOnline: boolean;
}

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewChatModal({ isOpen, onClose }: NewChatModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const { createDirectChat } = useChat();

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        const res = await api.get(`/users/search?q=${encodeURIComponent(query)}`);
        if (res.data?.data) {
          setResults(res.data.data);
        }
      } catch (err) {
        console.error('Error searching users:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelectUser = async (targetUserId: string) => {
    try {
      setIsCreating(true);
      await createDirectChat(targetUserId);
      onClose();
    } catch (err) {
      console.error('Failed to create direct chat:', err);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Start a New Conversation">
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all text-neutral-900 dark:text-neutral-100"
          />
        </div>

        <div className="min-h-[220px] max-h-[300px] overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800">
          {isSearching ? (
            <div className="flex flex-col items-center justify-center py-10 text-neutral-400">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <span className="text-xs">Searching users...</span>
            </div>
          ) : results.length > 0 ? (
            results.map((u) => (
              <button
                key={u.id}
                onClick={() => handleSelectUser(u.id)}
                disabled={isCreating}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors text-left"
              >
                <div className="flex items-center space-x-3">
                  <Avatar
                    src={u.avatarUrl}
                    name={u.displayName}
                    size="md"
                    showPresence
                    isOnline={u.isOnline}
                  />
                  <div>
                    <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {u.displayName}
                    </h4>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {u.status || u.email}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  Message
                </span>
              </button>
            ))
          ) : query.trim() ? (
            <div className="text-center py-10 text-neutral-400 text-sm">
              No users found matching &ldquo;{query}&rdquo;
            </div>
          ) : (
            <div className="text-center py-10 text-neutral-400 text-sm">
              Type a name or email address to start chatting.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
