'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, Loader2, Lock, Monitor, Moon, Sun } from 'lucide-react';
import { e2ee, DeviceInfo, useE2EEStatus, useKeyVersion } from '@/lib/e2ee';
import { usePwa } from '@/lib/pwa';
import { useSignOut } from '@/lib/sign-out';
import { WallpaperPicker, WallpaperLayer } from '@/components/chat/Wallpaper';
import type { Accent, ThemeMode } from '@/lib/preferences';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Field, Input, Switch } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/auth-context';
import { usePreferences } from '@/lib/preferences';
import { api } from '@/lib/api';
import { cn, formatChatTimestamp, getErrorMessage, isMac } from '@/lib/utils';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'profile' | 'appearance' | 'preferences' | 'security' | 'shortcuts' | 'account';

const TABS: { id: Tab; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'security', label: 'Security' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'account', label: 'Account' },
];

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>('profile');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings" maxWidth="lg">
      <div className="flex gap-1 -mt-1 mb-5 border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'h-9 px-2.5 -mb-px text-[13px] font-medium border-b-2 transition-colors',
              tab === t.id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'profile' && <ProfileTab />}
      {tab === 'appearance' && <AppearanceTab />}
      {tab === 'preferences' && <PreferencesTab />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'shortcuts' && <ShortcutsTab />}
      {tab === 'account' && <AccountTab onClose={onClose} />}
    </Modal>
  );
}

function ProfileTab() {
  const { user, updateProfile } = useAuth();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [status, setStatus] = useState(user?.status || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dirty =
    displayName.trim() !== (user?.displayName || '') ||
    status.trim() !== (user?.status || '') ||
    avatarUrl !== (user?.avatarUrl || '');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      setIsUploading(true);
      const res = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data?.data?.fileUrl) setAvatarUrl(res.data.data.fileUrl);
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't upload that image"), { tone: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (displayName.trim().length < 2) {
      toast('Display name must be at least 2 characters.', { tone: 'error' });
      return;
    }
    try {
      setIsSaving(true);
      await updateProfile({
        displayName: displayName.trim(),
        status: status.trim(),
        avatarUrl: avatarUrl || undefined,
      });
      toast('Profile saved');
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't save your profile"), { tone: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="relative group rounded-full"
          aria-label="Change profile photo"
        >
          <Avatar src={avatarUrl} name={displayName || user?.displayName} size="lg" />
          <span className="absolute inset-0 rounded-full bg-black/45 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
            {isUploading ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : (
              <Camera className="w-5 h-5 text-white" />
            )}
          </span>
        </button>
        <div className="text-[13px]">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="font-medium text-accent hover:underline"
          >
            Upload photo
          </button>
          {avatarUrl && (
            <button
              type="button"
              onClick={() => setAvatarUrl('')}
              className="ml-3 text-muted hover:text-fg"
            >
              Remove
            </button>
          )}
          <p className="text-muted mt-0.5">PNG or JPG, up to 15 MB.</p>
        </div>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept="image/*"
          className="hidden"
        />
      </div>

      <Field
        label="Display name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        required
        minLength={2}
      />
      <Field
        label="Status"
        placeholder="e.g. In meetings until 3pm"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        maxLength={100}
        hint={`${status.length}/100`}
      />
      <Field
        label="Email"
        type="email"
        value={user?.email || ''}
        disabled
        hint="Your email can't be changed."
      />

      <div className="flex justify-end pt-1">
        <Button type="submit" loading={isSaving} disabled={!dirty || isUploading}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

function PreferencesTab() {
  const { prefs, update } = usePreferences();
  const { toast } = useToast();
  const notifSupported = typeof Notification !== 'undefined';
  const notifDenied = notifSupported && Notification.permission === 'denied';

  const pwa = usePwa();

  const toggleNotifications = async (on: boolean) => {
    if (!on) {
      update({ desktopNotifications: false });
      await pwa.disablePush();
      return;
    }
    if (!notifSupported)
      return toast("This browser doesn't support notifications.", { tone: 'error' });
    const permission =
      Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') {
      toast('Notifications are blocked. Allow them in your browser’s site settings.', {
        tone: 'error',
      });
      return;
    }
    update({ desktopNotifications: true });
    // Also subscribe to push so notifications arrive while CEngine is closed
    if (pwa.pushSupported) {
      try {
        await pwa.enablePush(prefs.mutedRooms);
      } catch (err) {
        toast(
          getErrorMessage(err, (err as Error)?.message || 'Push notifications are unavailable.'),
          {
            tone: 'error',
          }
        );
      }
    }
  };

  const onInstall = async () => {
    if (await pwa.install()) toast('CEngine was installed');
  };

  const mod = isMac ? '⌘' : 'Ctrl';

  return (
    <div className="divide-y divide-line">
      <div className="pb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-fg">Install CEngine</p>
          <p className="text-[13px] text-muted mt-0.5">
            {pwa.isInstalled
              ? 'Installed. CEngine opens in its own window and works offline.'
              : pwa.isIOS
                ? 'In Safari, tap Share, then “Add to Home Screen”.'
                : pwa.canInstall
                  ? 'Get its own window, an app icon, offline access and notifications.'
                  : 'Use your browser’s menu (“Install CEngine” or “Add to Home screen”).'}
          </p>
        </div>
        {pwa.canInstall && !pwa.isInstalled && (
          <Button size="sm" onClick={onInstall} className="shrink-0">
            Install
          </Button>
        )}
      </div>
      <div className="pb-3">
        <p className="text-sm text-fg">Send messages with</p>
        <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup">
          {[
            { value: 'enter' as const, title: 'Enter', sub: 'Shift+Enter adds a new line' },
            { value: 'mod-enter' as const, title: `${mod}+Enter`, sub: 'Enter adds a new line' },
          ].map((o) => (
            <button
              key={o.value}
              role="radio"
              aria-checked={prefs.sendKey === o.value}
              onClick={() => update({ sendKey: o.value })}
              className={cn(
                'text-left px-3 py-2 rounded-lg border transition-colors',
                prefs.sendKey === o.value
                  ? 'border-accent bg-accent-soft'
                  : 'border-line hover:bg-surface-2'
              )}
            >
              <span className="block text-sm font-medium text-fg">{o.title}</span>
              <span className="block text-[12px] text-muted">{o.sub}</span>
            </button>
          ))}
        </div>
      </div>
      <Switch
        label="Desktop notifications"
        description={
          notifDenied
            ? 'Blocked by your browser. Allow notifications for this site to turn this on.'
            : 'Get notified about new messages when CEngine is in the background. Muted conversations stay quiet.'
        }
        checked={prefs.desktopNotifications && !notifDenied}
        onChange={toggleNotifications}
      />
      <p className="pt-3 text-[12px] text-muted">These preferences are saved on this device.</p>
    </div>
  );
}

