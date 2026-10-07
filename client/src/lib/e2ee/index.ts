'use client';

import { useSyncExternalStore } from 'react';
import { api } from '../api';
import {
  decryptEnvelope,
  decryptFile,
  encryptEnvelope,
  encryptFile,
  Envelope,
  generateDeviceKeyPair,
  NotForThisDeviceError,
  safetyNumber,
  safeBlobType,
  DeviceKey,
} from './crypto';
import { keystore, SearchEntry, StoredIdentity } from './keystore';

export type { Envelope } from './crypto';

/** A built-in sticker (pack + id) or a custom image sticker stored as an encrypted file. */
export type StickerRef =
  { pack: string; id: string } | { custom: EncryptedFileRef & { width?: number; height?: number } };

export interface EncryptedFileRef {
  fileUrl: string;
  key: string;
  iv: string;
  mimeType: string;
}

export interface EncryptedAttachment extends EncryptedFileRef {
  fileName: string;
  fileSize: number;
  width?: number;
  height?: number;
}

/** What actually gets encrypted. The server never sees any of this. */
export interface MessagePayload {
  text?: string;
  attachments?: EncryptedAttachment[];
  sticker?: StickerRef;
}

export interface DeviceInfo {
  id: string;
  userId: string;
  publicKey: string;
  name: string;
  createdAt: string;
  lastSeenAt: string;
}

export type DecryptState = 'ok' | 'not-for-device' | 'error';

export class EncryptionUnavailableError extends Error {}

export type E2EEStatus = 'off' | 'setting-up' | 'ready' | 'unavailable';

const DEVICE_CACHE_MS = 5 * 60 * 1000;

