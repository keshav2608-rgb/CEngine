'use client';

import React, { useState } from 'react';
import { getInitials, cn, resolveFileUrl } from '@/lib/utils';

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
  showPresence?: boolean;
  className?: string;
}

const sizeClasses = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-[11px]',
  md: 'w-10 h-10 text-[13px]',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
};

const badgeSizeClasses = {
  xs: 'w-2 h-2',
  sm: 'w-2.5 h-2.5',
  md: 'w-3 h-3',
  lg: 'w-3.5 h-3.5',
  xl: 'w-4 h-4',
};

// Muted, readable tints rather than saturated primaries
const palette = [
  'bg-[#dfe6fb] text-[#2b44a3] dark:bg-[#2a3358] dark:text-[#b9c7f8]',
  'bg-[#dcefe5] text-[#1d6b45] dark:bg-[#1f3a2d] dark:text-[#9fd8b8]',
  'bg-[#f6e5d6] text-[#8a4a12] dark:bg-[#40301f] dark:text-[#ebc49b]',
  'bg-[#eadff6] text-[#5b3492] dark:bg-[#352a48] dark:text-[#cdb5ef]',
  'bg-[#f6dfe3] text-[#9b2c41] dark:bg-[#432630] dark:text-[#f0b2bf]',
  'bg-[#d9eef2] text-[#1c6372] dark:bg-[#1e3a40] dark:text-[#9fd3de]',
];

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

export function Avatar({
  src,
  name,
  size = 'md',
  isOnline,
  showPresence = false,
  className,
}: AvatarProps) {
  // Remember which src failed so a new src gets a fresh attempt
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = src && failedSrc !== src;

  return (
    <div className={cn('relative inline-flex shrink-0', className)}>
      <div
        className={cn(
          'rounded-full flex items-center justify-center font-semibold overflow-hidden select-none',
          sizeClasses[size],
          showImage ? 'bg-surface-3' : palette[hash(name || '?') % palette.length]
        )}
        aria-hidden
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveFileUrl(src)}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setFailedSrc(src)}
          />
        ) : (
          <span>{getInitials(name)}</span>
        )}
      </div>

      {showPresence && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full ring-2 ring-surface',
            badgeSizeClasses[size],
            isOnline ? 'bg-success' : 'bg-subtle'
          )}
          aria-label={isOnline ? 'Online' : 'Offline'}
          role="img"
        />
      )}
    </div>
  );
}
