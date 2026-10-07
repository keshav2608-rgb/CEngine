'use client';

import React, { useEffect } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { Attachment } from '@/lib/chat-context';
import { formatFileSize } from '@/lib/utils';
import { useFileUrl } from './useFileUrl';

export function ImageLightbox({
  attachment,
  onClose,
}: {
  attachment: Attachment | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!attachment) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [attachment, onClose]);

  if (!attachment) return null;
  return <LightboxView attachment={attachment} onClose={onClose} />;
}

function LightboxView({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  // Encrypted images are decrypted on this device into a temporary blob URL
  const { url } = useFileUrl(attachment);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={attachment.fileName}
      className="fixed inset-0 z-50 flex flex-col bg-black/85"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex items-center justify-between gap-4 px-4 h-14 text-white/90 shrink-0">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{attachment.fileName}</p>
          <p className="text-[12px] text-white/60">{formatFileSize(attachment.fileSize)}</p>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={url ?? undefined}
            download={attachment.fileName}
            target="_blank"
            rel="noopener noreferrer"
            className="w-9 h-9 inline-flex items-center justify-center rounded-md hover:bg-white/10"
            aria-label="Download"
            title="Download"
          >
            <Download className="w-5 h-5" />
          </a>
          <button
            onClick={onClose}
            className="w-9 h-9 inline-flex items-center justify-center rounded-md hover:bg-white/10"
            aria-label="Close"
            title="Close (Esc)"
            autoFocus
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div
        className="flex-1 min-h-0 flex items-center justify-center p-4"
        onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={attachment.fileName}
            className="max-w-full max-h-full object-contain rounded"
          />
        ) : (
          <Loader2 className="w-6 h-6 text-white/70 animate-spin" aria-label="Decrypting image" />
        )}
      </div>
    </div>
  );
}
