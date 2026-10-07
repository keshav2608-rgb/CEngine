'use client';

import React, { useEffect, useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import type { StickerRef } from '@/lib/e2ee';
import { e2ee } from '@/lib/e2ee';
import { cn, resolveFileUrl } from '@/lib/utils';

/*
 * Built-in sticker pack, drawn as inline SVG so it ships with the app (no image hosting,
 * crisp at any size, works under a strict CSP). A sent sticker is just { pack, id } inside
 * the encrypted message.
 */

const INK = '#2b2b33';
const WHITE = '#ffffff';
const YELLOW = '#ffcd3c';
const YELLOW_DARK = '#f2a922';

function Face({ children, fill = YELLOW }: { children?: React.ReactNode; fill?: string }) {
  return (
    <>
      <circle cx="60" cy="52" r="36" fill={fill} stroke={WHITE} strokeWidth="5" />
      <circle
        cx="60"
        cy="52"
        r="36"
        fill="none"
        stroke={YELLOW_DARK}
        strokeWidth="1.5"
        opacity=".5"
      />
      {children}
    </>
  );
}

function Label({ text, fill, color = WHITE }: { text: string; fill: string; color?: string }) {
  const width = Math.max(52, text.length * 9.5 + 22);
  return (
    <g>
      <rect
        x={60 - width / 2}
        y="90"
        width={width}
        height="24"
        rx="12"
        fill={fill}
        stroke={WHITE}
        strokeWidth="3"
      />
      <text
        x="60"
        y="106.5"
        textAnchor="middle"
        fontFamily="ui-rounded, 'SF Pro Rounded', system-ui, sans-serif"
        fontWeight="800"
        fontSize="14"
        fill={color}
      >
        {text}
      </text>
    </g>
  );
}

const happyEyes = (
  <>
    <path d="M42 46 q6 -7 12 0" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />
    <path d="M66 46 q6 -7 12 0" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />
  </>
);

export interface StickerDef {
  id: string;
  label: string;
  art: React.ReactNode;
}

export const STICKER_PACKS: { id: string; label: string; stickers: StickerDef[] }[] = [
  {
    id: 'basics',
    label: 'Basics',
    stickers: [
      {
        id: 'hi',
        label: 'Hi!',
        art: (
          <>
            <g transform="rotate(-14 60 56)">
              {[38, 49, 60, 71].map((x, i) => (
                <rect
                  key={x}
                  x={x}
                  y={18 + (i === 0 ? 10 : i === 3 ? 6 : 0)}
                  width="10"
                  height="40"
                  rx="5"
                  fill={YELLOW}
                  stroke={WHITE}
                  strokeWidth="3"
                />
              ))}
              <rect
                x="36"
                y="44"
                width="46"
                height="40"
                rx="18"
                fill={YELLOW}
                stroke={WHITE}
                strokeWidth="3"
              />
              <rect
                x="20"
                y="50"
                width="26"
                height="11"
                rx="5.5"
                transform="rotate(35 33 55)"
                fill={YELLOW}
                stroke={WHITE}
                strokeWidth="3"
              />
            </g>
            <path
              d="M90 22 q8 6 6 16 M98 16 q12 10 8 24"
              stroke="#6b86f0"
              strokeWidth="3.5"
              fill="none"
              strokeLinecap="round"
            />
            <Label text="Hi!" fill="#3355d6" />
          </>
        ),
      },
      {
        id: 'thanks',
        label: 'Thanks!',
        art: (
          <>
            <path
              d="M60 86 C22 62 18 38 34 28 C46 20 56 26 60 36 C64 26 74 20 86 28 C102 38 98 62 60 86 Z"
              fill="#ff5d7a"
              stroke={WHITE}
              strokeWidth="5"
              strokeLinejoin="round"
            />
            <path
              d="M40 38 q4 -6 10 -6"
              stroke={WHITE}
              strokeWidth="4"
              fill="none"
              strokeLinecap="round"
              opacity=".7"
            />
            <Label text="Thanks!" fill="#e23d5e" />
          </>
        ),
      },
      {
        id: 'done',
        label: 'Done',
        art: (
          <>
            <circle cx="60" cy="50" r="34" fill="#28b874" stroke={WHITE} strokeWidth="5" />
            <path
              d="M44 51 l11 11 l22 -24"
              stroke={WHITE}
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Label text="Done" fill="#1f8a4c" />
          </>
        ),
      },
      {
        id: 'lol',
        label: 'LOL',
        art: (
          <>
            <Face>
              <path
                d="M40 42 l10 6 l-10 6 M80 42 l-10 6 l10 6"
                stroke={INK}
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M40 60 q20 26 40 0 z" fill={INK} />
              <path d="M48 70 q12 8 24 0" fill="#ff7b8a" />
              <path
                d="M26 50 q-6 10 0 16 q6 -6 0 -16 z M94 50 q6 10 0 16 q-6 -6 0 -16 z"
                fill="#5ec8ff"
              />
            </Face>
            <Label text="LOL" fill="#f08a00" />
          </>
        ),
      },
      {
        id: 'love',
        label: 'Love it',
        art: (
          <>
            <Face>
              {[46, 74].map((x) => (
                <path
                  key={x}
                  d={`M${x} 52 C${x - 12} 44 ${x - 9} 34 ${x - 3} 36 C${x - 1} 36 ${x} 38 ${x} 40 C${x} 38 ${x + 1} 36 ${x + 3} 36 C${x + 9} 34 ${x + 12} 44 ${x} 52 Z`}
                  fill="#ff4d6d"
                />
              ))}
              <path
                d="M44 62 q16 16 32 0"
                stroke={INK}
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
              />
            </Face>
            <Label text="Love it" fill="#e23d5e" />
          </>
        ),
      },
      {
        id: 'coffee',
        label: 'Coffee?',
        art: (
          <>
            <path
              d="M48 16 q-6 8 0 14 q6 6 0 14 M62 12 q-6 8 0 14 q6 6 0 14"
              stroke="#b9a08a"
              strokeWidth="3.5"
              fill="none"
              strokeLinecap="round"
            />
            <circle cx="84" cy="62" r="11" fill="none" stroke={WHITE} strokeWidth="11" />
            <circle cx="84" cy="62" r="11" fill="none" stroke="#c98b5e" strokeWidth="6" />
            <path
              d="M30 44 h56 v24 a20 20 0 0 1 -20 20 h-16 a20 20 0 0 1 -20 -20 z"
              fill="#c98b5e"
              stroke={WHITE}
              strokeWidth="5"
              strokeLinejoin="round"
            />
            <ellipse cx="58" cy="46" rx="24" ry="4" fill="#6e4426" />
            <Label text="Coffee?" fill="#8a5a36" />
          </>
        ),
      },
      {
        id: 'omw',
        label: 'On my way',
        art: (
          <>
            <circle cx="60" cy="50" r="34" fill={WHITE} stroke="#3355d6" strokeWidth="6" />
            {Array.from({ length: 12 }).map((_, i) => (
              <line
                key={i}
                x1="60"
                y1="21"
                x2="60"
                y2={i % 3 === 0 ? 27 : 24}
                stroke="#9aa6d6"
                strokeWidth="3"
                strokeLinecap="round"
                transform={`rotate(${i * 30} 60 50)`}
              />
            ))}
            <path d="M60 50 V34 M60 50 l12 8" stroke={INK} strokeWidth="5" strokeLinecap="round" />
            <circle cx="60" cy="50" r="4" fill="#ff5d7a" />
            <Label text="On my way" fill="#3355d6" />
          </>
        ),
      },
      {
        id: 'yay',
        label: 'Yay!',
        art: (
          <>
            <path
              d="M28 88 L46 34 L78 66 Z"
              fill="#ffb02e"
              stroke={WHITE}
              strokeWidth="5"
              strokeLinejoin="round"
            />
            <path
              d="M36 64 l10 10 M41 50 l18 18"
              stroke="#e2531f"
              strokeWidth="5"
              strokeLinecap="round"
            />
            {[
              ['#ff5d7a', 64, 22],
              ['#6b86f0', 84, 30],
              ['#28b874', 90, 50],
              ['#ffcd3c', 76, 12],
              ['#9d80f2', 98, 18],
            ].map(([c, x, y]) => (
              <rect
                key={`${x}-${y}`}
                x={x as number}
                y={y as number}
                width="8"
                height="8"
                rx="2"
                fill={c as string}
                transform={`rotate(25 ${x} ${y})`}
              />
            ))}
            <path
              d="M54 30 q8 -14 20 -8 M70 44 q14 -6 22 4"
              stroke="#ff5d7a"
              strokeWidth="3.5"
              fill="none"
              strokeLinecap="round"
            />
            <Label text="Yay!" fill="#9d4edd" />
          </>
        ),
      },
      {
        id: 'hmm',
        label: 'Hmm…',
        art: (
          <>
            <Face>
              <circle cx="47" cy="44" r="4.5" fill={INK} />
              <circle cx="73" cy="44" r="4.5" fill={INK} />
              <path
                d="M40 34 l12 -4 M68 30 l12 2"
                stroke={INK}
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <path d="M50 66 h18" stroke={INK} strokeWidth="4" strokeLinecap="round" />
              <path
                d="M34 82 q10 -14 22 -6 q-2 8 -12 10 z"
                fill={YELLOW_DARK}
                stroke={WHITE}
                strokeWidth="3"
              />
            </Face>
            <Label text="Hmm…" fill="#6b7280" />
          </>
        ),
      },
      {
        id: 'night',
        label: 'Good night',
        art: (
          <>
            <path
              d="M70 16 A36 36 0 1 0 100 70 A28 28 0 1 1 70 16 Z"
              fill="#ffd866"
              stroke={WHITE}
              strokeWidth="5"
              strokeLinejoin="round"
            />
            <path
              d="M86 26 l2.5 5 l5 2.5 l-5 2.5 l-2.5 5 l-2.5 -5 l-5 -2.5 l5 -2.5 z"
              fill="#9db4ff"
            />
            <path
              d="M98 50 l1.8 3.6 l3.6 1.8 l-3.6 1.8 l-1.8 3.6 l-1.8 -3.6 l-3.6 -1.8 l3.6 -1.8 z"
              fill="#9db4ff"
            />
            <text
              x="74"
              y="62"
              fontFamily="system-ui"
              fontWeight="800"
              fontSize="14"
              fill="#5b6bbf"
            >
              z
            </text>
            <text
              x="82"
              y="52"
              fontFamily="system-ui"
              fontWeight="800"
              fontSize="11"
              fill="#5b6bbf"
            >
              z
            </text>
            <Label text="Good night" fill="#3b3f8f" />
          </>
        ),
      },
      {
        id: 'fire',
        label: 'Nice!',
        art: (
          <>
            <path
              d="M60 12 C74 30 90 42 86 64 C83 82 72 90 60 90 C44 90 32 80 32 64 C32 50 42 44 44 30 C50 38 54 46 56 52 C58 38 56 26 60 12 Z"
              fill="#ff6a2b"
              stroke={WHITE}
              strokeWidth="5"
              strokeLinejoin="round"
            />
            <path
              d="M60 46 C68 56 74 62 72 72 C70 82 64 86 60 86 C52 86 46 80 47 72 C48 64 54 62 56 56 C58 60 59 62 60 64 C61 58 60 52 60 46 Z"
              fill="#ffcd3c"
            />
            <Label text="Nice!" fill="#e2531f" />
          </>
        ),
      },
      {
        id: 'ship',
        label: 'Ship it!',
        art: (
          <>
            <path d="M52 76 q8 18 16 0" fill="#ffb02e" stroke={WHITE} strokeWidth="3" />
            <path
              d="M60 12 C76 24 80 44 76 72 H44 C40 44 44 24 60 12 Z"
              fill="#eef1f8"
              stroke={WHITE}
              strokeWidth="5"
              strokeLinejoin="round"
            />
            <path
              d="M60 12 C76 24 80 44 76 72 H44 C40 44 44 24 60 12 Z"
              fill="none"
              stroke="#c4cbe0"
              strokeWidth="1.5"
            />
            <circle cx="60" cy="40" r="9" fill="#6b86f0" stroke={WHITE} strokeWidth="3" />
            <path
              d="M44 56 L30 72 V80 L44 72 Z M76 56 L90 72 V80 L76 72 Z"
              fill="#ff5d7a"
              stroke={WHITE}
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <Label text="Ship it!" fill="#3355d6" />
          </>
        ),
      },
      {
        id: 'ohno',
        label: 'Oh no',
        art: (
          <>
            <Face fill="#ffd866">
              <circle cx="47" cy="46" r="4.5" fill={INK} />
              <circle cx="73" cy="46" r="4.5" fill={INK} />
              <path
                d="M40 38 l12 -6 M80 38 l-12 -6"
                stroke={INK}
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <path
                d="M46 70 q14 -12 28 0"
                stroke={INK}
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
              />
              <path d="M76 52 q-5 9 0 13 q5 -4 0 -13 z" fill="#5ec8ff" />
            </Face>
            <Label text="Oh no" fill="#5b6bbf" />
          </>
        ),
      },
      {
        id: 'plus1',
        label: '+1',
        art: (
          <>
            <rect
              x="24"
              y="48"
              width="16"
              height="38"
              rx="4"
              fill="#6b86f0"
              stroke={WHITE}
              strokeWidth="4"
            />
            <path
              d="M40 52 L54 28 C56 18 70 18 68 32 L66 44 H84 C92 44 96 50 94 58 L88 80 C86 86 82 88 76 88 H40 Z"
              fill={YELLOW}
              stroke={WHITE}
              strokeWidth="5"
              strokeLinejoin="round"
            />
            <path
              d="M70 58 h18 M68 70 h16"
              stroke={YELLOW_DARK}
              strokeWidth="3"
              strokeLinecap="round"
            />
            <Label text="+1" fill="#3355d6" />
          </>
        ),
      },
      {
        id: 'morning',
        label: 'Good morning',
        art: (
          <>
            {Array.from({ length: 8 }).map((_, i) => (
              <rect
                key={i}
                x="57"
                y="8"
                width="6"
                height="14"
                rx="3"
                fill="#ffb02e"
                transform={`rotate(${i * 45} 60 48)`}
              />
            ))}
            <circle cx="60" cy="48" r="24" fill={YELLOW} stroke={WHITE} strokeWidth="5" />
            {happyEyes}
            <path
              d="M50 54 q10 10 20 0"
              stroke={INK}
              strokeWidth="3.5"
              fill="none"
              strokeLinecap="round"
              transform="translate(0 2)"
            />
            <Label text="Morning!" fill="#f08a00" />
          </>
        ),
      },
      {
        id: 'idea',
        label: 'Idea!',
        art: (
          <>
            <path
              d="M60 14 a26 26 0 0 1 16 46 c-3 3 -4 6 -4 10 h-24 c0 -4 -1 -7 -4 -10 a26 26 0 0 1 16 -46 z"
              fill="#ffe066"
              stroke={WHITE}
              strokeWidth="5"
              strokeLinejoin="round"
            />
            <rect
              x="48"
              y="72"
              width="24"
              height="12"
              rx="4"
              fill="#9aa3b5"
              stroke={WHITE}
              strokeWidth="3"
            />
            <path
              d="M54 52 q6 -10 12 0"
              stroke="#f2a922"
              strokeWidth="3.5"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M22 30 l8 4 M98 30 l-8 4 M16 52 h9 M104 52 h-9"
              stroke="#ffb02e"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <Label text="Idea!" fill="#c27c00" />
          </>
        ),
      },
    ],
  },
];

export function findSticker(pack: string, id: string): StickerDef | undefined {
  return STICKER_PACKS.find((p) => p.id === pack)?.stickers.find((s) => s.id === id);
}

export function BuiltInSticker({ def, size = 120 }: { def: StickerDef; size?: number }) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label={`${def.label} sticker`}
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.18))' }}
    >
      {def.art}
    </svg>
  );
}

