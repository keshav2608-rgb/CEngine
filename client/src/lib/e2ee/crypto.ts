/**
 * End-to-end encryption primitives (Web Crypto only, no third-party crypto code).
 *
 * Every device (browser) has an ECDH P-256 key pair. To send a message:
 *   1. A fresh random AES-256-GCM key encrypts the payload (text, file keys, sticker…).
 *   2. That message key is wrapped once per recipient device: ECDH(sender device private,
 *      recipient device public) -> HKDF-SHA-256 (salt = message IV, info binds both device
 *      ids) -> AES-256-GCM key that encrypts the message key.
 * Only the recipient device or the real sender device can derive a wrapping key, so a
 * successful unwrap also authenticates which device sent the message.
 * The server only ever sees the envelope below.
 */

export const ALG = 'P256-HKDF-AESGCM' as const;

export interface Envelope {
  v: 1;
  alg: typeof ALG;
  /** Sender device id */
  sender: string;
  /** IV for the payload ciphertext (base64) */
  iv: string;
  /** AES-GCM ciphertext of the JSON payload (base64) */
  ct: string;
  /** recipient device id -> base64(wrapIv[12] || wrappedMessageKey) */
  keys: Record<string, string>;
}

export interface DeviceKey {
  deviceId: string;
  publicKey: string; // base64 SPKI
}

const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

// ------------------------------------------------------------------ base64
export function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) {
    bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

// ------------------------------------------------------------- device keys
/** New device key pair. The private key is non-extractable: it can be used but never read. */
export async function generateDeviceKeyPair(): Promise<{
  privateKey: CryptoKey;
  publicKey: string;
}> {
  const pair = (await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const spki = await subtle().exportKey('spki', pair.publicKey);
  return { privateKey: pair.privateKey, publicKey: toB64(spki) };
}

const publicKeyCache = new Map<string, Promise<CryptoKey>>();

export function importPublicKey(b64: string): Promise<CryptoKey> {
  let key = publicKeyCache.get(b64);
  if (!key) {
    key = subtle().importKey(
      'spki',
      fromB64(b64),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );
    publicKeyCache.set(b64, key);
    key.catch(() => publicKeyCache.delete(b64));
  }
  return key;
}

async function deriveWrapKey(
  myPrivate: CryptoKey,
  theirPublicB64: string,
  salt: Uint8Array<ArrayBuffer>,
  senderDeviceId: string,
  recipientDeviceId: string
): Promise<CryptoKey> {
  const theirPublic = await importPublicKey(theirPublicB64);
  const shared = await subtle().deriveBits({ name: 'ECDH', public: theirPublic }, myPrivate, 256);
  const hkdfKey = await subtle().importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: enc.encode(`cengine-e2ee-v1|wrap|${senderDeviceId}|${recipientDeviceId}`),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ---------------------------------------------------------------- messages
/** Authenticated data for the payload: binds it to the conversation and sender device. */
function payloadAad(roomId: string, senderDeviceId: string) {
  return enc.encode(`cengine-e2ee-v1|payload|${roomId}|${senderDeviceId}`);
}

/**
 * Authenticated data for each wrapped message key: a hash committing to the exact ciphertext,
 * IV, sender device and room. Without it, a recipient who learned the message key could
 * re-encrypt different content under the same wrapped keys and pass it off as the sender's.
 */
async function wrapAad(roomId: string, senderDeviceId: string, ivB64: string, ctB64: string) {
  return new Uint8Array(
    await subtle().digest(
      'SHA-256',
      enc.encode(`cengine-e2ee-v1|wrap|${roomId}|${senderDeviceId}|${ivB64}|${ctB64}`)
    )
  );
}

export async function encryptEnvelope(
  payload: unknown,
  sender: { deviceId: string; privateKey: CryptoKey },
  recipients: DeviceKey[],
  roomId: string
): Promise<Envelope> {
  if (recipients.length === 0) throw new Error('No recipient devices');

  const messageKeyRaw = randomBytes(32);
  const messageKey = await subtle().importKey('raw', messageKeyRaw, 'AES-GCM', false, ['encrypt']);
  const iv = randomBytes(12);
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: payloadAad(roomId, sender.deviceId) },
    messageKey,
    enc.encode(JSON.stringify(payload))
  );
  const ivB64 = toB64(iv);
  const ctB64 = toB64(ct);
  const aad = await wrapAad(roomId, sender.deviceId, ivB64, ctB64);

  const keys: Record<string, string> = {};
  await Promise.all(
    recipients.map(async (r) => {
      const wrapKey = await deriveWrapKey(
        sender.privateKey,
        r.publicKey,
        iv,
        sender.deviceId,
        r.deviceId
      );
      const wrapIv = randomBytes(12);
      const wrapped = new Uint8Array(
        await subtle().encrypt(
          { name: 'AES-GCM', iv: wrapIv, additionalData: aad },
          wrapKey,
          messageKeyRaw
        )
      );
      const out = new Uint8Array(12 + wrapped.length);
      out.set(wrapIv, 0);
      out.set(wrapped, 12);
      keys[r.deviceId] = toB64(out);
    })
  );
  messageKeyRaw.fill(0);

  return { v: 1, alg: ALG, sender: sender.deviceId, iv: ivB64, ct: ctB64, keys };
}

export class NotForThisDeviceError extends Error {
  constructor() {
    super('This message was not encrypted for this device');
  }
}

/**
 * Decrypt an envelope for `roomId`. Fails if the ciphertext, room, IV or sender device were
 * changed, or if it wasn't wrapped by the holder of `senderPublicKey`'s private key.
 */
export async function decryptEnvelope<T = unknown>(
  envelope: Envelope,
  me: { deviceId: string; privateKey: CryptoKey },
  senderPublicKey: string,
  roomId: string
): Promise<T> {
  const wrappedB64 = envelope.keys[me.deviceId];
  if (!wrappedB64) throw new NotForThisDeviceError();
  const wrappedAll = fromB64(wrappedB64);
  const iv = fromB64(envelope.iv);

  const wrapKey = await deriveWrapKey(
    me.privateKey,
    senderPublicKey,
    iv,
    envelope.sender,
    me.deviceId
  );
  const aad = await wrapAad(roomId, envelope.sender, envelope.iv, envelope.ct);
  const messageKeyRaw = await subtle().decrypt(
    { name: 'AES-GCM', iv: wrappedAll.slice(0, 12), additionalData: aad },
    wrapKey,
    wrappedAll.slice(12)
  );
  const messageKey = await subtle().importKey('raw', messageKeyRaw, 'AES-GCM', false, ['decrypt']);
  const plain = await subtle().decrypt(
    { name: 'AES-GCM', iv, additionalData: payloadAad(roomId, envelope.sender) },
    messageKey,
    fromB64(envelope.ct)
  );
  return JSON.parse(dec.decode(plain)) as T;
}

/** Safe MIME types to give a decrypted blob; anything else is treated as raw bytes. */
const SAFE_BLOB_TYPE =
  /^(image\/(png|jpeg|gif|webp|avif|bmp)|audio\/(mpeg|mp4|ogg|wav|webm|aac)|video\/(mp4|webm|ogg))$/;

/**
 * The type to use for a decrypted file's blob URL. The sender controls the declared type, so
 * an HTML or SVG file must never become a document that could run script in this origin.
 */
export function safeBlobType(declared: string): string {
  return SAFE_BLOB_TYPE.test(declared) ? declared : 'application/octet-stream';
}

// ------------------------------------------------------------------- files
/** Encrypt a file with its own random key; the key travels inside the encrypted message. */
export async function encryptFile(
  data: ArrayBuffer
): Promise<{ blob: Blob; key: string; iv: string }> {
  const keyRaw = randomBytes(32);
  const key = await subtle().importKey('raw', keyRaw, 'AES-GCM', false, ['encrypt']);
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, data);
  const result = {
    blob: new Blob([ct], { type: 'application/octet-stream' }),
    key: toB64(keyRaw),
    iv: toB64(iv),
  };
  keyRaw.fill(0);
  return result;
}

