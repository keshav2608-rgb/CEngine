'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { AuthShell } from '@/components/ui/AuthShell';
import { buttonClass } from '@/components/ui/Button';
import { getErrorMessage } from '@/lib/utils';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [result, setResult] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const status = token ? result : 'error';
  const message = token ? errorMessage : 'This verification link is missing its token.';

  useEffect(() => {
    if (!token) return;
    api
      .post('/auth/verify-email', { token })
      .then(() => setResult('success'))
      .catch((err) => {
        setResult('error');
        setErrorMessage(getErrorMessage(err, 'This verification link is invalid or has expired.'));
      });
  }, [token]);

  if (status === 'loading') {
    return (
      <AuthShell title="Verifying your email">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="w-4 h-4 animate-spin" />
          One moment…
        </div>
      </AuthShell>
    );
  }

  if (status === 'success') {
    return (
      <AuthShell title="Email verified" subtitle="Thanks for confirming your email address.">
        <Link href="/chat" className={buttonClass('primary', 'lg', 'w-full')}>
          Continue to CEngine
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="We couldn't verify your email" subtitle={message}>
      <Link href="/login" className={buttonClass('secondary', 'lg', 'w-full')}>
        Back to log in
      </Link>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