/** Renders any sticker reference: a built-in one, or a custom (encrypted) image sticker. */
export function StickerView({ sticker, size = 140 }: { sticker: StickerRef; size?: number }) {
  if ('pack' in sticker) {
    const def = findSticker(sticker.pack, sticker.id);
    if (!def) return <span className="text-[13px] text-muted italic">Sticker</span>;
    return <BuiltInSticker def={def} size={size} />;
  }
  return <CustomSticker sticker={sticker.custom} size={size} />;
}

function CustomSticker({
  sticker,
  size,
}: {
  sticker: Extract<StickerRef, { custom: unknown }>['custom'];
  size: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    e2ee.fileUrl(sticker, resolveFileUrl).then(
      (u) => !cancelled && setUrl(u),
      () => !cancelled && setFailed(true)
    );
    return () => {
      cancelled = true;
    };
  }, [sticker]);

  return (
    <span
      className={cn('inline-flex items-center justify-center')}
      style={{ width: size, height: size }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Sticker"
          className="max-w-full max-h-full object-contain drop-shadow-sm"
        />
      ) : failed ? (
        <ImageOff className="w-6 h-6 text-subtle" aria-label="Sticker unavailable" />
      ) : (
        <Loader2 className="w-5 h-5 animate-spin text-subtle" aria-label="Loading sticker" />
      )}
    </span>
  );
}
