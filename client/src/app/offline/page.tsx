import type { Metadata } from 'next';
import { WifiOff } from 'lucide-react';

export const metadata: Metadata = { title: 'Offline · CEngine' };

/** Shown by the service worker when a page can't be loaded and isn't cached yet. */
export default function OfflinePage() {
  return (
    <div className="flex-1 min-h-dvh flex flex-col items-center justify-center text-center px-6">
      <span className="w-12 h-12 rounded-full bg-surface-2 text-muted flex items-center justify-center mb-4">
        <WifiOff className="w-5 h-5" />
      </span>
      <h1 className="text-lg font-semibold text-fg">You&apos;re offline</h1>
      <p className="text-sm text-muted mt-1 max-w-xs">
        CEngine will reconnect automatically when you&apos;re back online. Messages you write will
        be sent then.
      </p>
      {/* Plain link so it works without JavaScript */}
      <a
        href="/chat"
        className="mt-5 inline-flex items-center h-9 px-4 rounded-md bg-accent text-accent-fg text-sm font-medium"
      >
        Try again
      </a>
    </div>
  );
}
