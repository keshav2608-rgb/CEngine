'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { AuthShell } from '@/components/ui/AuthShell';
import { Field, Alert } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { getErrorMessage } from '@/lib/utils';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setError('');
      await api.post('/auth/forgot-password', { email: email.trim() });
      setIsSubmitted(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Something went wrong. Try again in a moment.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const backLink = (
    <Link href="/login" className="font-medium text-accent hover:underline">
      Back to log in
    </Link>
  );

  if (isSubmitted) {
    return (
      <AuthShell
        title="Check your email"
        subtitle={
          <>
            If an account exists for <span className="text-fg font-medium">{email}</span>,
            we&apos;ve sent a link to reset your password. It may take a minute to arrive. Check
            your spam folder too.
          </>
        }
        footer={backLink}
      >
        <Button variant="secondary" className="w-full" onClick={() => setIsSubmitted(false)}>
          Use a different email
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email you signed up with and we'll send you a reset link."
      footer={backLink}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Send reset link
        </Button>
      </form>
    </AuthShell>
  );
}
