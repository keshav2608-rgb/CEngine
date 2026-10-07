'use client';

import React, { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export const inputClass =
  'w-full h-9 px-3 rounded-md border border-line-strong bg-surface text-sm text-fg ' +
  'placeholder:text-subtle transition-colors outline-none ' +
  'focus:border-accent focus:ring-2 focus:ring-accent/20 ' +
  'disabled:bg-surface-2 disabled:text-muted disabled:cursor-not-allowed';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(inputClass, className)} {...props} />;
});

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  /** Rendered to the right of the label (e.g. "Forgot password?"). */
  labelAside?: React.ReactNode;
}

/** Labelled input with optional hint/error, wired up with ids for accessibility. */
export const Field = React.forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, labelAside, id, type, className, ...props },
  ref
) {
  const autoId = useId();
  const inputId = id || autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between mb-1.5">
        <label htmlFor={inputId} className="text-[13px] font-medium text-fg">
          {label}
        </label>
        {labelAside}
      </div>
      <div className="relative">
        <Input
          ref={ref}
          id={inputId}
          type={isPassword && reveal ? 'text' : type}
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy}
          className={cn(
            isPassword && 'pr-10',
            error && 'border-danger focus:border-danger focus:ring-danger/20'
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? 'Hide password' : 'Show password'}
            className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded text-subtle hover:text-fg"
          >
            {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="mt-1.5 text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export function Alert({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'success' | 'info';
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'px-3 py-2.5 rounded-md text-[13px] border',
        tone === 'error' && 'bg-danger-soft text-danger border-danger/25',
        tone === 'success' && 'bg-surface-2 text-success border-line',
        tone === 'info' && 'bg-accent-soft text-accent-soft-fg border-accent/20'
      )}
    >
      {children}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm text-fg cursor-pointer">
          {label}
        </label>
        {description && <p className="text-[13px] text-muted mt-0.5">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative shrink-0 mt-0.5 w-9 h-5 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-surface-3'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform',
            checked && 'translate-x-4'
          )}
        />
      </button>
    </div>
  );
}
