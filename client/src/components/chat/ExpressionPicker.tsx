'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Loader2, Plus, Search, Smile, Sticker, X } from 'lucide-react';
import { EMOJI_CATEGORIES, ALL_EMOJIS } from '@/lib/emoji-data';
import { e2ee, StickerRef } from '@/lib/e2ee';
import { useToast } from '@/components/ui/Toast';
import { cn, getErrorMessage } from '@/lib/utils';
import { BuiltInSticker, STICKER_PACKS, StickerView } from './Stickers';

const RECENT_EMOJI_KEY = 'cengine_recent_emoji';
const MY_STICKERS_KEY = 'cengine_my_stickers';
const MAX_RECENT = 24;
const MAX_MY_STICKERS = 40;

type CustomSticker = Extract<StickerRef, { custom: unknown }>['custom'];

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || '') as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

interface Props {
  onClose: () => void;
  onEmoji: (emoji: string) => void;
  onSticker: (sticker: StickerRef) => void;
}

/** Emoji + sticker panel that opens above the message box. */
export function ExpressionPicker({ onClose, onEmoji, onSticker }: Props) {
  const [tab, setTab] = useState<'emoji' | 'stickers'>('emoji');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    // Defer so the click that opened the picker doesn't immediately close it
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    document.addEventListener('keydown', onKey, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Emoji and stickers"
      className="absolute bottom-full left-0 mb-2 z-30 w-[min(360px,calc(100vw-1.5rem))] h-[380px] flex flex-col rounded-xl border border-line bg-surface shadow-xl overflow-hidden"
    >
      <div className="flex items-center gap-1 px-2 pt-2 pb-1.5 border-b border-line" role="tablist">
        {(
          [
            ['emoji', 'Emoji', <Smile key="e" className="w-4 h-4" />],
            ['stickers', 'Stickers', <Sticker key="s" className="w-4 h-4" />],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-medium transition-colors',
              tab === id ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg hover:bg-surface-2'
            )}
          >
            {icon}
            {label}
          </button>
        ))}
        <button
          onClick={onClose}
          aria-label="Close"
          className="ml-auto w-8 h-8 inline-flex items-center justify-center rounded-md text-subtle hover:text-fg hover:bg-surface-2"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {tab === 'emoji' ? <EmojiTab onEmoji={onEmoji} /> : <StickerTab onSticker={onSticker} />}
    </div>
  );
}

