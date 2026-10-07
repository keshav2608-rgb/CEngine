'use client';

import { useCallback } from 'react';
import { useAuth } from './auth-context';
import { usePwa } from './pwa';
import { e2ee } from './e2ee';

/**
 * Sign out and clean up this browser: stop push notifications for this account and remove
 * decrypted message text and per-user data stored locally. The device key is kept so the same
 * person can sign back in here and still read their history (use "Erase this device" to remove it).
 */
export function useSignOut() {
  const { logout } = useAuth();
  const { disablePush } = usePwa();
  return useCallback(async () => {
    await disablePush().catch(() => {});
    await e2ee.clearLocalData();
    await logout();
  }, [logout, disablePush]);
}