function deviceName(): string {
  if (typeof navigator === 'undefined') return 'Browser';
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} on ${os}` : browser;
}

class E2EEManager {
  private userId: string | null = null;
  private identity: StoredIdentity | null = null;
  private readyPromise: Promise<StoredIdentity> | null = null;
  private devices = new Map<string, { list: DeviceInfo[]; at: number }>();
  private inflight = new Map<string, Promise<void>>();
  private decrypted = new Map<string, Promise<{ payload?: MessagePayload; state: DecryptState }>>();
  private listeners = new Set<() => void>();
  private status: E2EEStatus = 'off';
  /** Bumped whenever keys change, so UIs can recompute security codes. */
  private keyVersion = 0;

  /** Set up (or load) this browser's device keys for the signed-in user. */
  start(userId: string): Promise<StoredIdentity> {
    if (this.userId === userId && this.readyPromise) return this.readyPromise;
    this.userId = userId;
    this.identity = null;
    this.devices.clear();
    this.decrypted.clear();
    this.status = 'setting-up';
    this.emit();
    this.readyPromise = this.loadOrCreate(userId);
    this.readyPromise.then(
      () => {
        this.status = 'ready';
        this.emit();
      },
      () => {
        this.status = 'unavailable';
        this.emit();
      }
    );
    return this.readyPromise;
  }

  stop() {
    this.status = 'off';
    this.userId = null;
    this.identity = null;
    this.readyPromise = null;
    this.devices.clear();
    this.decrypted.clear();
  }

  /** Resolves once keys are ready; rejects with EncryptionUnavailableError if setup failed. */
  async ready(): Promise<StoredIdentity> {
    if (!this.readyPromise) throw new EncryptionUnavailableError('Not signed in');
    try {
      return await this.readyPromise;
    } catch (err) {
      throw err instanceof EncryptionUnavailableError
        ? err
        : new EncryptionUnavailableError('Encryption could not be set up on this device');
    }
  }

  get current(): StoredIdentity | null {
    return this.identity;
  }

  getStatus = (): E2EEStatus => this.status;
  getKeyVersion = (): number => this.keyVersion;

  /** Retry setup after a failure (e.g. the server was updated or the network came back). */
  retry() {
    const userId = this.userId;
    if (!userId) return;
    this.userId = null;
    this.start(userId).catch(() => {});
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  private async loadOrCreate(userId: string): Promise<StoredIdentity> {
    let stored: StoredIdentity | undefined;
    let persistent = true;
    try {
      stored = await keystore.getIdentity(userId);
    } catch {
      // No IndexedDB (e.g. some private modes): keys live in memory for this session only
      persistent = false;
    }

    if (stored) {
      // Make sure the server still knows this device (it may have been removed elsewhere)
      const mine = await api.get('/keys/devices/me');
      const known = (mine.data?.data as DeviceInfo[]).some(
        (d) => d.id === stored!.deviceId && d.publicKey === stored!.publicKey
      );
      if (known) {
        api.post(`/keys/devices/${stored.deviceId}/seen`).catch(() => {});
        this.identity = stored;
        return stored;
      }
    }

    const pair = await generateDeviceKeyPair();
    const res = await api.post('/keys/devices', { publicKey: pair.publicKey, name: deviceName() });
    const identity: StoredIdentity = {
      userId,
      deviceId: res.data.data.id,
      privateKey: pair.privateKey,
      publicKey: pair.publicKey,
      createdAt: new Date().toISOString(),
      // Keep earlier keys of this browser so messages sent to them still decrypt
      previous: stored
        ? [
            ...(stored.previous ?? []),
            { deviceId: stored.deviceId, privateKey: stored.privateKey },
          ].slice(-10)
        : [],
    };
    if (persistent) {
      try {
        await keystore.saveIdentity(identity);
      } catch {
        // Keep working for this session even if storage fails
      }
    }
    this.identity = identity;
    return identity;
  }

  // -------------------------------------------------------------- key directory
  invalidateDevices(userId?: string) {
    if (userId) this.devices.delete(userId);
    else this.devices.clear();
    this.keyVersion++;
    this.emit();
  }

  /**
   * Devices that appeared for a user since you last acknowledged their device list.
   * The first time a user is seen, their devices are acknowledged automatically.
   */
  newDevices(userIds: string[]): { userId: string; devices: DeviceInfo[] }[] {
    const acked = readAckedDevices();
    const out: { userId: string; devices: DeviceInfo[] }[] = [];
    for (const id of userIds) {
      const hit = this.devices.get(id);
      const known = acked[id];
      if (!hit || !known) continue;
      const added = hit.list.filter(
        (d) => !known.includes(d.id) && d.id !== this.identity?.deviceId
      );
      if (added.length) out.push({ userId: id, devices: added });
    }
    return out;
  }

  acknowledgeDevices(userIds: string[]) {
    const acked = readAckedDevices();
    for (const id of userIds) {
      const hit = this.devices.get(id);
      if (hit) acked[id] = hit.list.map((d) => d.id);
    }
    writeAckedDevices(acked);
    this.keyVersion++;
    this.emit();
  }

  /** Public keys for users, cached for a few minutes and refreshed on `keys:changed`. */
  async getDevices(userIds: string[], force = false): Promise<Map<string, DeviceInfo[]>> {
    const now = Date.now();
    const missing = [...new Set(userIds)].filter((id) => {
      const hit = this.devices.get(id);
      return force || !hit || now - hit.at > DEVICE_CACHE_MS;
    });
    if (missing.length) {
      const key = missing.sort().join(',');
      let req = this.inflight.get(key);
      if (!req) {
        req = api
          .get(`/keys/devices?userIds=${encodeURIComponent(key)}`)
          .then((res) => {
            const list = (res.data?.data || []) as DeviceInfo[];
            const at = Date.now();
            const acked = readAckedDevices();
            let firstSight = false;
            for (const id of missing) {
              const devices = list.filter((d) => d.userId === id);
              this.devices.set(id, { list: devices, at });
              if (!acked[id]) {
                acked[id] = devices.map((d) => d.id);
                firstSight = true;
              }
            }
            if (firstSight) writeAckedDevices(acked);
            // Let UIs re-check for new devices / security code changes
            this.keyVersion++;
            this.emit();
          })
          .finally(() => this.inflight.delete(key));
        this.inflight.set(key, req);
      }
      await req;
    }
    return new Map(userIds.map((id) => [id, this.devices.get(id)?.list ?? []]));
  }

  // ------------------------------------------------------------------ encrypt
  /**
   * Encrypt a payload for every device of every member (including your own other devices).
   * Returns which members have no devices yet and so can't read it.
   */
  async encryptForMembers(
    memberIds: string[],
    payload: MessagePayload,
    roomId: string
  ): Promise<{ envelope: Envelope; unreachable: string[] }> {
    const me = await this.ready();
    const devices = await this.getDevices(memberIds);
    const recipients: DeviceKey[] = [];
    const unreachable: string[] = [];
    for (const id of memberIds) {
      const list = devices.get(id) ?? [];
      if (!list.length && id !== me.userId) unreachable.push(id);
      list.forEach((d) => recipients.push({ deviceId: d.id, publicKey: d.publicKey }));
    }
    if (!recipients.some((r) => r.deviceId === me.deviceId)) {
      recipients.push({ deviceId: me.deviceId, publicKey: me.publicKey });
    }
    const envelope = await encryptEnvelope(payload, me, recipients, roomId);
    return { envelope, unreachable };
  }

  /** Encrypt and upload a file. The server stores only an opaque blob. */
  async uploadEncryptedFile(
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<EncryptedAttachment> {
    const data = await file.arrayBuffer();
    let width: number | undefined;
    let height: number | undefined;
    if (file.type.startsWith('image/') && typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file);
        width = bitmap.width;
        height = bitmap.height;
        bitmap.close();
      } catch {
        // Not a decodable image; send without dimensions
      }
    }
    const { blob, key, iv } = await encryptFile(data);
    const form = new FormData();
    form.append('file', blob, 'encrypted.bin');
    const res = await api.post('/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => onProgress?.(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
    });
    return {
      fileUrl: res.data.data.fileUrl,
      key,
      iv,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      width,
      height,
    };
  }

  // ------------------------------------------------------------------ decrypt
  /**
   * Decrypt an envelope sent by `senderId` in `roomId`. Cached per (room, sender, IV, GCM tag),
   * so a replayed IV with different ciphertext or a different sender is decrypted afresh.
   */
  decrypt(envelope: Envelope, senderId: string, roomId: string) {
    const cacheKey = `${roomId}|${senderId}|${envelope.sender}|${envelope.iv}|${envelope.ct.slice(-24)}`;
    let result = this.decrypted.get(cacheKey);
    if (!result) {
      result = this.decryptUncached(envelope, senderId, roomId);
      this.decrypted.set(cacheKey, result);
      // Don't remember failures: they may be transient (e.g. keys not fetched yet)
      result.then((r) => {
        if (r.state === 'error') this.decrypted.delete(cacheKey);
      });
    }
    return result;
  }

  private async decryptUncached(
    envelope: Envelope,
    senderId: string,
    roomId: string
  ): Promise<{ payload?: MessagePayload; state: DecryptState }> {
    try {
      const identity = await this.ready();
      // This browser's current key, or an earlier one it replaced
      const me = [
        { deviceId: identity.deviceId, privateKey: identity.privateKey },
        ...(identity.previous ?? []),
      ].find((k) => envelope.keys[k.deviceId]);
      if (!me) return { state: 'not-for-device' };
      let senderDevice = (await this.getDevices([senderId]))
        .get(senderId)
        ?.find((d) => d.id === envelope.sender);
      if (!senderDevice) {
        // Possibly a brand-new device: refresh once
        senderDevice = (await this.getDevices([senderId], true))
          .get(senderId)
          ?.find((d) => d.id === envelope.sender);
      }
      if (!senderDevice) return { state: 'error' };
      const payload = await decryptEnvelope<MessagePayload>(
        envelope,
        me,
        senderDevice.publicKey,
        roomId
      );
      return { payload, state: 'ok' };
    } catch (err) {
      return { state: err instanceof NotForThisDeviceError ? 'not-for-device' : 'error' };
    }
  }

  // ----------------------------------------------------------- files (decrypt)
  private fileUrls = new Map<string, Promise<string>>();

  /** Fetch + decrypt an encrypted file and return an object URL (cached for the session). */
  fileUrl(ref: EncryptedFileRef, resolveUrl: (u: string) => string): Promise<string> {
    const cacheKey = `${ref.fileUrl}|${ref.key}`;
    let url = this.fileUrls.get(cacheKey);
    if (!url) {
      url = fetch(resolveUrl(ref.fileUrl))
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then((buf) => decryptFile(buf, ref.key, ref.iv))
        // Never give the blob a type that could render as a document (HTML, SVG…)
        .then((plain) =>
          URL.createObjectURL(new Blob([plain], { type: safeBlobType(ref.mimeType) }))
        );
      url.catch(() => this.fileUrls.delete(cacheKey));
      this.fileUrls.set(cacheKey, url);
    }
    return url;
  }

  // -------------------------------------------------------------- local search
  indexMessages(entries: Omit<SearchEntry, 'userId'>[]) {
    if (!this.userId || !entries.length) return;
    const userId = this.userId;
    keystore.putSearchEntries(entries.map((e) => ({ ...e, userId }))).catch(() => {});
  }

  unindexMessage(id: string) {
    keystore.removeSearchEntry(id).catch(() => {});
  }

  searchLocal(query: string, limit?: number): Promise<SearchEntry[]> {
    if (!this.userId) return Promise.resolve([]);
    return keystore.search(this.userId, query, limit).catch(() => []);
  }

  // ------------------------------------------------------------ verification
  async safetyNumberWith(peerId: string): Promise<string> {
    const me = await this.ready();
    const devices = await this.getDevices([me.userId, peerId]);
    return safetyNumber(
      { userId: me.userId, publicKeys: (devices.get(me.userId) ?? []).map((d) => d.publicKey) },
      { userId: peerId, publicKeys: (devices.get(peerId) ?? []).map((d) => d.publicKey) }
    );
  }

  /**
   * Sign-out cleanup: remove decrypted text and per-user data kept on this device. The device
   * key stays so the same person can sign back in here and still read their history.
   */
  async clearLocalData() {
    const userId = this.userId;
    if (userId) await keystore.clearSearch(userId).catch(() => {});
    for (const key of ['cengine_my_stickers', 'cengine_verified', 'cengine_known_devices']) {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
    this.fileUrls.forEach((p) => p.then((u) => URL.revokeObjectURL(u)).catch(() => {}));
    this.fileUrls.clear();
  }

  /** Remove this device: server forgets its public key and the private key is erased here. */
  async removeThisDevice() {
    const me = this.identity;
    if (!me) return;
    await api.delete(`/keys/devices/${me.deviceId}`).catch(() => {});
    await keystore.deleteIdentity(me.userId).catch(() => {});
    await keystore.clearSearch(me.userId).catch(() => {});
    this.stop();
  }
}

export const e2ee = new E2EEManager();

// Verified contacts: userId -> safety number the user confirmed (stored on this device)
const VERIFIED_KEY = 'cengine_verified';

export function readVerified(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(VERIFIED_KEY) || '{}');
  } catch {
    return {};
  }
}

export function setVerified(userId: string, number: string | null) {
  const all = readVerified();
  if (number) all[userId] = number;
  else delete all[userId];
  try {
    localStorage.setItem(VERIFIED_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event('cengine:verified'));
}

/** Current encryption setup status, re-rendering when it changes. */
export function useE2EEStatus(): E2EEStatus {
  return useSyncExternalStore(e2ee.subscribe, e2ee.getStatus, () => 'off');
}

/** Changes whenever any contact's keys change (to recompute security codes). */
export function useKeyVersion(): number {
  return useSyncExternalStore(e2ee.subscribe, e2ee.getKeyVersion, () => 0);
}

// Device lists the user has acknowledged: userId -> device ids (stored on this device)
const ACKED_KEY = 'cengine_known_devices';

function readAckedDevices(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(ACKED_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeAckedDevices(value: Record<string, string[]>) {
  try {
    localStorage.setItem(ACKED_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
}
