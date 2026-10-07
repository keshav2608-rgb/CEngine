'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { AuthShell, safeRedirect } from '@/components/ui/AuthShell';
import { Field, Alert } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { getErrorMessage } from '@/lib/utils';

function LoginForm() {
  const searchParams = useSearchParams();
  const invite = searchParams.get('invite');
  const redirectTo = invite
    ? `/invite/${encodeURIComponent(invite)}`
    : safeRedirect(searchParams.get('next'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace(redirectTo);
  }, [isLoading, isAuthenticated, redirectTo, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setError('');
      await login(email.trim(), password, redirectTo);
    } catch (err) {
      setError(getErrorMessage(err, 'That email and password combination is incorrect.'));
      setIsSubmitting(false);
    }
  };

  const registerHref = invite ? `/register?invite=${encodeURIComponent(invite)}` : '/register';

  return (
    <AuthShell
      title="Log in"
      subtitle={invite ? 'Log in to join the group you were invited to.' : 'Welcome back.'}
      footer={
        <>
          New to CEngine?{' '}
          <Link href={registerHref} className="font-medium text-accent hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate={false}>
        {error && <Alert>{error}</Alert>}
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          labelAside={
            <Link href="/forgot-password" className="text-[13px] text-accent hover:underline">
              Forgot password?
            </Link>
          }
        />
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Log in
        </Button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
