import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  format,
  isToday,
  isYesterday,
  isThisYear,
  isThisWeek,
  formatDistanceToNowStrict,
} from 'date-fns';
import { API_BASE_URL } from './api';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function toDate(value: string | Date): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

export function formatMessageTime(dateString: string | Date): string {
  try {
    return format(toDate(dateString), 'h:mm a');
  } catch {
    return '';
  }
}

/** Full, unambiguous timestamp for tooltips, e.g. "Tue, Oct 7, 2026 at 3:41 PM". */
export function formatFullTimestamp(dateString: string | Date): string {
  try {
    return format(toDate(dateString), "EEE, MMM d, yyyy 'at' h:mm a");
  } catch {
    return '';
  }
}

export function formatChatTimestamp(dateString: string | Date): string {
  try {
    const date = toDate(dateString);
    if (isToday(date)) return format(date, 'h:mm a');
    if (isYesterday(date)) return 'Yesterday';
    if (isThisWeek(date)) return format(date, 'EEE');
    if (isThisYear(date)) return format(date, 'MMM d');
    return format(date, 'MM/dd/yy');
  } catch {
    return '';
  }
}

/** Day divider label. Always includes the actual date beyond "Yesterday". */
export function formatDayDivider(dateString: string | Date): string {
  try {
    const date = toDate(dateString);
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    if (isThisYear(date)) return format(date, 'EEEE, MMMM d');
    return format(date, 'EEEE, MMMM d, yyyy');
  } catch {
    return '';
  }
}

export function formatLastSeen(dateString?: string | null): string {
  if (!dateString) return 'Offline';
  try {
    return `Last seen ${formatDistanceToNowStrict(toDate(dateString), { addSuffix: true })}`;
  } catch {
    return 'Offline';
  }
}

export function getInitials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/** The server strips HTML and entity-encodes text; decode it for display (React re-escapes). */
export function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Resolve a stored file URL (absolute or server-relative) to something the browser can load. */
export function resolveFileUrl(fileUrl: string): string {
  if (/^https?:\/\//.test(fileUrl)) return fileUrl;
  const origin = process.env.NEXT_PUBLIC_SOCKET_URL || API_BASE_URL.replace(/\/api\/?$/, '');
  return `${origin}${fileUrl}`;
}

export function getErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string } }; message?: string };
  return e?.response?.data?.message || fallback;
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** How long after sending a message its author can edit it (the server enforces the same limit). */
export const EDIT_WINDOW_MS = 30 * 60 * 1000;

/** Whole minutes left to edit a message sent at `createdAt` (0 when editing is no longer allowed). */
export function editMinutesLeft(createdAt: string, now: number): number {
  const left = EDIT_WINDOW_MS - (now - new Date(createdAt).getTime());
  return left > 0 ? Math.ceil(left / 60000) : 0;
}
