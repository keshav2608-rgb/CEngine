'use client';

import React, { useState } from 'react';
import { Copy, Check, UserMinus, LogOut, ShieldAlert } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { useChat, Room } from '@/lib/chat-context';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

interface GroupDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: Room;
}

export function GroupDetailsModal({ isOpen, onClose, room }: GroupDetailsModalProps) {
  const { user } = useAuth();
  const { refreshRooms, setActiveRoom } = useChat();
  const [copied, setCopied] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const inviteUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/invite/${room.inviteCode}`
    : `/invite/${room.inviteCode}`;

  const currentMembership = room.members.find((m) => m.userId === user?.id);
  const isOwnerOrAdmin =
    currentMembership?.role === 'OWNER' || currentMembership?.role === 'ADMIN';

  const copyInviteLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return;
    try {
      await api.delete(`/chats/${room.id}/members/${targetUserId}`);
      await refreshRooms();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to remove member');
    }
  };

  const handleLeaveGroup = async () => {
    if (!confirm('Are you sure you want to leave this group?')) return;
    try {
      setIsLeaving(true);
      await api.delete(`/chats/${room.id}/members/${user?.id}`);
      await refreshRooms();
      setActiveRoom(null);
      onClose();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to leave group');
    } finally {
      setIsLeaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Group Details" maxWidth="lg">
      <div className="space-y-6">
        {/* Group Header Info */}
        <div className="flex items-center space-x-4 p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50">
          <Avatar src={room.avatarUrl} name={room.name} size="lg" />
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              {room.name}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              {room.members.length} members
            </p>
            {room.description && (
              <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-1">
                {room.description}
              </p>
            )}
          </div>
        </div>

        {/* Invite Link Section */}
        {room.inviteCode && (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
              Shareable Browser Invite Link
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 select-all"
              />
              <button
                type="button"
                onClick={copyInviteLink}
                className="flex items-center space-x-1.5 px-3 py-2 text-xs font-medium rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:opacity-90 transition-opacity"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Anyone with this link can join the group directly from a web browser without installing anything.
            </p>
          </div>
        )}

        {/* Members List */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
            Group Members ({room.members.length})
          </h4>
          <div className="max-h-56 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800 rounded-xl border border-neutral-100 dark:border-neutral-800 p-1">
            {room.members.map((member) => {
              const isSelf = member.userId === user?.id;
              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-2.5 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <Avatar
                      src={member.user.avatarUrl}
                      name={member.user.displayName}
                      size="sm"
                      showPresence
                      isOnline={member.user.isOnline}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100 truncate">
                          {member.user.displayName} {isSelf && '(You)'}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            member.role === 'OWNER'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                              : member.role === 'ADMIN'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                              : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                          }`}
                        >
                          {member.role.toLowerCase()}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 truncate">
                        {member.user.status || 'Member'}
                      </p>
                    </div>
                  </div>

                  {isOwnerOrAdmin && !isSelf && member.role !== 'OWNER' && (
                    <button
                      onClick={() => handleRemoveMember(member.userId)}
                      title="Remove member"
                      className="p-1.5 text-neutral-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    >
                      <UserMinus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Leave Group Action */}
        <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex justify-between items-center">
          <button
            onClick={handleLeaveGroup}
            disabled={isLeaving}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Leave Group</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
