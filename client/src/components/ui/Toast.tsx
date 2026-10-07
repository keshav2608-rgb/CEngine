'use client';

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { cn } from '@/lib/utils';

interface ToastOptions {
  tone?: 'default' | 'error';
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
}

interface ToastContextType {
  toast: (message: string, options?: ToastOptions) => void;
  /** Promise-based replacement for window.confirm(). */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const confirmResolver = useRef<((value: boolean) => void) | null>(null);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = nextId.current++;
      // Keep at most 3; never evict a toast with an action (e.g. Undo) before it expires
      setToasts((prev) => {
        const next = [...prev, { id, message, ...options }];
        while (next.length > 3) {
          const i = next.findIndex((t) => !t.action);
          if (i === -1 || i === next.length - 1) break;
          next.splice(i, 1);
        }
        return next;
      });
      setTimeout(() => dismiss(id), options.duration ?? (options.action ? 6000 : 4000));
    },
    [dismiss]
  );

  const confirm = useCallback((options: ConfirmOptions) => {
    // Only one dialog at a time: an earlier pending confirm resolves as cancelled
    confirmResolver.current?.(false);
    setConfirmState(options);
    return new Promise<boolean>((resolve) => {
      confirmResolver.current = resolve;
    });
  }, []);

  const settleConfirm = (value: boolean) => {
    confirmResolver.current?.(value);
    confirmResolver.current = null;
    setConfirmState(null);
  };

  return (
    <ToastContext.Provider value={{ toast, confirm }}>
      {children}

      <div
        aria-live="polite"
        className="fixed z-[60] bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto w-full flex items-center gap-3 pl-4 pr-2 py-2 rounded-lg shadow-lg text-sm',
              'bg-[#1f2023] text-[#f0f0f2] dark:bg-[#ececef] dark:text-[#1a1a1e]',
              t.tone === 'error' && 'border-l-4 border-danger'
            )}
          >
            <span className="flex-1 min-w-0">{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
                className="shrink-0 px-2 py-1 rounded font-semibold text-[#9db0ff] dark:text-accent hover:bg-white/10 dark:hover:bg-black/5"
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded opacity-60 hover:opacity-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <Modal
        isOpen={!!confirmState}
        onClose={() => settleConfirm(false)}
        title={confirmState?.title || ''}
        maxWidth="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => settleConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant={confirmState?.destructive ? 'danger' : 'primary'}
              onClick={() => settleConfirm(true)}
              autoFocus
            >
              {confirmState?.confirmLabel || 'Confirm'}
            </Button>
          </>
        }
      >
        {confirmState?.message && <p className="text-sm text-muted">{confirmState.message}</p>}
      </Modal>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}