const THEMES: { id: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { id: 'system', label: 'System', icon: <Monitor className="w-4 h-4" /> },
  { id: 'light', label: 'Light', icon: <Sun className="w-4 h-4" /> },
  { id: 'dark', label: 'Dark', icon: <Moon className="w-4 h-4" /> },
];

const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: 'blue', label: 'Blue', swatch: '#3355d6' },
  { id: 'violet', label: 'Violet', swatch: '#6d44d4' },
  { id: 'green', label: 'Green', swatch: '#18805a' },
  { id: 'teal', label: 'Teal', swatch: '#0f7c8a' },
  { id: 'rose', label: 'Rose', swatch: '#c4365f' },
  { id: 'amber', label: 'Amber', swatch: '#b45d00' },
];

/** Static mini chat used to preview each theme option in its own colors. */
function ThemePreview({ mode }: { mode: 'light' | 'dark' }) {
  const c =
    mode === 'light'
      ? {
          bg: '#f6f6f7',
          bar: '#ffffff',
          line: '#e2e2e6',
          other: '#ffffff',
          own: 'var(--accent-l-bubble)',
        }
      : {
          bg: '#141518',
          bar: '#1b1c20',
          line: '#2d2e34',
          other: '#232429',
          own: 'var(--accent-d-bubble)',
        };
  return (
    <span className="block h-full w-full" style={{ background: c.bg }}>
      <span
        className="block h-3"
        style={{ background: c.bar, borderBottom: `1px solid ${c.line}` }}
      />
      <span
        className="block mt-2 ml-2 h-2.5 w-10 rounded-full"
        style={{ background: c.other, border: `1px solid ${c.line}` }}
      />
      <span
        className="block mt-1.5 ml-auto mr-2 h-2.5 w-12 rounded-full"
        style={{ background: c.own }}
      />
      <span
        className="block mt-1.5 ml-2 h-2.5 w-8 rounded-full"
        style={{ background: c.other, border: `1px solid ${c.line}` }}
      />
    </span>
  );
}

