import React from 'react';
import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { StatusTicks } from '@/components/chat/StatusTicks';
import { WallpaperLayer } from '@/components/chat/Wallpaper';

/** Shared frame for sign-in, sign-up and account recovery screens. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-h-dvh flex bg-surface">
      <div className="flex-1 flex flex-col px-4 sm:px-8 py-8">
        <Link
          href="/"
          className="text-[15px] font-semibold tracking-tight text-fg self-center lg:self-start"
        >
          CEngine
        </Link>
        <div className="flex-1 flex items-center justify-center py-10">
          <div className="w-full max-w-[380px]">
            <h1 className="text-[22px] font-semibold tracking-tight text-fg">{title}</h1>
            {subtitle && <p className="text-sm text-muted mt-1.5">{subtitle}</p>}
            <div className="mt-7">{children}</div>
            {footer && <div className="mt-8 text-[13px] text-muted">{footer}</div>}
          </div>
        </div>
      </div>

      <aside
        className="hidden lg:flex relative w-[44%] max-w-[640px] border-l border-line overflow-hidden"
        aria-hidden
      >
        <WallpaperLayer value="aurora" />
        <div className="relative flex flex-col justify-center w-full px-14">
          <PreviewChat />
          <p className="mt-10 text-lg font-semibold tracking-tight text-fg max-w-sm">
            Conversations that stay in order.
          </p>
          <p className="mt-2 text-sm text-muted max-w-sm">
            Know when your message was delivered and read, pick up where you left off, and schedule
            messages for the right moment.
          </p>
        </div>
      </aside>
    </div>
  );
}

/** Static, decorative sample conversation showing the product's message states. */
function PreviewChat() {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-line bg-app/80 backdrop-blur-sm shadow-xl p-4 space-y-2 text-[13px]">
      <div className="flex items-center gap-2 pb-3 mb-1 border-b border-line">
        <span className="w-7 h-7 rounded-full bg-[#dcefe5] text-[#1d6b45] text-[11px] font-semibold flex items-center justify-center">
          MA
        </span>
        <span>
          <span className="block font-medium text-fg leading-tight">Maya</span>
          <span className="block text-[11px] text-accent leading-tight">typing…</span>
        </span>
      </div>
      <Bubble side="other" text="Did the design review get moved?" time="9:41 AM" />
      <Bubble side="own" text="Yes, it's Thursday at 2 now" time="9:42 AM" ticks="READ" />
      <Bubble
        side="own"
        text="I'll send the agenda tomorrow morning"
        time="9:42 AM"
        ticks="DELIVERED"
      />
      <div className="flex justify-end">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface border border-line text-[11px] text-muted">
          <CalendarClock className="w-3 h-3" />
          Agenda scheduled for Tomorrow at 9:00 AM
        </span>
      </div>
    </div>
  );
}

function Bubble({
  side,
  text,
  time,
  ticks,
}: {
  side: 'own' | 'other';
  text: string;
  time: string;
  ticks?: 'DELIVERED' | 'READ';
}) {
  const own = side === 'own';
  return (
    <div className={own ? 'flex justify-end' : 'flex'}>
      <div
        className={
          own
            ? 'max-w-[80%] px-3 py-1.5 rounded-xl rounded-tr-sm bg-bubble-own text-bubble-own-fg'
            : 'max-w-[80%] px-3 py-1.5 rounded-xl rounded-tl-sm bg-bubble-other border border-line text-fg'
        }
      >
        {text}
        <span className="ml-2 inline-flex items-center gap-1 align-[-2px] text-[10.5px] text-subtle">
          {time}
          {ticks && <StatusTicks state={ticks} label={ticks === 'READ' ? 'Read' : 'Delivered'} />}
        </span>
      </div>
    </div>
  );
}

/** Only allow same-origin relative paths as post-auth redirects. */
export function safeRedirect(value: string | null | undefined, fallback = '/chat'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}
