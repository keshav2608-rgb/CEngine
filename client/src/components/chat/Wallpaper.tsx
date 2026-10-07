'use client';

import React, { useRef, useState } from 'react';
import { Check, ImagePlus, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { cn, getErrorMessage, resolveFileUrl } from '@/lib/utils';
import type { WallpaperValue } from '@/lib/preferences';

export const WALLPAPERS: { id: string; label: string }[] = [
  { id: 'plain', label: 'Plain' },
  { id: 'dots', label: 'Dots' },
  { id: 'grid', label: 'Grid' },
  { id: 'lines', label: 'Lines' },
  { id: 'doodle', label: 'Doodles' },
  { id: 'aurora', label: 'Glow' },
  { id: 'sand', label: 'Sand' },
  { id: 'mint', label: 'Mint' },
  { id: 'sky', label: 'Sky' },
  { id: 'blush', label: 'Blush' },
  { id: 'slate', label: 'Slate' },
];

const IMAGE_PREFIX = 'image:';

/** Background layer for a conversation. Place inside a `relative` container. */
export function WallpaperLayer({
  value,
  className,
}: {
  value: WallpaperValue;
  className?: string;
}) {
  if (value.startsWith(IMAGE_PREFIX)) {
    const url = resolveFileUrl(value.slice(IMAGE_PREFIX.length));
    return (
      <div
        className={cn('wallpaper', className)}
        data-wp="image"
        style={{ backgroundImage: `url("${url.replace(/"/g, '%22')}")` }}
        aria-hidden
      />
    );
  }
  return <div className={cn('wallpaper', className)} data-wp={value} aria-hidden />;
}

interface PickerProps {
  value: WallpaperValue | undefined;
  onChange: (value: WallpaperValue | undefined) => void;
  /** Offer "Use default" (for per-conversation overrides). */
  defaultValue?: WallpaperValue;
}

export function WallpaperPicker({ value, onChange, defaultValue }: PickerProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const isImage = value?.startsWith(IMAGE_PREFIX);

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) return toast('Choose an image file.', { tone: 'error' });
    const form = new FormData();
    form.append('file', file);
    try {
      setUploading(true);
      const res = await api.post('/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data?.data?.fileUrl) onChange(IMAGE_PREFIX + res.data.data.fileUrl);
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't upload that image"), { tone: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const openFilePicker = () => fileRef.current?.click();

  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5">
      {defaultValue !== undefined && (
        <Tile
          label="Default"
          preview={defaultValue}
          selected={value === undefined}
          onClick={() => onChange(undefined)}
        />
      )}
      {WALLPAPERS.map((w) => (
        <Tile
          key={w.id}
          label={w.label}
          preview={w.id}
          selected={value === w.id}
          onClick={() => onChange(w.id)}
        />
      ))}
      {isImage && <Tile label="Your photo" preview={value!} selected onClick={openFilePicker} />}
      <button
        type="button"
        onClick={openFilePicker}
        className="group text-left"
        disabled={uploading}
      >
        <span className="flex h-16 items-center justify-center rounded-lg border-2 border-dashed border-line-strong text-muted group-hover:text-fg group-hover:border-subtle">
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ImagePlus className="w-4 h-4" />
          )}
        </span>
        <span className="block mt-1 text-[12px] text-muted">
          {isImage ? 'Change photo' : 'Upload photo'}
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) upload(f);
        }}
      />
    </div>
  );
}

function Tile({
  label,
  preview,
  selected,
  onClick,
}: {
  label: string;
  preview: WallpaperValue;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className="group text-left">
      <span
        className={cn(
          'relative block h-16 rounded-lg overflow-hidden border-2 transition-colors',
          selected ? 'border-accent' : 'border-line group-hover:border-line-strong'
        )}
      >
        <WallpaperLayer value={preview} />
        {/* Mini bubbles so the preview reads as a chat */}
        <span className="absolute left-1.5 top-2 h-2.5 w-8 rounded-full bg-bubble-other border border-line" />
        <span className="absolute right-1.5 bottom-2 h-2.5 w-10 rounded-full bg-bubble-own" />
        {selected && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-accent text-accent-fg flex items-center justify-center">
            <Check className="w-3 h-3" strokeWidth={3} />
          </span>
        )}
      </span>
      <span className="block mt-1 text-[12px] text-muted truncate">{label}</span>
    </button>
  );
}