function AppearanceTab() {
  const { prefs, update } = usePreferences();

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-medium text-fg mb-2">Theme</h3>
        <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => {
            const selected = prefs.theme === t.id;
            return (
              <button
                key={t.id}
                role="radio"
                aria-checked={selected}
                onClick={() => update({ theme: t.id })}
                className="text-left"
              >
                <span
                  className={cn(
                    'relative flex h-20 rounded-lg overflow-hidden border-2 transition-colors',
                    selected ? 'border-accent' : 'border-line hover:border-line-strong'
                  )}
                >
                  {t.id === 'system' ? (
                    <>
                      <span className="w-1/2 overflow-hidden">
                        <ThemePreview mode="light" />
                      </span>
                      <span className="w-1/2 overflow-hidden">
                        <ThemePreview mode="dark" />
                      </span>
                    </>
                  ) : (
                    <ThemePreview mode={t.id} />
                  )}
                </span>
                <span className="mt-1.5 flex items-center gap-1.5 text-[13px] text-fg">
                  {t.icon}
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-fg mb-2">Accent color</h3>
        <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Accent color">
          {ACCENTS.map((a) => {
            const selected = prefs.accent === a.id;
            return (
              <button
                key={a.id}
                role="radio"
                aria-checked={selected}
                aria-label={a.label}
                title={a.label}
                onClick={() => update({ accent: a.id })}
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center ring-offset-2 ring-offset-surface transition-shadow',
                  selected ? 'ring-2 ring-fg/60' : 'hover:ring-2 hover:ring-line-strong'
                )}
                style={{ background: a.swatch }}
              >
                {selected && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-sm font-medium text-fg">Default chat wallpaper</h3>
          <span className="text-[12px] text-muted">Override it per chat from the chat details</span>
        </div>
        <div className="relative h-28 rounded-lg overflow-hidden border border-line mb-3">
          <WallpaperLayer value={prefs.wallpaper} />
          <div className="relative p-3 space-y-1.5 text-[13px]">
            <div className="w-fit max-w-[70%] px-3 py-1.5 rounded-xl rounded-tl-sm bg-bubble-other border border-line text-fg">
              Are we still on for Friday?
            </div>
            <div className="w-fit max-w-[70%] ml-auto px-3 py-1.5 rounded-xl rounded-tr-sm bg-bubble-own text-bubble-own-fg">
              Yes, see you at 7!
            </div>
          </div>
        </div>
        <WallpaperPicker
          value={prefs.wallpaper}
          onChange={(v) => update({ wallpaper: v ?? 'plain' })}
        />
      </section>

      <section className="pt-1 border-t border-line">
        <Switch
          label="Compact message spacing"
          description="Fit more messages on screen."
          checked={prefs.compactMode}
          onChange={(v) => update({ compactMode: v })}
        />
      </section>
    </div>
  );
}

function SecurityTab() {
  const { toast, confirm } = useToast();
  const signOut = useSignOut();
  const status = useE2EEStatus();
  const keyVersion = useKeyVersion();
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const current = e2ee.current;

  useEffect(() => {
    let cancelled = false;
    api
      .get('/keys/devices/me')
      .then((res) => !cancelled && setDevices(res.data?.data || []))
      .catch(() => !cancelled && setDevices([]));
    return () => {
      cancelled = true;
    };
  }, [keyVersion, status]);

  const remove = async (d: DeviceInfo) => {
    const ok = await confirm({
      title: `Remove ${d.name}?`,
      message:
        'It will stop receiving new encrypted messages. If someone signs in there again, it gets new keys and can’t read older messages.',
      confirmLabel: 'Remove device',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/keys/devices/${d.id}`);
      setDevices((prev) => prev?.filter((x) => x.id !== d.id) ?? null);
      toast('Device removed');
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't remove that device"), { tone: 'error' });
    }
  };

  const eraseThisDevice = async () => {
    const ok = await confirm({
      title: 'Erase this device’s keys?',
      message:
        'You’ll be signed out and this browser’s encryption keys and local search history are deleted. Messages received so far can’t be decrypted here again.',
      confirmLabel: 'Erase and sign out',
      destructive: true,
    });
    if (!ok) return;
    await e2ee.removeThisDevice();
    await signOut();
  };

  return (
    <div className="space-y-5">
      <section className="flex items-start gap-3 rounded-lg border border-line p-3">
        <span
          className={cn(
            'mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0',
            status === 'ready' ? 'bg-accent-soft text-success' : 'bg-danger-soft text-danger'
          )}
        >
          <Lock className="w-4 h-4" />
        </span>
        <div className="text-[13px]">
          <p className="font-medium text-fg">
            {status === 'ready'
              ? 'End-to-end encryption is on'
              : status === 'setting-up'
                ? 'Setting up encryption…'
                : 'Encryption isn’t set up on this device'}
          </p>
          <p className="text-muted mt-0.5">
            Each of your devices has its own key. Messages are encrypted separately for every device
            in a chat, and the private keys never leave the device.
          </p>
          {status === 'unavailable' && (
            <Button size="sm" className="mt-2" onClick={() => e2ee.retry()}>
              Try again
            </Button>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-fg mb-2">Your devices</h3>
        {devices === null ? (
          <div className="h-16 rounded-lg bg-surface-2 animate-pulse" />
        ) : devices.length === 0 ? (
          <p className="text-[13px] text-muted">No devices registered yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {devices.map((d) => {
              const isThis = d.id === current?.deviceId;
              return (
                <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Monitor className="w-4 h-4 text-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-fg truncate">
                      {d.name}
                      {isThis && <span className="text-success font-medium"> · This device</span>}
                    </p>
                    <p className="text-[12px] text-muted">
                      Added {formatChatTimestamp(d.createdAt)} · Key{' '}
                      <span className="font-mono">{d.publicKey.slice(-12)}</span>
                    </p>
                  </div>
                  {!isThis && (
                    <Button variant="ghost" size="sm" onClick={() => remove(d)}>
                      Remove
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-[12px] text-muted mt-2">
          Don&apos;t recognize a device? Remove it and change your password.
        </p>
      </section>

      <section className="rounded-lg border border-danger/30 p-3">
        <h3 className="text-sm font-medium text-fg">Erase this device</h3>
        <p className="text-[13px] text-muted mt-0.5">
          For shared computers: deletes this browser&apos;s keys and local search history, then
          signs you out.
        </p>
        <Button variant="danger-ghost" size="sm" className="mt-2 -ml-2" onClick={eraseThisDevice}>
          Erase and sign out
        </Button>
      </section>
    </div>
  );
}

function ShortcutsTab() {
  const mod = isMac ? '⌘' : 'Ctrl';
  const rows: [string, string][] = [
    [`${mod} K`, 'Search or jump to a conversation'],
    ['Alt ↑ / Alt ↓', 'Previous / next conversation'],
    ['Alt Shift ↓', 'Next unread conversation'],
    ['↑ (empty composer)', 'Edit your last message'],
    ['Esc', 'Cancel reply / jump to latest message'],
    ['Shift Enter', 'New line (when Enter sends)'],
  ];
  return (
    <dl className="divide-y divide-line">
      {rows.map(([keys, desc]) => (
        <div key={keys} className="flex items-center justify-between gap-4 py-2.5">
          <dt className="text-sm text-fg">{desc}</dt>
          <dd>
            <kbd className="font-sans text-[12px] px-1.5 py-0.5 rounded border border-line bg-surface-2 text-muted whitespace-nowrap">
              {keys}
            </kbd>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AccountTab({ onClose }: { onClose: () => void }) {
  const { user, deleteAccount } = useAuth();
  const signOut = useSignOut();
  const { disablePush } = usePwa();
  const { toast } = useToast();
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      // Remove this browser's push subscription, keys and local message data first
      await disablePush().catch(() => {});
      await e2ee.clearLocalData();
      await e2ee.removeThisDevice();
      await deleteAccount();
      onClose();
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't delete your account"), { tone: 'error' });
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-fg">Signed in as</p>
          <p className="text-[13px] text-muted">{user?.email}</p>
        </div>
        <Button variant="secondary" onClick={signOut}>
          Log out
        </Button>
      </div>

      <div className="rounded-lg border border-danger/30 p-4">
        <h3 className="text-sm font-semibold text-fg">Delete account</h3>
        <p className="text-[13px] text-muted mt-1">
          Permanently deletes your profile and message history. This can&apos;t be undone.
        </p>
        <label className="block text-[13px] text-fg mt-3 mb-1.5" htmlFor="confirm-delete">
          Type <span className="font-mono font-semibold">DELETE</span> to confirm
        </label>
        <div className="flex gap-2">
          <Input
            id="confirm-delete"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
          />
          <Button
            variant="danger"
            disabled={confirmText !== 'DELETE'}
            loading={isDeleting}
            onClick={handleDelete}
          >
            Delete account
          </Button>
        </div>
      </div>
    </div>
  );
}