function EmojiTab({ onEmoji }: { onEmoji: (emoji: string) => void }) {
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>(() => readJson<string[]>(RECENT_EMOJI_KEY, []));
  const scrollRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return ALL_EMOJIS.filter((e) => e.keywords.includes(q) || e.char === q).slice(0, 120);
  }, [query]);

  const pick = (char: string) => {
    onEmoji(char);
    const next = [char, ...recent.filter((c) => c !== char)].slice(0, MAX_RECENT);
    setRecent(next);
    writeJson(RECENT_EMOJI_KEY, next);
  };

  const jump = (id: string) => {
    scrollRef.current?.querySelector(`[data-cat="${id}"]`)?.scrollIntoView({ block: 'start' });
  };

  const grid = (chars: { char: string; keywords: string }[]) => (
    <div className="grid grid-cols-8 gap-0.5">
      {chars.map((e) => (
        <button
          key={e.char}
          type="button"
          title={e.keywords.split(' ')[0]}
          aria-label={e.keywords.split(' ')[0]}
          onClick={() => pick(e.char)}
          className="h-9 rounded-md text-[22px] leading-none hover:bg-surface-2 focus-visible:bg-surface-2"
        >
          {e.char}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div className="px-2 pt-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search emoji"
            autoFocus
            className="w-full h-8 pl-8 pr-2 rounded-md bg-surface-2 text-[13px] text-fg placeholder:text-subtle outline-none"
          />
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-1.5">
        {results ? (
          results.length ? (
            grid(results)
          ) : (
            <p className="py-10 text-center text-[13px] text-muted">No emoji found</p>
          )
        ) : (
          <>
            {recent.length > 0 && (
              <section className="mb-2">
                <p className="px-1 py-1 text-[11px] font-medium text-subtle">Recently used</p>
                {grid(
                  recent.map((char) => ({
                    char,
                    keywords: ALL_EMOJIS.find((e) => e.char === char)?.keywords ?? char,
                  }))
                )}
              </section>
            )}
            {EMOJI_CATEGORIES.map((cat) => (
              <section key={cat.id} data-cat={cat.id} className="mb-2">
                <p className="px-1 py-1 text-[11px] font-medium text-subtle">{cat.label}</p>
                {grid(cat.emojis)}
              </section>
            ))}
          </>
        )}
      </div>
      {!results && (
        <div className="flex items-center justify-between px-2 py-1 border-t border-line">
          {recent.length > 0 && (
            <button
              onClick={() => scrollRef.current?.scrollTo({ top: 0 })}
              className="w-8 h-7 inline-flex items-center justify-center rounded text-subtle hover:text-fg hover:bg-surface-2"
              aria-label="Recently used"
            >
              <Clock className="w-4 h-4" />
            </button>
          )}
          {EMOJI_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => jump(cat.id)}
              title={cat.label}
              aria-label={cat.label}
              className="w-8 h-7 rounded text-base leading-none hover:bg-surface-2"
            >
              {cat.emojis[0].char}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function StickerTab({ onSticker }: { onSticker: (sticker: StickerRef) => void }) {
  const { toast } = useToast();
  const [mine, setMine] = useState<CustomSticker[]>(() =>
    readJson<CustomSticker[]>(MY_STICKERS_KEY, [])
  );
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addCustom = async (file: File) => {
    if (!file.type.startsWith('image/'))
      return toast('Choose an image (PNG, GIF, WebP or JPG).', { tone: 'error' });
    if (file.size > 2 * 1024 * 1024) return toast('Stickers can be up to 2 MB.', { tone: 'error' });
    try {
      setUploading(true);
      // Uploaded encrypted, like any attachment; the key stays on this device and in messages
      const att = await e2ee.uploadEncryptedFile(file);
      const sticker: CustomSticker = {
        fileUrl: att.fileUrl,
        key: att.key,
        iv: att.iv,
        mimeType: att.mimeType,
        width: att.width,
        height: att.height,
      };
      const next = [sticker, ...mine].slice(0, MAX_MY_STICKERS);
      setMine(next);
      writeJson(MY_STICKERS_KEY, next);
      toast('Sticker added');
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't add that sticker"), { tone: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const removeCustom = (url: string) => {
    const next = mine.filter((s) => s.fileUrl !== url);
    setMine(next);
    writeJson(MY_STICKERS_KEY, next);
  };

  return (
    <div className="flex-1 overflow-y-auto p-2">
      <section className="mb-3">
        <p className="px-1 pb-1 text-[11px] font-medium text-subtle">My stickers</p>
        <div className="grid grid-cols-4 gap-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="aspect-square rounded-lg border-2 border-dashed border-line-strong text-muted hover:text-fg hover:border-subtle flex flex-col items-center justify-center gap-1 text-[11px]"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Add
          </button>
          {mine.map((s) => (
            <div key={s.fileUrl} className="relative group">
              <button
                type="button"
                onClick={() => onSticker({ custom: s })}
                className="w-full aspect-square rounded-lg hover:bg-surface-2 flex items-center justify-center"
                aria-label="Send sticker"
              >
                <StickerView sticker={{ custom: s }} size={64} />
              </button>
              <button
                type="button"
                onClick={() => removeCustom(s.fileUrl)}
                aria-label="Remove sticker"
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-surface border border-line text-subtle hover:text-fg hidden group-hover:inline-flex items-center justify-center"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/gif,image/webp,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) addCustom(f);
          }}
        />
      </section>

      {STICKER_PACKS.map((pack) => (
        <section key={pack.id}>
          <p className="px-1 pb-1 text-[11px] font-medium text-subtle">{pack.label}</p>
          <div className="grid grid-cols-4 gap-1">
            {pack.stickers.map((s) => (
              <button
                key={s.id}
                type="button"
                title={s.label}
                onClick={() => onSticker({ pack: pack.id, id: s.id })}
                className="aspect-square rounded-lg hover:bg-surface-2 flex items-center justify-center"
              >
                <BuiltInSticker def={s} size={70} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
