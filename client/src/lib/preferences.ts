'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Per-device preferences, persisted in localStorage and synced across tabs
 * and components via a custom event.
 */
export type ThemeMode = 'system' | 'light' | 'dark';
export type Accent = 'blue' | 'violet' | 'green' | 'rose' | 'amber' | 'teal';
/**
 * A wallpaper preset id (see WALLPAPERS in components/chat/Wallpaper) or
 * `image:<url>` for an uploaded picture.
 */
export type WallpaperValue = string;

export interface Preferences {
  theme: ThemeMode;
  accent: Accent;
  /** Default wallpaper for every conversation. */
  wallpaper: WallpaperValue;
  /** Per-conversation wallpaper overrides. */
  roomWallpapers: Record<string, WallpaperValue>;
  /** 'enter': Enter sends, Shift+Enter newline. 'mod-enter': Ctrl/Cmd+Enter sends, Enter newline. */
  sendKey: 'enter' | 'mod-enter';
  desktopNotifications: boolean;
  compactMode: boolean;
  /** Room ids muted on this device. */
  mutedRooms: string[];
}

const KEY = 'cengine_prefs';
const EVENT = 'cengine:prefs';

const defaults: Preferences = {
  theme: 'system',
  accent: 'blue',
  wallpaper: 'dots',
  roomWallpapers: {},
  sendKey: 'enter',
  desktopNotifications: false,
  compactMode: false,
  mutedRooms: [],
};

export function readPreferences(): Preferences {
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

export function writePreferences(patch: Partial<Preferences>) {
  const next = { ...readPreferences(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode); preference stays in memory for this event only
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
}

// Cached snapshot so useSyncExternalStore gets a stable object between changes
let cachedRaw: string | null | undefined;
let cachedPrefs: Preferences = defaults;

function getSnapshot(): Preferences {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // ignore
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedPrefs = readPreferences();
  }
  return cachedPrefs;
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => e.key === KEY && onChange();
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function usePreferences() {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, () => defaults);

  const update = useCallback((patch: Partial<Preferences>) => writePreferences(patch), []);

  const toggleMute = useCallback((roomId: string) => {
    const muted = readPreferences().mutedRooms;
    writePreferences({
      mutedRooms: muted.includes(roomId) ? muted.filter((id) => id !== roomId) : [...muted, roomId],
    });
  }, []);

  return { prefs, update, toggleMute };
}

// Drafts: one unsent message per conversation, kept across room switches and reloads.
const DRAFT_PREFIX = 'cengine_draft_';
const DRAFT_EVENT = 'cengine:draft';

export function readDraft(roomId: string): string {
  try {
    return localStorage.getItem(DRAFT_PREFIX + roomId) || '';
  } catch {
    return '';
  }
}

/** Persist a draft. Pass notify=false to skip refreshing draft previews (e.g. on every keystroke). */
export function writeDraft(roomId: string, text: string, notify = true) {
  try {
    if (text.trim()) localStorage.setItem(DRAFT_PREFIX + roomId, text);
    else localStorage.removeItem(DRAFT_PREFIX + roomId);
  } catch {
    // ignore
  }
  if (notify) notifyDraftsChanged();
}

export function notifyDraftsChanged() {
  window.dispatchEvent(new Event(DRAFT_EVENT));
}

/** Map of roomId -> draft text, for showing "Draft:" previews in the sidebar. */
export function useDrafts(roomIds: string[]): Record<string, string> {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const idsKey = roomIds.join(',');

  useEffect(() => {
    const load = () => {
      const next: Record<string, string> = {};
      idsKey
        .split(',')
        .filter(Boolean)
        .forEach((id) => {
          const d = readDraft(id);
          if (d) next[id] = d;
        });
      setDrafts(next);
    };
    load();
    window.addEventListener(DRAFT_EVENT, load);
    return () => window.removeEventListener(DRAFT_EVENT, load);
  }, [idsKey]);

  return drafts;
}