export async function decryptFile(
  data: ArrayBuffer,
  keyB64: string,
  ivB64: string
): Promise<ArrayBuffer> {
  const key = await subtle().importKey('raw', fromB64(keyB64), 'AES-GCM', false, ['decrypt']);
  return subtle().decrypt({ name: 'AES-GCM', iv: fromB64(ivB64) }, key, data);
}

// ---------------------------------------------------------- safety numbers
/**
 * A code two people can compare (in person or on a call) to confirm no one swapped their
 * keys. Derived from both users' ids and all their device public keys; identical on both sides.
 */
export async function safetyNumber(
  a: { userId: string; publicKeys: string[] },
  b: { userId: string; publicKeys: string[] }
): Promise<string> {
  const part = (x: typeof a) => `${x.userId}:${[...x.publicKeys].sort().join(',')}`;
  const [first, second] = [part(a), part(b)].sort();
  let digest = new Uint8Array(
    await subtle().digest('SHA-512', enc.encode(`cengine-safety-v1|${first}|${second}`))
  );
  // Iterate to make brute-forcing a colliding key set expensive
  for (let i = 0; i < 1024; i++) {
    digest = new Uint8Array(await subtle().digest('SHA-512', digest));
  }
  // 12 groups of 5 digits, each from its own 5 bytes of the 64-byte digest (Signal's encoding)
  const groups: string[] = [];
  for (let i = 0; i < 12; i++) {
    let n = 0;
    for (let j = 0; j < 5; j++) n = n * 256 + digest[i * 5 + j];
    groups.push(String(n % 100000).padStart(5, '0'));
  }
  return groups.join(' ');
}
