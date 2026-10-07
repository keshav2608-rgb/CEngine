'use client';

import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Lock, MonitorSmartphone, ShieldAlert, ShieldCheck, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth-context';
import type { Room } from '@/lib/chat-context';
import { e2ee, readVerified, setVerified, useE2EEStatus, useKeyVersion } from '@/lib/e2ee';

function subscribeVerified(fn: () => void) {
  window.addEventListener('cengine:verified', fn);
  window.addEventListener('storage', fn);
  return () => {
    window.removeEventListener('cengine:verified', fn);
    window.removeEventListener('storage', fn);
  };
}

/** The confirmed security code for a contact (or undefined), kept in sync across components. */
function useVerifiedNumber(peerId: string | undefined): string | undefined {
  return useSyncExternalStore(
    subscribeVerified,
    () => (peerId ? readVerified()[peerId] : undefined),
    () => undefined
  );
}

/** Security code with a contact, recomputed when either side's keys change. */
function useSafetyNumber(peerId: string | undefined) {
  const keyVersion = useKeyVersion();
  const status = useE2EEStatus();
  const [result, setResult] = useState<{ peerId: string; version: number; number: string } | null>(
    null
  );

  useEffect(() => {
    if (!peerId || status !== 'ready') return;
    let cancelled = false;
    e2ee
      .safetyNumberWith(peerId)
      .then((number) => !cancelled && setResult({ peerId, version: keyVersion, number }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [peerId, keyVersion, status]);

  return result && result.peerId === peerId ? result.number : null;
}

export function useVerification(peerId: string | undefined) {
  const number = useSafetyNumber(peerId);
  const verified = useVerifiedNumber(peerId);
  const state: 'verified' | 'changed' | 'unverified' = !verified
    ? 'unverified'
    : number && number !== verified
      ? 'changed'
      : 'verified';
  return { number, state };
}

/** Encryption + verification section for the conversation details dialog. */
export function EncryptionSection({ room }: { room: Room }) {
  const { user } = useAuth();
  const peer = !room.isGroup ? room.members.find((m) => m.userId !== user?.id) : null;
  const { number, state } = useVerification(peer?.userId);
  const status = useE2EEStatus();

  return (
    <section className="rounded-lg border border-line p-3">
      <h4 className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
        <Lock className="w-3.5 h-3.5 text-success" />
        End-to-end encrypted
      </h4>
      <p className="text-[12.5px] text-muted mt-1">
        Messages and files are encrypted on your device and can only be read by the people in this
        chat. CEngine&apos;s servers can&apos;t read them.
      </p>

      {status === 'unavailable' && (
        <p className="text-[12.5px] text-danger mt-2">
          Encryption isn&apos;t set up on this device yet.
        </p>
      )}

      {peer && (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <p className="text-[13px] font-medium text-fg">Security code</p>
            {state === 'verified' && (
              <span className="inline-flex items-center gap-1 text-[12px] font-medium text-success">
                <ShieldCheck className="w-3.5 h-3.5" /> Verified
              </span>
            )}
            {state === 'changed' && (
              <span className="inline-flex items-center gap-1 text-[12px] font-medium text-warning">
                <ShieldAlert className="w-3.5 h-3.5" /> Changed
              </span>
            )}
          </div>
          {number ? (
            <p className="font-mono text-[13px] leading-6 tracking-wide text-fg bg-surface-2 rounded-md px-3 py-2 select-all">
              {number}
            </p>
          ) : (
            <div className="h-[64px] rounded-md bg-surface-2 animate-pulse" />
          )}
          <p className="text-[12px] text-muted mt-1.5">
            Compare this code with {peer.user.displayName} in person or on a call. If it matches on
            both screens, no one is intercepting your messages.
          </p>
          <div className="flex justify-end mt-2">
            {state === 'verified' ? (
              <Button variant="ghost" size="sm" onClick={() => setVerified(peer.userId, null)}>
                Clear verification
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={!number}
                onClick={() => number && setVerified(peer.userId, number)}
              >
                {state === 'changed' ? 'Verify again' : 'Mark as verified'}
              </Button>
            )}
          </div>
        </div>
      )}
      {room.isGroup && (
        <p className="text-[12px] text-muted mt-2">
          To verify someone in this group, open your direct chat with them and compare security
          codes.
        </p>
      )}
    </section>
  );
}

/** Warning shown in a direct chat when a verified contact's keys change. */
export function KeyChangeBanner({ room, onReview }: { room: Room; onReview: () => void }) {
  const { user } = useAuth();
  const peer = !room.isGroup ? room.members.find((m) => m.userId !== user?.id) : null;
  const { state } = useVerification(peer?.userId);
  if (!peer || state !== 'changed') return null;
  return (
    <div
      role="alert"
      className="shrink-0 flex items-center gap-2 px-4 py-2 bg-warning-soft text-warning text-[13px] border-b border-line"
    >
      <ShieldAlert className="w-4 h-4 shrink-0" />
      <span className="flex-1">
        Your security code with {peer.user.displayName} changed. This usually means they signed in
        on a new device.
      </span>
      <button onClick={onReview} className="font-medium underline underline-offset-2">
        Review
      </button>
    </div>
  );
}

/** Shown when this device couldn't set up encryption keys. */
export function EncryptionUnavailableBanner() {
  const status = useE2EEStatus();
  if (status !== 'unavailable') return null;
  return (
    <div
      role="alert"
      className="shrink-0 flex items-center gap-2 px-4 py-2 bg-danger-soft text-danger text-[13px] border-b border-line"
    >
      <ShieldAlert className="w-4 h-4 shrink-0" />
      <span className="flex-1">
        End-to-end encryption couldn&apos;t be set up on this device, so messages can&apos;t be sent
        or read here.
      </span>
      <button
        onClick={() => e2ee.retry()}
        className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
      >
        <RefreshCw className="w-3.5 h-3.5" /> Retry
      </button>
    </div>
  );
}

/**
 * Notice when someone in this chat (or your own account) gets a new device. Messages you send
 * are encrypted for every device, so an unexpected one is worth checking.
 */
export function DeviceChangeBanner({ room }: { room: Room }) {
  const { user } = useAuth();
  const status = useE2EEStatus();
  const keyVersion = useKeyVersion();
  const memberIds = useMemo(() => room.members.map((m) => m.userId), [room.members]);

  useEffect(() => {
    if (status === 'ready') e2ee.getDevices(memberIds).catch(() => {});
  }, [memberIds, status]);

  // keyVersion changes whenever device lists are fetched or acknowledged
  const changes = useMemo(
    () => (status === 'ready' ? e2ee.newDevices(memberIds) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memberIds, status, keyVersion]
  );
  if (!changes.length) return null;

  const name = (id: string) =>
    id === user?.id
      ? 'your account'
      : (room.members.find((m) => m.userId === id)?.user.displayName ?? 'Someone');
  const mine = changes.find((c) => c.userId === user?.id);

  return (
    <div
      role="status"
      className="shrink-0 flex items-start gap-2 px-4 py-2 bg-accent-soft text-accent-soft-fg text-[13px] border-b border-line"
    >
      <MonitorSmartphone className="w-4 h-4 shrink-0 mt-px" />
      <span className="flex-1">
        {changes
          .map(
            (c) => `New device for ${name(c.userId)}: ${c.devices.map((d) => d.name).join(', ')}`
          )
          .join(' · ')}
        .{' '}
        {mine
          ? 'Not you? Remove it in Settings → Security and change your password.'
          : 'If you didn’t expect this, compare security codes in the chat details.'}
      </span>
      <button
        onClick={() => e2ee.acknowledgeDevices(changes.map((c) => c.userId))}
        className="font-medium underline underline-offset-2 shrink-0"
      >
        Got it
      </button>
    </div>
  );
}
