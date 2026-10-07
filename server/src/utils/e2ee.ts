import { z } from 'zod';
import { AppError } from './errors.js';

const base64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Invalid base64');

/**
 * End-to-end encrypted message envelope. The server can't read it: `ct` is the
 * AES-256-GCM ciphertext of the message payload, and `keys` holds that message key
 * wrapped separately for each recipient device. The server only checks shape and size.
 */
export const e2eeEnvelopeSchema = z.object({
  v: z.literal(1),
  alg: z.literal('P256-HKDF-AESGCM'),
  /** Sender's device id, used by recipients to look up the sender's public key */
  sender: z.string().uuid(),
  iv: base64.max(32),
  ct: base64.max(200_000),
  keys: z
    .record(z.string().uuid(), base64.max(256))
    .refine((k) => Object.keys(k).length > 0 && Object.keys(k).length <= 500, {
      message: 'Envelope must be wrapped for 1–500 devices',
    }),
});

export type E2eeEnvelope = z.infer<typeof e2eeEnvelopeSchema>;

/** Validate an envelope coming from any transport (REST or socket). */
export function parseEnvelope(value: unknown): E2eeEnvelope | undefined {
  if (value === undefined || value === null) return undefined;
  const result = e2eeEnvelopeSchema.safeParse(value);
  if (!result.success) throw new AppError('Invalid encrypted message.', 400);
  return result.data;
}
