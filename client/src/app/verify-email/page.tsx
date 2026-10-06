'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No verification token provided in the URL.');
      return;
    }

    const verify = async () => {
      try {
        await api.post('/auth/verify-email', { token });
        setStatus('success');
      } catch (err: any) {
        setStatus('error');
        setMessage(err.response?.data?.message || 'Verification link has expired or is invalid.');
      }
    };

    verify();
  }, [token]);

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-4 py-12 min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-8 shadow-xl text-center">
        {status === 'loading' && (
          <div className="flex flex-col items-center py-6">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Verifying your email address...
            </h2>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center py-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-3" />
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
              Email Verified!
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-6">
              Your email address has been verified successfully.
            </p>
            <Link
              href="/chat"
              className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-medium hover:bg-blue-700 transition-colors shadow-sm"
            >
              Continue to Chat
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center py-4">
            <XCircle className="w-12 h-12 text-red-500 mb-3" />
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
              Verification Failed
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-6">
              {message}
            </p>
            <Link
              href="/login"
              className="px-6 py-2.5 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-xl text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              Back to Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center min-h-screen">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
