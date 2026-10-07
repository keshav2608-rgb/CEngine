'use client';

import React, { Suspense, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useChat } from '@/lib/chat-context';
import { api } from '@/lib/api';
import { AuthShell } from '@/components/ui/AuthShell';
import { Alert } from '@/components/ui/Input';
import { Button, buttonClass } from '@/components/ui/Button';
import { getErrorMessage } from '@/lib/utils';

function InviteContent() {
  const params = useParams();
  const inviteCode = params.code as string;
  const { user, isAuthenticated, isLoading } = useAuth();
  const { joinedRoom } = useChat();
  const router = useRouter();

  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = async () => {
    try {
      setIsJoining(true);
      setError('');
      const res = await api.post(`/chats/join/${inviteCode}`);
      await joinedRoom(res.data.data);
      router.push('/chat');
    } catch (err) {
      setError(getErrorMessage(err, 'This invite link is invalid or has expired.'));
      setIsJoining(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-dvh">
        <Loader2 className="w-5 h-5 animate-spin text-subtle" aria-label="Loading" />
      </div>
    );
  }

  const code = encodeURIComponent(inviteCode);

  return (
    <AuthShell
      title="You've been invited to a group"
      subtitle={
        isAuthenticated
          ? `You'll join as ${user?.displayName}.`
          : 'Create a free account or log in to join the conversation.'
      }
    >
      <div className="space-y-3">
        {error && <Alert>{error}</Alert>}
        {isAuthenticated ? (
          <>
            <Button size="lg" className="w-full" onClick={handleJoin} loading={isJoining}>
              Join group
            </Button>
            <Link href="/chat" className={buttonClass('ghost', 'lg', 'w-full')}>
              Not now
            </Link>
          </>
        ) : (
          <>
            <Link
              href={`/register?invite=${code}`}
              className={buttonClass('primary', 'lg', 'w-full')}
            >
              Create account and join
            </Link>
            <Link
              href={`/login?invite=${code}`}
              className={buttonClass('secondary', 'lg', 'w-full')}
            >
              I already have an account
            </Link>
          </>
        )}
      </div>
    </AuthShell>
  );
}

export default function InviteLandingPage() {
  return (
    <Suspense>
      <InviteContent />
    </Suspense>
  );
}
