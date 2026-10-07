'use client';

import React, { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useChat } from '@/lib/chat-context';
import { useAuth } from '@/lib/auth-context';
import { getErrorMessage } from '@/lib/utils';
import { useUserSearch } from './UserSearch';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewChatModal({ isOpen, onClose }: NewChatModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New message" maxWidth="md">
      <NewChatContent onClose={onClose} />
    </Modal>
  );
}

/** Mounted only while the dialog is open, so its state starts fresh each time. */
function NewChatContent({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { rooms, createDirectChat, setActiveRoom, onlineMap } = useChat();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const { results, isSearching, error } = useUserSearch(query);

  // Existing direct conversations, most recent first, shown before the user types
  const recent = rooms
    .filter((r) => !r.isGroup)
    .slice(0, 6)
    .map((r) => ({ room: r, peer: r.members.find((m) => m.userId !== user?.id) }))
    .filter((x) => x.peer);

  const start = async (targetUserId: string) => {
    const existing = rooms.find(
      (r) => !r.isGroup && r.members.some((m) => m.userId === targetUserId)
    );
    if (existing) {
      setActiveRoom(existing);
      onClose();
      return;
    }
    try {
      setCreatingId(targetUserId);
      await createDirectChat(targetUserId);
      onClose();
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't start the conversation"), { tone: 'error' });
    } finally {
      setCreatingId(null);
    }
  };

  const q = query.trim();

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle" />
        <Input
          placeholder="Search by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
          aria-label="Search people"
          autoFocus
        />
      </div>

      <div className="mt-3 min-h-[240px] max-h-[340px] overflow-y-auto -mx-2">
        {!q ? (
          recent.length > 0 ? (
            <>
              <p className="px-2 pb-1 text-[12px] font-medium text-subtle">Recent</p>
              {recent.map(({ room, peer }) => (
                <PersonRow
                  key={room.id}
                  name={peer!.user.displayName}
                  sub={peer!.user.status}
                  avatarUrl={peer!.user.avatarUrl}
                  isOnline={onlineMap[peer!.userId] ?? peer!.user.isOnline}
                  onClick={() => start(peer!.userId)}
                />
              ))}
            </>
          ) : (
            <p className="px-2 py-10 text-center text-[13px] text-muted">
              Search for people by name or email address.
            </p>
          )
        ) : isSearching && results.length === 0 ? (
          <div className="flex justify-center py-10 text-subtle">
            <Loader2 className="w-5 h-5 animate-spin" aria-label="Searching" />
          </div>
        ) : error ? (
          <p className="px-2 py-10 text-center text-[13px] text-danger">
            Search failed. Check your connection and try again.
          </p>
        ) : results.length > 0 ? (
          results.map((u) => (
            <PersonRow
              key={u.id}
              name={u.displayName}
              sub={u.email}
              avatarUrl={u.avatarUrl}
              isOnline={onlineMap[u.id] ?? u.isOnline}
              loading={creatingId === u.id}
              disabled={!!creatingId}
              onClick={() => start(u.id)}
            />
          ))
        ) : (
          <p className="px-2 py-10 text-center text-[13px] text-muted">
            No one found for &ldquo;{q}&rdquo;. Check the spelling, or try their full email address.
          </p>
        )}
      </div>
    </>
  );
}

function PersonRow({
  name,
  sub,
  avatarUrl,
  isOnline,
  loading,
  disabled,
  onClick,
}: {
  name: string;
  sub?: string;
  avatarUrl: string | null;
  isOnline?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-surface-2 text-left disabled:opacity-60"
    >
      <Avatar src={avatarUrl} name={name} size="md" showPresence isOnline={isOnline} />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-fg truncate">{name}</span>
        {sub && <span className="block text-[13px] text-muted truncate">{sub}</span>}
      </span>
      {loading && <Loader2 className="w-4 h-4 animate-spin text-subtle" />}
    </button>
  );
}
