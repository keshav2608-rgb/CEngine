'use client';

import React, { useState } from 'react';
import { Search, Check, X, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Field, Input, Alert } from '@/components/ui/Input';
import { useChat } from '@/lib/chat-context';
import { cn, getErrorMessage } from '@/lib/utils';
import { useUserSearch, UserResult } from './UserSearch';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateGroupModal({ isOpen, onClose }: CreateGroupModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New group" maxWidth="md">
      <CreateGroupForm onClose={onClose} />
    </Modal>
  );
}

/** Mounted only while the dialog is open, so its state starts fresh each time. */
function CreateGroupForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<UserResult[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { results, isSearching } = useUserSearch(query);
  const { createGroup } = useChat();

  const toggle = (u: UserResult) => {
    setSelected((prev) =>
      prev.some((p) => p.id === u.id) ? prev.filter((p) => p.id !== u.id) : [...prev, u]
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give the group a name.');
    try {
      setIsSubmitting(true);
      setError('');
      await createGroup(
        name.trim(),
        description.trim() || undefined,
        selected.map((u) => u.id)
      );
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't create the group. Try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleCreate} className="space-y-4">
      {error && <Alert>{error}</Alert>}

      <Field
        label="Group name"
        placeholder="e.g. Design team"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        maxLength={80}
      />
      <Field
        label="Description"
        placeholder="What's this group for? (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={200}
      />

      <div>
        <p className="text-[13px] font-medium text-fg mb-1.5">
          Members <span className="text-muted font-normal">· {selected.length} added</span>
        </p>

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selected.map((u) => (
              <span
                key={u.id}
                className="inline-flex items-center gap-1.5 h-7 pl-1 pr-1 rounded-full bg-surface-2 border border-line text-[13px] text-fg"
              >
                <Avatar src={u.avatarUrl} name={u.displayName} size="xs" />
                {u.displayName}
                <button
                  type="button"
                  onClick={() => toggle(u)}
                  aria-label={`Remove ${u.displayName}`}
                  className="w-5 h-5 inline-flex items-center justify-center rounded-full text-subtle hover:text-fg hover:bg-surface-3"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle" />
          <Input
            placeholder="Add people by name or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            aria-label="Search people to add"
          />
        </div>

        {query.trim() && (
          <div className="mt-1.5 max-h-48 overflow-y-auto rounded-md border border-line p-1">
            {isSearching && results.length === 0 ? (
              <div className="flex justify-center py-4 text-subtle">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : results.length > 0 ? (
              results.map((u) => {
                const isSelected = selected.some((s) => s.id === u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggle(u)}
                    aria-pressed={isSelected}
                    className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-surface-2 text-left"
                  >
                    <Avatar src={u.avatarUrl} name={u.displayName} size="sm" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-fg truncate">{u.displayName}</span>
                      <span className="block text-[12px] text-muted truncate">{u.email}</span>
                    </span>
                    <span
                      className={cn(
                        'w-4 h-4 rounded flex items-center justify-center border',
                        isSelected ? 'bg-accent border-accent text-accent-fg' : 'border-line-strong'
                      )}
                    >
                      {isSelected && <Check className="w-3 h-3" strokeWidth={3} />}
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="py-4 text-center text-[13px] text-muted">No one found.</p>
            )}
          </div>
        )}
        <p className="mt-1.5 text-[12px] text-muted">
          You can also share an invite link after creating the group.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting} disabled={!name.trim()}>
          Create group
        </Button>
      </div>
    </form>
  );
}
