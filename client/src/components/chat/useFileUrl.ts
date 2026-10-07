'use client';

import { useEffect, useState } from 'react';
import { e2ee } from '@/lib/e2ee';
import { resolveFileUrl } from '@/lib/utils';
import type { Attachment } from '@/lib/chat-context';

/**
 * A browser-loadable URL for an attachment. Encrypted files are downloaded and decrypted
 * on this device into an in-memory blob URL; legacy plaintext files load directly.
 */
export function useFileUrl(att: Pick<Attachment, 'fileUrl' | 'key' | 'iv' | 'mimeType'> | null) {
  const encrypted = !!(att?.key && att?.iv);
  const [state, setState] = useState<{ src: string; url: string | null; failed: boolean }>({
    src: '',
    url: null,
    failed: false,
  });

  useEffect(() => {
    if (!att || !encrypted) return;
    let cancelled = false;
    e2ee
      .fileUrl(
        { fileUrl: att.fileUrl, key: att.key!, iv: att.iv!, mimeType: att.mimeType },
        resolveFileUrl
      )
      .then(
        (url) => !cancelled && setState({ src: att.fileUrl, url, failed: false }),
        () => !cancelled && setState({ src: att.fileUrl, url: null, failed: true })
      );
    return () => {
      cancelled = true;
    };
  }, [att, encrypted]);

  if (!att) return { url: null, failed: false, loading: false };
  if (!encrypted) return { url: resolveFileUrl(att.fileUrl), failed: false, loading: false };
  const current = state.src === att.fileUrl;
  return {
    url: current ? state.url : null,
    failed: current && state.failed,
    loading: !current || (!state.url && !state.failed),
  };
}
