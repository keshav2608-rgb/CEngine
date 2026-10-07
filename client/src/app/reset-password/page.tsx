'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { AuthShell } from '@/components/ui/AuthShell';
import { Field, Alert } from '@/components/ui/Input';
import { Button, buttonClass } from '@/components/ui/Button';
import { getErrorMessage } from '@/lib/utils';

const MIN_PASSWORD = 6;

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');

  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    if (password !== confirmPassword) return setError("The passwords don't match.");
    try {
      setIsSubmitting(true);
      setError('');
      await api.post('/auth/reset-password', { token, password });
      setIsSuccess(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err) {
      setError(getErrorMessage(err, 'This reset link is invalid or has expired.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token) {
    return (
      <AuthShell
        title="This link isn't valid"
        subtitle="The password reset link is missing its token. Request a new one."
      >
        <Link href="/forgot-password" className={buttonClass('primary', 'lg', 'w-full')}>
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  if (isSuccess) {
    return (
      <AuthShell
        title="Password updated"
        subtitle="You can now log in with your new password. Taking you there…"
      >
        <Link href="/login" className={buttonClass('primary', 'lg', 'w-full')}>
          Go to log in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      footer={
        <Link href="/login" className="font-medium text-accent hover:underline">
          Back to log in
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={`At least ${MIN_PASSWORD} characters.`}
          required
          autoFocus
        />
        <Field
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={mismatch ? "Passwords don't match." : undefined}
          required
        />
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}
