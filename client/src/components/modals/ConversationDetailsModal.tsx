'use client';

import React, { useState } from 'react';
import { Copy, Check, LogOut, Ban, Flag, BellOff, Bell } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useChat, Room } from '@/lib/chat-context';
import { useAuth } from '@/lib/auth-context';
import { usePreferences } from '@/lib/preferences';
import { api } from '@/lib/api';
import { cn, formatLastSeen, getErrorMessage } from '@/lib/utils';
import { WallpaperPicker } from '@/components/chat/Wallpaper';
import { EncryptionSection } from '@/components/chat/Encryption';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  room: Room;
}

const REPORT_REASONS = [
  'Spam',
  'Harassment or bullying',
  'Impersonation',
  'Inappropriate content',
  'Other',
];

export function ConversationDetailsModal({ isOpen, onClose, room }: Props) {
  const { user } = useAuth();
  const { refreshRooms, setActiveRoom, onlineMap, lastSeenMap } = useChat();
  const { prefs, toggleMute, update } = usePreferences();
  const { toast, confirm } = useToast();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDetails, setReportDetails] = useState('');

  const isGroup = room.isGroup;
  const peer = !isGroup ? room.members.find((m) => m.userId !== user?.id) : null;
  const me = room.members.find((m) => m.userId === user?.id);
  const canManage = me?.role === 'OWNER' || me?.role === 'ADMIN';
  const isMuted = prefs.mutedRooms.includes(room.id);
  const isOnline = (id: string, fallback?: boolean) => onlineMap[id] ?? fallback ?? false;

  const inviteUrl =
    typeof window !== 'undefined' && room.inviteCode
      ? `${window.location.origin}/invite/${room.inviteCode}`
      : '';

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Couldn't copy the link", { tone: 'error' });
    }
  };

  const removeMember = async (targetUserId: string, name: string) => {
    const ok = await confirm({
      title: `Remove ${name}?`,
      message: 'They will lose access to this group and its messages.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/chats/${room.id}/members/${targetUserId}`);
      await refreshRooms();
      toast(`${name} was removed`);
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't remove member"), { tone: 'error' });
    }
  };

  const leaveGroup = async () => {
    const ok = await confirm({
      title: `Leave ${room.name}?`,
      message: "You won't receive new messages unless someone invites you back.",
      confirmLabel: 'Leave group',
      destructive: true,
    });
    if (!ok) return;
    try {
      setBusy(true);
      await api.delete(`/chats/${room.id}/members/${user?.id}`);
      onClose();
      setActiveRoom(null);
      await refreshRooms();
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't leave the group"), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const blockPeer = async () => {
    if (!peer) return;
    const ok = await confirm({
      title: `Block ${peer.user.displayName}?`,
      message:
        "Neither of you will be able to send messages in this conversation. They won't be notified.",
      confirmLabel: 'Block',
      destructive: true,
    });
    if (!ok) return;
    try {
      setBusy(true);
      await api.post(`/users/block/${peer.userId}`);
      toast(`${peer.user.displayName} is blocked`, {
        action: {
          label: 'Undo',
          onClick: () => {
            api.delete(`/users/block/${peer.userId}`).then(
              () => toast('Unblocked'),
              () => toast("Couldn't unblock", { tone: 'error' })
            );
          },
        },
      });
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't block this user"), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const submitReport = async () => {
    if (!peer) return;
    try {
      setBusy(true);
      await api.post('/users/report', {
        reportedId: peer.userId,
        reason: reportReason,
        details: reportDetails.trim() || undefined,
      });
      setReporting(false);
      setReportDetails('');
      toast('Thanks. Your report was sent for review.');
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't send the report"), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const title = isGroup ? room.name || 'Group' : peer?.user.displayName || 'Conversation';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isGroup ? 'Group details' : 'Contact details'}
      maxWidth="lg"
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3.5">
          <Avatar
            src={isGroup ? room.avatarUrl : peer?.user.avatarUrl}
            name={title}
            size="lg"
            showPresence={!isGroup}
            isOnline={peer ? isOnline(peer.userId, peer.user.isOnline) : false}
          />
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-fg truncate">{title}</h3>
            <p className="text-[13px] text-muted">
              {isGroup
                ? `${room.members.length} members`
                : peer && isOnline(peer.userId, peer.user.isOnline)
                  ? 'Online'
                  : formatLastSeen(
                      peer ? (lastSeenMap[peer.userId] ?? peer.user.lastSeenAt) : null
                    )}
            </p>
            {(isGroup ? room.description : peer?.user.status) && (
              <p className="text-[13px] text-fg mt-1">
                {isGroup ? room.description : peer?.user.status}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={() => toggleMute(room.id)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-line hover:bg-surface-2 text-left"
        >
          {isMuted ? (
            <BellOff className="w-4 h-4 text-muted" />
          ) : (
            <Bell className="w-4 h-4 text-muted" />
          )}
          <span className="flex-1 text-sm text-fg">{isMuted ? 'Muted' : 'Notifications on'}</span>
          <span className="text-[13px] text-accent font-medium">{isMuted ? 'Unmute' : 'Mute'}</span>
        </button>

        <EncryptionSection room={room} />

        <section>
          <h4 className="text-[13px] font-medium text-fg mb-2">Chat wallpaper</h4>
          <WallpaperPicker
            value={prefs.roomWallpapers[room.id]}
            defaultValue={prefs.wallpaper}
            onChange={(value) => {
              const next = { ...prefs.roomWallpapers };
              if (value === undefined) delete next[room.id];
              else next[room.id] = value;
              update({ roomWallpapers: next });
            }}
          />
          <p className="text-[12px] text-muted mt-2">Only you see this, on this device.</p>
        </section>

        {isGroup && room.inviteCode && (
          <section>
            <h4 className="text-[13px] font-medium text-fg mb-1.5">Invite link</h4>
            <div className="flex gap-2">
              <Input
                readOnly
                value={inviteUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="text-muted"
              />
              <Button variant="secondary" onClick={copyInviteLink} className="shrink-0">
                {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="text-[12px] text-muted mt-1.5">
              Anyone with this link can join the group.
            </p>
          </section>
        )}

        {isGroup && (
          <section>
            <h4 className="text-[13px] font-medium text-fg mb-1.5">Members</h4>
            <ul className="max-h-64 overflow-y-auto -mx-1">
              {[...room.members]
                .sort(
                  (a, b) =>
                    roleRank(a.role) - roleRank(b.role) ||
                    a.user.displayName.localeCompare(b.user.displayName)
                )
                .map((member) => {
                  const isSelf = member.userId === user?.id;
                  return (
                    <li key={member.id} className="flex items-center gap-3 px-1 py-1.5 rounded-md">
                      <Avatar
                        src={member.user.avatarUrl}
                        name={member.user.displayName}
                        size="sm"
                        showPresence
                        isOnline={isOnline(member.userId, member.user.isOnline)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-fg truncate">
                          {member.user.displayName}
                          {isSelf && <span className="text-muted"> (you)</span>}
                        </p>
                        {member.user.status && (
                          <p className="text-[12px] text-muted truncate">{member.user.status}</p>
                        )}
                      </div>
                      {member.role !== 'MEMBER' && (
                        <span
                          className={cn(
                            'text-[11px] font-medium px-1.5 py-0.5 rounded',
                            member.role === 'OWNER'
                              ? 'bg-warning-soft text-warning'
                              : 'bg-accent-soft text-accent-soft-fg'
                          )}
                        >
                          {member.role === 'OWNER' ? 'Owner' : 'Admin'}
                        </span>
                      )}
                      {canManage && !isSelf && member.role !== 'OWNER' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeMember(member.userId, member.user.displayName)}
                        >
                          Remove
                        </Button>
                      )}
                    </li>
                  );
                })}
            </ul>
          </section>
        )}

        {!isGroup && peer && reporting && (
          <section className="rounded-lg border border-line p-3 space-y-3">
            <h4 className="text-[13px] font-medium text-fg">Report {peer.user.displayName}</h4>
            <div className="flex flex-wrap gap-1.5">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReportReason(r)}
                  aria-pressed={reportReason === r}
                  className={cn(
                    'px-2.5 h-7 rounded-full text-[13px] border transition-colors',
                    reportReason === r
                      ? 'bg-accent-soft border-accent/40 text-accent-soft-fg'
                      : 'border-line text-muted hover:text-fg'
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              placeholder="Add details (optional)"
              rows={3}
              className="w-full resize-none rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-subtle outline-none focus:border-accent"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setReporting(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={submitReport} loading={busy}>
                Send report
              </Button>
            </div>
          </section>
        )}

        <div className="pt-3 border-t border-line flex flex-wrap gap-1">
          {isGroup ? (
            <Button variant="danger-ghost" onClick={leaveGroup} disabled={busy}>
              <LogOut className="w-4 h-4" />
              Leave group
            </Button>
          ) : (
            <>
              <Button variant="danger-ghost" onClick={blockPeer} disabled={busy}>
                <Ban className="w-4 h-4" />
                Block
              </Button>
              {!reporting && (
                <Button variant="ghost" onClick={() => setReporting(true)}>
                  <Flag className="w-4 h-4" />
                  Report
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function roleRank(role: 'OWNER' | 'ADMIN' | 'MEMBER') {
  return role === 'OWNER' ? 0 : role === 'ADMIN' ? 1 : 2;
}
