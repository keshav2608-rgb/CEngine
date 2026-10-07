'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { AuthShell } from '@/components/ui/AuthShell';
import { Field, Alert } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { getErrorMessage } from '@/lib/utils';

const MIN_PASSWORD = 6;

function RegisterForm() {
  const searchParams = useSearchParams();
  const invite = searchParams.get('invite');
  const redirectTo = invite ? `/invite/${encodeURIComponent(invite)}` : '/chat';

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touchedPassword, setTouchedPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { register, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace(redirectTo);
  }, [isLoading, isAuthenticated, redirectTo, router]);

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (displayName.trim().length < 2) return setError('Your name needs at least 2 characters.');
    if (password.length < MIN_PASSWORD) {
      setTouchedPassword(true);
      return;
    }
    try {
      setIsSubmitting(true);
      setError('');
      await register(email.trim(), password, displayName.trim(), redirectTo);
    } catch (err) {
      setError(getErrorMessage(err, "We couldn't create your account. Try again."));
      setIsSubmitting(false);
    }
  };

  const loginHref = invite ? `/login?invite=${encodeURIComponent(invite)}` : '/login';

  return (
    <AuthShell
      title="Create your account"
      subtitle={
        invite
          ? "You'll join the group right after signing up."
          : 'Free to use. Takes less than a minute.'
      }
      footer={
        <>
          Already have an account?{' '}
          <Link href={loginHref} className="font-medium text-accent hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field
          label="Name"
          autoComplete="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          hint="This is how others will see you."
          required
          autoFocus
        />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setTouchedPassword(true)}
          error={
            touchedPassword && passwordTooShort
              ? `Use at least ${MIN_PASSWORD} characters.`
              : undefined
          }
          hint={`At least ${MIN_PASSWORD} characters.`}
          required
        />
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
