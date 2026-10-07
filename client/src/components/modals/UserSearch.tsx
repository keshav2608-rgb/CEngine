'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export interface UserResult {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  isOnline: boolean;
}

interface Resolved {
  query: string;
  results: UserResult[];
  error: boolean;
}

/** Debounced user search shared by the new-message and new-group dialogs. */
export function useUserSearch(query: string) {
  const q = query.trim();
  const [resolved, setResolved] = useState<Resolved>({ query: '', results: [], error: false });

  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
        if (!cancelled) setResolved({ query: q, results: res.data?.data || [], error: false });
      } catch {
        if (!cancelled) setResolved({ query: q, results: [], error: true });
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  // Results only count for the query they were fetched for; anything else is in flight
  const isCurrent = resolved.query === q;
  return {
    results: q && isCurrent ? resolved.results : [],
    isSearching: !!q && !isCurrent,
    error: !!q && isCurrent && resolved.error,
  };
}
