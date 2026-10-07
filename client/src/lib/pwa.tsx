'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useToast } from '@/components/ui/Toast';

/** Fired on window when a notification click asks the app to open a conversation. */
export const OPEN_ROOM_EVENT = 'cengine:open-room';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaContextType {
  /** Running as an installed app (standalone window). */
  isInstalled: boolean;
  /** The browser offered an install prompt we can show. */
  canInstall: boolean;
  /** iOS Safari: install is manual (Share → Add to Home Screen). */
  isIOS: boolean;
  install: () => Promise<boolean>;
  pushSupported: boolean;
  /** Subscribe this browser to push (asks for permission if needed). */
  enablePush: (mutedRoomIds: string[]) => Promise<boolean>;
  disablePush: () => Promise<void>;
  /** Keep the server's copy of this device's muted rooms in sync. */
  syncPush: (mutedRoomIds: string[]) => Promise<void>;
}

const PwaContext = createContext<PwaContextType | undefined>(undefined);

// Register the worker in production; set NEXT_PUBLIC_ENABLE_SW=1 to try it in development.
const SW_ENABLED =
  process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_ENABLE_SW === '1';
const UPDATE_CHECK_MS = 30 * 60 * 1000;

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const installEventRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);

  // ------------------------------------------------------- service worker + updates
  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const push =
      'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    // Browser capabilities are only known after mount
    queueMicrotask(() => {
      setIsInstalled(standalone);
      setIsIOS(ios && !standalone);
      setPushSupported(SW_ENABLED && push);
    });

    if (!SW_ENABLED || !('serviceWorker' in navigator)) return;

    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    const promptUpdate = (worker: ServiceWorker) => {
      toast('A new version of CEngine is available.', {
        duration: 60 * 60 * 1000,
        action: {
          label: 'Reload',
          onClick: () => worker.postMessage({ type: 'SKIP_WAITING' }),
        },
      });
    };

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'open-room' && event.data.roomId) {
        window.dispatchEvent(new CustomEvent(OPEN_ROOM_EVENT, { detail: event.data.roomId }));
      }
    };

    let interval: ReturnType<typeof setInterval> | undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') registrationRef.current?.update().catch(() => {});
    };

    navigator.serviceWorker
      .register(`/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_ID || 'dev'}`, { scope: '/' })
      .then((registration) => {
        registrationRef.current = registration;
        // An update already downloaded and waiting (e.g. from a previous visit)
        if (registration.waiting && navigator.serviceWorker.controller) {
          promptUpdate(registration.waiting);
        }
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            // Only prompt for updates, not for the very first install
            if (worker.state === 'installed' && navigator.serviceWorker.controller)
              promptUpdate(worker);
          });
        });
        interval = setInterval(() => registration.update().catch(() => {}), UPDATE_CHECK_MS);
      })
      .catch((err) => console.warn('Service worker registration failed:', err));

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    navigator.serviceWorker.addEventListener('message', onMessage);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      navigator.serviceWorker.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [toast]);

  // ---------------------------------------------------------------------- install
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      installEventRef.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    const onInstalled = () => {
      installEventRef.current = null;
      setCanInstall(false);
      setIsInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    const event = installEventRef.current;
    if (!event) return false;
    await event.prompt();
    const { outcome } = await event.userChoice;
    installEventRef.current = null;
    setCanInstall(false);
    return outcome === 'accepted';
  }, []);

  // ------------------------------------------------------------------------- push
  const getSubscription = useCallback(async (create: boolean) => {
    const registration = registrationRef.current ?? (await navigator.serviceWorker.ready);
    const existing = await registration.pushManager.getSubscription();
    if (existing || !create) return existing;
    const res = await api.get('/push/key');
    const key: string | null = res.data?.data?.publicKey;
    if (!key) throw new Error('Push notifications are not configured on the server.');
    return registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }, []);

  const enablePush = useCallback(
    async (mutedRoomIds: string[]) => {
      if (!pushSupported) return false;
      const permission =
        Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') return false;
      let subscription = await getSubscription(true);
      if (!subscription) return false;
      try {
        await api.post('/push/subscriptions', {
          subscription: subscription.toJSON(),
          mutedRoomIds,
        });
      } catch (err) {
        // This browser's endpoint is registered to another account (e.g. a previous user who
        // didn't sign out properly): get a fresh endpoint for this account instead.
        if ((err as { response?: { status?: number } }).response?.status !== 409) throw err;
        await subscription.unsubscribe();
        subscription = await getSubscription(true);
        if (!subscription) return false;
        await api.post('/push/subscriptions', {
          subscription: subscription.toJSON(),
          mutedRoomIds,
        });
      }
      return true;
    },
    [pushSupported, getSubscription]
  );

  const disablePush = useCallback(async () => {
    if (!pushSupported) return;
    const subscription = await getSubscription(false);
    if (!subscription) return;
    await api
      .delete('/push/subscriptions', { data: { endpoint: subscription.endpoint } })
      .catch(() => {});
    await subscription.unsubscribe().catch(() => {});
  }, [pushSupported, getSubscription]);

  const syncPush = useCallback(
    async (mutedRoomIds: string[]) => {
      if (!pushSupported || Notification.permission !== 'granted') return;
      const subscription = await getSubscription(false);
      if (subscription) {
        await api
          .post('/push/subscriptions', { subscription: subscription.toJSON(), mutedRoomIds })
          .catch(() => {});
      }
    },
    [pushSupported, getSubscription]
  );

  return (
    <PwaContext.Provider
      value={{
        isInstalled,
        canInstall,
        isIOS,
        install,
        pushSupported,
        enablePush,
        disablePush,
        syncPush,
      }}
    >
      {children}
    </PwaContext.Provider>
  );
}

export function usePwa(): PwaContextType {
  const context = useContext(PwaContext);
  if (!context) throw new Error('usePwa must be used within a PwaProvider');
  return context;
}

/** Unread count on the installed app's icon (where supported). */
export function setAppBadge(count: number) {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (count > 0) nav.setAppBadge?.(count).catch(() => {});
  else nav.clearAppBadge?.().catch(() => {});
}
