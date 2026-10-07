'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useLayoutEffect,
} from 'react';
import { useAuth } from './auth-context';
import { getSocket } from './socket';
import { api } from './api';
import { readPreferences } from './preferences';
import { setAppBadge } from './pwa';
import { decodeEntities, getErrorMessage } from './utils';
import { useToast } from '@/components/ui/Toast';
import {
  e2ee,
  Envelope,
  DecryptState,
  EncryptedAttachment,
  MessagePayload,
  StickerRef,
} from './e2ee';

export interface RoomMember {
  id: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    status: string;
    isOnline?: boolean;
    lastSeenAt?: string;
  };
}

export interface Attachment {
  id: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  width?: number;
  height?: number;
  /** Present on end-to-end encrypted files: the blob must be decrypted with this key/iv. */
  key?: string;
  iv?: string;
}

export type AttachmentInput = Omit<Attachment, 'id'>;

export interface MessageReceipt {
  id: string;
  userId: string;
  status: 'SENT' | 'DELIVERED' | 'READ';
  updatedAt?: string;
}

export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  content: string | null;
  messageType: 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM';
  isEdited: boolean;
  isDeleted: boolean;
  replyToId?: string | null;
  replyTo?: {
    id: string;
    content: string | null;
    e2ee?: Envelope | null;
    isDeleted?: boolean;
    sender: {
      id: string;
      displayName: string;
    };
  } | null;
  attachments?: Attachment[];
  receipts?: MessageReceipt[];
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  sender: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  /** End-to-end encrypted envelope as stored by the server (content is null when set). */
  e2ee?: Envelope | null;
  /** Client-only: result of decrypting `e2ee` on this device. */
  e2eeState?: DecryptState;
  /** Client-only: decrypted sticker, if the message is a sticker. */
  sticker?: StickerRef;
  /** Client-only: set on optimistic messages until the server confirms them. */
  clientId?: string;
  sendStatus?: 'sending' | 'failed';
  sendError?: string;
  /** Client-only: the encrypted envelope prepared for an outgoing message. */
  outgoing?: Envelope;
}

export interface Room {
  id: string;
  isGroup: boolean;
  name: string | null;
  description?: string | null;
  avatarUrl: string | null;
  inviteCode?: string | null;
  members: RoomMember[];
  lastMessage?: Message | null;
  unreadCount: number;
  peerIsOnline?: boolean;
  updatedAt: string;
}

export type ConnectionState = 'connecting' | 'connected' | 'offline';

interface ChatContextType {
  rooms: Room[];
  activeRoom: Room | null;
  messages: Message[];
  isLoadingRooms: boolean;
  isLoadingMessages: boolean;
  isLoadingOlder: boolean;
  hasMoreMessages: boolean;
  typingUsers: string[];
  typingByRoom: Record<string, string[]>;
  replyingTo: Message | null;
  editingMessageId: string | null;
  onlineMap: Record<string, boolean>;
  lastSeenMap: Record<string, string>;
  connectionState: ConnectionState;
  /** First unread message in the active room when it was opened (for the "New" divider). */
  unreadMarkerId: string | null;
  /** Message the list should scroll to and highlight (reply quotes, search results). */
  jumpTarget: string | null;
  setActiveRoom: (room: Room | null) => void;
  loadOlderMessages: () => Promise<void>;
  sendMessage: (content: string, attachments?: EncryptedAttachment[], sticker?: StickerRef) => void;
  retryMessage: (clientId: string) => void;
  discardMessage: (clientId: string) => void;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => void;
  sendTypingStatus: (isTyping: boolean) => void;
  setReplyingTo: (msg: Message | null) => void;
  setEditingMessageId: (id: string | null) => void;
  jumpToMessage: (roomId: string, messageId: string) => void;
  clearJumpTarget: () => void;
  createDirectChat: (targetUserId: string) => Promise<Room>;
  createGroup: (name: string, description?: string, memberIds?: string[]) => Promise<Room>;
  joinedRoom: (room: Room) => Promise<void>;
  refreshRooms: () => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

const SEND_TIMEOUT_MS = 10000;
const TYPING_EMIT_INTERVAL_MS = 2500;
const TYPING_EXPIRE_MS = 6000;
const UNDO_DELETE_MS = 5000;

/** Insert a server message, replacing its optimistic copy (matched by clientId) or a duplicate id. */
function mergeIncoming(prev: Message[], msg: Message): Message[] {
  const cid = msg.metadata?.clientId as string | undefined;
  let replaced = false;
  const next: Message[] = [];
  for (const m of prev) {
    if (m.id === msg.id || (cid && m.clientId === cid)) {
      if (!replaced) {
        // Keep the clientId so the React key (and the rendered bubble) stays stable
        next.push(m.clientId ? { ...msg, clientId: m.clientId } : msg);
        replaced = true;
      }
      continue;
    }
    next.push(m);
  }
  if (!replaced) next.push(msg);
  return next;
}

/** Text shown for a message, for previews and notifications (decrypted when encrypted). */
export function messagePreviewText(
  m: Pick<Message, 'content' | 'e2ee' | 'e2eeState' | 'sticker' | 'attachments'>
): string {
  if (m.e2eeState && m.e2eeState !== 'ok') return 'Encrypted message';
  if (m.sticker) return 'Sticker';
  if (m.content) return m.e2ee || m.e2eeState ? m.content : decodeEntities(m.content);
  if (m.attachments?.length) {
    return m.attachments.length > 1
      ? `${m.attachments.length} attachments`
      : m.attachments[0].fileName;
  }
  return '';
}

/** Decrypt a server message (and its reply quote) for display. Plaintext messages pass through. */
async function hydrate(msg: Message): Promise<Message> {
  let out = msg;
  if (msg.isDeleted) {
    e2ee.unindexMessage(msg.id);
  } else if (msg.e2ee) {
    const result = await e2ee.decrypt(msg.e2ee, msg.senderId, msg.roomId);
    const payload: MessagePayload = result.payload ?? {};
    out = {
      ...msg,
      e2eeState: result.state,
      content: payload.text ?? null,
      attachments: (payload.attachments ?? []).map((a, i) => ({ ...a, id: `${msg.id}_${i}` })),
      sticker: payload.sticker,
    };
    if (result.state === 'ok' && payload.text) {
      e2ee.indexMessages([
        {
          id: msg.id,
          roomId: msg.roomId,
          senderId: msg.senderId,
          senderName: msg.sender.displayName,
          text: payload.text,
          createdAt: msg.createdAt,
        },
      ]);
    }
  }
  const reply = msg.replyTo;
  if (reply?.e2ee && !reply.isDeleted) {
    const result = await e2ee.decrypt(reply.e2ee, reply.sender.id, msg.roomId);
    const p = result.payload ?? {};
    out = {
      ...out,
      replyTo: {
        ...reply,
        content:
          result.state !== 'ok'
            ? 'Encrypted message'
            : (p.text ?? (p.sticker ? 'Sticker' : p.attachments?.length ? 'Attachment' : null)),
      },
    };
  }
  return out;
}

const hydrateAll = (list: Message[]) => Promise.all(list.map(hydrate));

/** Strip the client-side id from a decrypted attachment before re-encrypting it. */
function toEncryptedAttachment(a: Attachment): EncryptedAttachment {
  return {
    fileUrl: a.fileUrl,
    fileName: a.fileName,
    fileSize: a.fileSize,
    mimeType: a.mimeType,
    width: a.width,
    height: a.height,
    key: a.key ?? '',
    iv: a.iv ?? '',
  };
}

function sortRooms(list: Room[]): Room[] {
  return [...list].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user, accessToken } = useAuth();
  const { toast } = useToast();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [fallbackRoom, setFallbackRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  // Loading flags are derived: rooms load once per session; messages per opened room
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [messagesRoomId, setMessagesRoomId] = useState<string | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [typingMap, setTypingMap] = useState<Record<string, Record<string, string>>>({});
  const [onlineMap, setOnlineMap] = useState<Record<string, boolean>>({});
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [unreadMarkerId, setUnreadMarkerId] = useState<string | null>(null);
  const [jumpTargetState, setJumpTarget] = useState<{ roomId: string; messageId: string } | null>(
    null
  );
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const activeRoom = useMemo(
    () => (activeRoomId ? (rooms.find((r) => r.id === activeRoomId) ?? fallbackRoom) : null),
    [rooms, activeRoomId, fallbackRoom]
  );

  // Latest values for socket handlers and async callbacks
  const activeRoomIdRef = useRef<string | null>(null);
  const roomsRef = useRef<Room[]>([]);
  const userRef = useRef(user);
  const replyingToRef = useRef<Message | null>(null);
  const nextCursorRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);
  useLayoutEffect(() => {
    messagesRef.current = messages;
    activeRoomIdRef.current = activeRoomId;
    roomsRef.current = rooms;
    userRef.current = user;
    replyingToRef.current = replyingTo;
    nextCursorRef.current = nextCursor;
  });

  // Reset per-session / per-room state during render rather than in effects
  const [sessionUserId, setSessionUserId] = useState(user?.id);
  if (sessionUserId !== user?.id) {
    setSessionUserId(user?.id);
    if (!user) {
      setRooms([]);
      setActiveRoomId(null);
      setFallbackRoom(null);
      setMessages([]);
      setRoomsLoaded(false);
    }
  }
  const [openedRoomId, setOpenedRoomId] = useState<string | null>(null);
  if (openedRoomId !== activeRoomId) {
    setOpenedRoomId(activeRoomId);
    setMessagesRoomId(null);
    if (jumpTargetState && jumpTargetState.roomId !== activeRoomId) setJumpTarget(null);
    setMessages([]);
    setReplyingTo(null);
    setEditingMessageId(null);
    setUnreadMarkerId(null);
    setHasMoreMessages(false);
    setNextCursor(null);
  }

  /** Optimistic messages not yet confirmed by the server, across all rooms. */
  const outboxRef = useRef<Map<string, Message>>(new Map());
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const typingEmitRef = useRef<{ roomId: string | null; at: number }>({ roomId: null, at: 0 });
  /** True once the server has registered this connection's handlers ('session:ready'). */
  const sessionReadyRef = useRef(false);

  const isActiveAndVisible = (roomId: string) =>
    activeRoomIdRef.current === roomId &&
    typeof document !== 'undefined' &&
    document.visibilityState === 'visible';

  // ---------------------------------------------------------------- Rooms
  const fetchRooms = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await api.get('/chats');
      if (res.data?.data) {
        const list: Room[] = await Promise.all(
          (res.data.data as Room[]).map(async (r) =>
            r.lastMessage ? { ...r, lastMessage: await hydrate(r.lastMessage) } : r
          )
        );
        setRooms(list);
        const socket = getSocket();
        list.forEach((r) => socket?.emit('room:join', r.id));
      }
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
    } finally {
      setRoomsLoaded(true);
    }
  }, [accessToken]);

  useEffect(() => {
    if (user && accessToken) {
      // Set up this device's encryption keys before anything needs decrypting
      e2ee.start(user.id).catch((err) => console.error('Encryption setup failed:', err));
      // fetchRooms only sets state after its request resolves; the rule can't see through async
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchRooms();
    }
    if (!user) {
      outboxRef.current.clear();
      e2ee.stop();
    }
  }, [user, accessToken, fetchRooms]);

  const markRoomRead = useCallback((roomId: string) => {
    getSocket()?.emit('message:read', { roomId });
    api.post(`/messages/room/${roomId}/read`).catch(() => {});
    setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, unreadCount: 0 } : r)));
  }, []);

  // ------------------------------------------------------------- Messages
  /** Append still-pending optimistic messages; anything the server already has is confirmed. */
  const withOutbox = (roomId: string, list: Message[]) => {
    const stored = new Set(list.map((m) => m.metadata?.clientId).filter(Boolean));
    const pending: Message[] = [];
    outboxRef.current.forEach((m, cid) => {
      if (m.roomId !== roomId) return;
      if (stored.has(cid)) outboxRef.current.delete(cid);
      else pending.push(m);
    });
    return pending.length ? [...list, ...pending] : list;
  };

  const fetchMessages = useCallback(
    async (roomId: string) => {
      try {
        const res = await api.get(`/messages/room/${roomId}?limit=30`);
        if (activeRoomIdRef.current !== roomId || !res.data?.data) return;
        const list = await hydrateAll(res.data.data.messages);
        if (activeRoomIdRef.current !== roomId) return;
        setMessages(withOutbox(roomId, list));
        setHasMoreMessages(res.data.data.hasMore);
        setNextCursor(res.data.data.nextCursor);

        // Remember where unread messages start, so the list can show a divider there
        const unread = roomsRef.current.find((r) => r.id === roomId)?.unreadCount ?? 0;
        const firstUnread = unread > 0 ? list[Math.max(0, list.length - unread)] : null;
        setUnreadMarkerId(
          firstUnread && firstUnread.senderId !== userRef.current?.id ? firstUnread.id : null
        );

        if (unread > 0 && document.visibilityState === 'visible') markRoomRead(roomId);
      } catch (err) {
        console.error('Failed to load messages for room:', err);
        // Still show anything queued for this room while offline
        if (activeRoomIdRef.current === roomId) setMessages(withOutbox(roomId, []));
        toast("Couldn't load messages. Check your connection.", { tone: 'error' });
      } finally {
        if (activeRoomIdRef.current === roomId) setMessagesRoomId(roomId);
      }
    },
    [markRoomRead, toast]
  );

  useEffect(() => {
    if (!activeRoomId) return;
    getSocket()?.emit('room:join', activeRoomId);
    // fetchMessages only sets state after its request resolves
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMessages(activeRoomId);
  }, [activeRoomId, fetchMessages]);

  const setActiveRoom = useCallback((room: Room | null) => {
    setFallbackRoom(room);
    setActiveRoomId(room?.id ?? null);
  }, []);

  const loadOlderMessages = useCallback(async () => {
    const roomId = activeRoomIdRef.current;
    const cursor = nextCursorRef.current;
    if (!roomId || !cursor || isLoadingOlder || messagesRoomId !== roomId) return;
    try {
      setIsLoadingOlder(true);
      const res = await api.get(`/messages/room/${roomId}?cursor=${cursor}&limit=30`);
      if (activeRoomIdRef.current !== roomId || !res.data?.data) return;
      const page = await hydrateAll(res.data.data.messages);
      if (activeRoomIdRef.current !== roomId) return;
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        const older = page.filter((m) => !known.has(m.id));
        return [...older, ...prev];
      });
      setHasMoreMessages(res.data.data.hasMore);
      setNextCursor(res.data.data.nextCursor);
    } catch (err) {
      console.error('Failed to load older messages:', err);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [isLoadingOlder, messagesRoomId]);

  // Mark the active room read when the user comes back to the tab
  useEffect(() => {
    const onVisible = () => {
      const roomId = activeRoomIdRef.current;
      if (document.visibilityState !== 'visible' || !roomId) return;
      const room = roomsRef.current.find((r) => r.id === roomId);
      if (room && room.unreadCount > 0) markRoomRead(roomId);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [markRoomRead]);

  // Unread count in the browser tab title (muted rooms excluded)
  useEffect(() => {
    const muted = readPreferences().mutedRooms;
    const total = rooms.reduce((sum, r) => (muted.includes(r.id) ? sum : sum + r.unreadCount), 0);
    document.title = total > 0 ? `(${total}) CEngine` : 'CEngine';
    setAppBadge(total);
  }, [rooms]);

  // ---------------------------------------------------------- Sending
  const updateOptimistic = (clientId: string, patch: Partial<Message>) => {
    const existing = outboxRef.current.get(clientId);
    if (existing) outboxRef.current.set(clientId, { ...existing, ...patch });
    // Only touch the still-unconfirmed copy; a confirmed message keeps its clientId as a key
    setMessages((prev) =>
      prev.map((m) => (m.clientId === clientId && m.sendStatus ? { ...m, ...patch } : m))
    );
  };

  const confirmSent = useCallback(async (raw: Message) => {
    const serverMsg = await hydrate(raw);
    const cid = serverMsg.metadata?.clientId as string | undefined;
    if (cid) outboxRef.current.delete(cid);
    if (activeRoomIdRef.current === serverMsg.roomId) {
      setMessages((prev) => mergeIncoming(prev, serverMsg));
    }
  }, []);

  const dispatchMessage = useCallback(
    (msg: Message) => {
      const socket = getSocket();
      // While offline (or still encrypting) the message stays queued as "sending"
      if (!msg.outgoing || !socket || !socket.connected || !sessionReadyRef.current) return;

      // Only the encrypted envelope leaves the device: no plaintext content or file metadata
      socket.timeout(SEND_TIMEOUT_MS).emit(
        'message:send',
        {
          roomId: msg.roomId,
          e2ee: msg.outgoing,
          replyToId: msg.replyToId || undefined,
          metadata: { clientId: msg.clientId },
        },
        (err: Error | null, res?: { success: boolean; data?: Message; error?: string }) => {
          if (err || !res?.success || !res.data) {
            updateOptimistic(msg.clientId!, {
              sendStatus: 'failed',
              sendError: res?.error || 'Not delivered',
            });
            return;
          }
          confirmSent(res.data);
        }
      );
    },
    [confirmSent]
  );

  /** Encrypt an outbox message for the room's current members, then send it. */
  const prepareAndDispatch = useCallback(
    async (clientId: string) => {
      const msg = outboxRef.current.get(clientId);
      if (!msg) return;
      if (msg.outgoing) return dispatchMessage(msg);

      const me = userRef.current;
      const room = roomsRef.current.find((r) => r.id === msg.roomId);
      if (!me || !room) return;
      const memberIds = room.members.map((m) => m.userId);
      const payload: MessagePayload = {
        text: msg.content || undefined,
        attachments: msg.attachments?.length
          ? msg.attachments.map(toEncryptedAttachment)
          : undefined,
        sticker: msg.sticker,
      };
      try {
        const { envelope, unreachable } = await e2ee.encryptForMembers(
          memberIds,
          payload,
          msg.roomId
        );
        const others = memberIds.filter((id) => id !== me.id);
        const names = (ids: string[]) =>
          ids
            .map((id) => room.members.find((m) => m.userId === id)?.user.displayName ?? 'Someone')
            .join(', ');
        if (others.length > 0 && unreachable.length === others.length) {
          updateOptimistic(clientId, {
            sendStatus: 'failed',
            sendError: `${names(unreachable)} hasn't set up encryption yet. They need to open CEngine once; then tap Retry.`,
          });
          return;
        }
        if (unreachable.length) {
          toast(`${names(unreachable)} can't read this message until they open CEngine.`);
        }
        updateOptimistic(clientId, { outgoing: envelope });
        dispatchMessage({ ...msg, outgoing: envelope });
      } catch (err) {
        console.error('Encryption failed:', err);
        updateOptimistic(clientId, {
          sendStatus: 'failed',
          sendError: "Couldn't encrypt this message. Encryption isn't set up on this device yet.",
        });
      }
    },
    [dispatchMessage, toast]
  );

  const sendMessage = useCallback(
    (content: string, attachments: EncryptedAttachment[] = [], sticker?: StickerRef) => {
      const roomId = activeRoomIdRef.current;
      const me = userRef.current;
      if (!roomId || !me) return;

      const reply = replyingToRef.current;
      const clientId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      const optimistic: Message = {
        id: clientId,
        clientId,
        roomId,
        senderId: me.id,
        content: content || null,
        messageType: attachments.length ? 'IMAGE' : 'TEXT',
        isEdited: false,
        isDeleted: false,
        replyToId: reply?.id ?? null,
        replyTo: reply
          ? {
              id: reply.id,
              content: reply.content,
              sender: { id: reply.sender.id, displayName: reply.sender.displayName },
            }
          : null,
        attachments: attachments.map((a, i) => ({ ...a, id: `${clientId}_${i}` })),
        sticker,
        e2eeState: 'ok',
        receipts: [],
        metadata: { clientId },
        createdAt: now,
        updatedAt: now,
        sender: { id: me.id, displayName: me.displayName, avatarUrl: me.avatarUrl },
        sendStatus: 'sending',
      };

      outboxRef.current.set(clientId, optimistic);
      setMessages((prev) => [...prev, optimistic]);
      setReplyingTo(null);
      prepareAndDispatch(clientId);
    },
    [prepareAndDispatch]
  );

  const retryMessage = useCallback(
    (clientId: string) => {
      const msg = outboxRef.current.get(clientId);
      if (!msg) return;
      updateOptimistic(clientId, { sendStatus: 'sending', sendError: undefined });
      if (!msg.outgoing) {
        // Encryption failed before (e.g. a member had no keys yet): refetch keys and retry
        e2ee.invalidateDevices();
        prepareAndDispatch(clientId);
      } else {
        dispatchMessage({ ...msg, sendStatus: 'sending' });
      }
    },
    [dispatchMessage, prepareAndDispatch]
  );

  const discardMessage = useCallback((clientId: string) => {
    outboxRef.current.delete(clientId);
    setMessages((prev) => prev.filter((m) => !(m.clientId === clientId && m.sendStatus)));
  }, []);

  // ------------------------------------------------------ Edit / delete
  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      const roomId = activeRoomIdRef.current;
      if (!roomId) return;
      const socket = getSocket();
      try {
        // Re-encrypt the edited text, keeping the message's attachments/sticker
        const original = messagesRef.current.find((m) => m.id === messageId);
        const room = roomsRef.current.find((r) => r.id === roomId);
        if (!original || !room) throw new Error("Couldn't find that message.");
        const { envelope } = await e2ee.encryptForMembers(
          room.members.map((m) => m.userId),
          {
            text: content,
            attachments: original.attachments?.length
              ? original.attachments.map(toEncryptedAttachment)
              : undefined,
            sticker: original.sticker,
          },
          roomId
        );
        if (socket?.connected) {
          const res = await socket
            .timeout(SEND_TIMEOUT_MS)
            .emitWithAck('message:edit', { messageId, roomId, e2ee: envelope });
          if (!res?.success) throw new Error(res?.error);
        } else {
          const res = await api.patch(`/messages/${messageId}`, { e2ee: envelope });
          if (res.data?.data) {
            const updated = await hydrate(res.data.data);
            setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
          }
        }
      } catch (err) {
        toast(getErrorMessage(err, (err as Error)?.message || "Couldn't save your edit."), {
          tone: 'error',
        });
        throw err;
      }
    },
    [toast]
  );

  const commitDelete = useCallback(
    async (messageId: string, roomId: string) => {
      const socket = getSocket();
      try {
        if (socket?.connected) {
          const res = await socket
            .timeout(SEND_TIMEOUT_MS)
            .emitWithAck('message:delete', { messageId, roomId });
          if (!res?.success) throw new Error(res?.error);
        } else {
          const res = await api.delete(`/messages/${messageId}`);
          if (res.data?.data) {
            setMessages((prev) => prev.map((m) => (m.id === messageId ? res.data.data : m)));
          }
        }
      } catch (err) {
        toast(getErrorMessage(err, (err as Error)?.message || "Couldn't delete the message."), {
          tone: 'error',
        });
      } finally {
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
      }
    },
    [toast]
  );

  /** Hides the message immediately and gives a short window to undo before deleting for everyone. */
  const deleteMessage = useCallback(
    (messageId: string) => {
      const roomId = activeRoomIdRef.current;
      if (!roomId) return;
      setHiddenIds((prev) => new Set(prev).add(messageId));
      let undone = false;
      const timer = setTimeout(() => {
        if (!undone) commitDelete(messageId, roomId);
      }, UNDO_DELETE_MS);
      toast('Message deleted', {
        duration: UNDO_DELETE_MS,
        action: {
          label: 'Undo',
          onClick: () => {
            undone = true;
            clearTimeout(timer);
            setHiddenIds((prev) => {
              const next = new Set(prev);
              next.delete(messageId);
              return next;
            });
          },
        },
      });
    },
    [commitDelete, toast]
  );

  // -------------------------------------------------------------- Typing
  const sendTypingStatus = useCallback((isTyping: boolean) => {
    const roomId = activeRoomIdRef.current;
    const me = userRef.current;
    const socket = getSocket();
    if (!roomId || !me || !socket?.connected) return;

    const last = typingEmitRef.current;
    if (isTyping) {
      // Throttle: one "typing" ping every few seconds, not one per keystroke
      if (last.roomId === roomId && Date.now() - last.at < TYPING_EMIT_INTERVAL_MS) return;
      typingEmitRef.current = { roomId, at: Date.now() };
      socket.emit('typing:start', { roomId, displayName: me.displayName });
    } else if (last.roomId) {
      socket.emit('typing:stop', { roomId: last.roomId });
      typingEmitRef.current = { roomId: null, at: 0 };
    }
  }, []);

  const setTyping = useCallback((roomId: string, userId: string, name: string | null) => {
    const key = `${roomId}:${userId}`;
    const timers = typingTimersRef.current;
    const apply = (value: string | null) =>
      setTypingMap((prev) => {
        const roomTyping = { ...(prev[roomId] || {}) };
        if (value) roomTyping[userId] = value;
        else if (roomTyping[userId]) delete roomTyping[userId];
        else return prev;
        return { ...prev, [roomId]: roomTyping };
      });

    clearTimeout(timers.get(key));
    timers.delete(key);
    if (name) {
      // Expire stale indicators in case the "stopped typing" event never arrives
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          apply(null);
        }, TYPING_EXPIRE_MS)
      );
    }
    apply(name);
  }, []);

  // ------------------------------------------------- Notifications
  const notify = useCallback((msg: Message) => {
    const prefs = readPreferences();
    if (
      !prefs.desktopNotifications ||
      prefs.mutedRooms.includes(msg.roomId) ||
      typeof Notification === 'undefined' ||
      Notification.permission !== 'granted' ||
      isActiveAndVisible(msg.roomId)
    ) {
      return;
    }
    const room = roomsRef.current.find((r) => r.id === msg.roomId);
    const title = room?.isGroup
      ? `${msg.sender.displayName} in ${room.name}`
      : msg.sender.displayName;
    const body = messagePreviewText(msg).slice(0, 140);
    const n = new Notification(title, { body, tag: msg.roomId });
    n.onclick = () => {
      window.focus();
      if (room) {
        setFallbackRoom(room);
        setActiveRoomId(room.id);
      }
      n.close();
    };
  }, []);

  // --------------------------------------------------- Socket events
  useEffect(() => {
    if (!accessToken || !user) return;
    const socket = getSocket(accessToken);
    let hasConnectedBefore = socket.connected;

    let readyFallback: ReturnType<typeof setTimeout> | undefined;

    const resync = (roomId: string) => {
      api
        .get(`/messages/room/${roomId}?limit=30`)
        .then(async (res) => {
          if (activeRoomIdRef.current !== roomId || !res.data?.data) return;
          const latest = await hydrateAll(res.data.data.messages);
          if (activeRoomIdRef.current !== roomId) return;
          const confirmed = withOutbox(roomId, latest);
          const known = new Set(messagesRef.current.filter((m) => !m.sendStatus).map((m) => m.id));
          if (latest.length && !latest.some((m) => known.has(m.id))) {
            // More was missed than one page: start over from the latest page
            setMessages(confirmed);
            setHasMoreMessages(res.data.data.hasMore);
            setNextCursor(res.data.data.nextCursor);
            return;
          }
          const pending = new Set(outboxRef.current.keys());
          setMessages((prev) =>
            latest
              .reduce(mergeIncoming, prev)
              .filter((m) => !m.sendStatus || pending.has(m.clientId!))
              .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          );
        })
        .catch(() => {});
    };

    // Runs once the server is ready to receive events on this connection
    const handleReady = () => {
      clearTimeout(readyFallback);
      if (sessionReadyRef.current) return;
      sessionReadyRef.current = true;
      if (hasConnectedBefore) {
        // Catch up on anything missed while disconnected
        fetchRooms();
        const roomId = activeRoomIdRef.current;
        if (roomId) resync(roomId);
      }
      hasConnectedBefore = true;
      outboxRef.current.forEach((msg) => {
        if (msg.sendStatus === 'sending') dispatchMessage(msg);
      });
    };

    const handleConnect = () => {
      setConnectionState('connected');
      // Fallback for servers that don't emit 'session:ready'
      readyFallback = setTimeout(handleReady, 1500);
    };

    const handleDisconnect = () => {
      sessionReadyRef.current = false;
      clearTimeout(readyFallback);
      setConnectionState('offline');
    };

    const handleConnectError = async (err: Error) => {
      setConnectionState('offline');
      if (/auth/i.test(err.message)) {
        // Access token expired: let the HTTP interceptor refresh it, then retry
        try {
          await api.get('/users/me');
          socket.connect();
        } catch {
          // Interceptor redirects to login if the refresh fails
        }
      }
    };

    const handleNewMessage = (newMsg: Message) => {
      const me = userRef.current;
      const isOwn = newMsg.senderId === me?.id;
      const visibleHere = isActiveAndVisible(newMsg.roomId);
      // A re-delivered message (e.g. after a retry) must not count as unread or notify twice
      const alreadyKnown =
        messagesRef.current.some((m) => m.id === newMsg.id) ||
        roomsRef.current.some((r) => r.lastMessage?.id === newMsg.id);

      if (activeRoomIdRef.current === newMsg.roomId) {
        setMessages((prev) => mergeIncoming(prev, newMsg));
        if (!isOwn && visibleHere) socket.emit('message:read', { roomId: newMsg.roomId });
      }
      if (isOwn) {
        const cid = newMsg.metadata?.clientId as string | undefined;
        if (cid) outboxRef.current.delete(cid);
      } else if (!alreadyKnown) {
        setTyping(newMsg.roomId, newMsg.senderId, null);
        notify(newMsg);
        // Tell the sender it reached this device (read receipts follow if it's on screen)
        if (!visibleHere) {
          socket.emit('message:delivered', { roomId: newMsg.roomId, messageIds: [newMsg.id] });
        }
      }

      if (!roomsRef.current.some((r) => r.id === newMsg.roomId)) {
        fetchRooms();
        return;
      }
      setRooms((prev) =>
        sortRooms(
          prev.map((r) =>
            r.id === newMsg.roomId
              ? {
                  ...r,
                  lastMessage: newMsg,
                  unreadCount: isOwn || visibleHere ? 0 : r.unreadCount + (alreadyKnown ? 0 : 1),
                  updatedAt: newMsg.createdAt,
                }
              : r
          )
        )
      );
    };

    /** Apply a receipt change to loaded messages and to the sidebar's last-message preview. */
    const applyReceipt = (
      roomId: string,
      userId: string,
      status: 'DELIVERED' | 'READ',
      messageIds?: Set<string>
    ) => {
      const at = new Date().toISOString();
      const update = (msg: Message): Message => {
        if (messageIds && !messageIds.has(msg.id)) return msg;
        const needs = msg.receipts?.some(
          (rc) =>
            rc.userId === userId &&
            (status === 'READ' ? rc.status !== 'READ' : rc.status === 'SENT')
        );
        if (!needs) return msg;
        return {
          ...msg,
          receipts: (msg.receipts || []).map((rc) =>
            rc.userId === userId &&
            (status === 'READ' ? rc.status !== 'READ' : rc.status === 'SENT')
              ? { ...rc, status, updatedAt: at }
              : rc
          ),
        };
      };
      if (activeRoomIdRef.current === roomId) setMessages((prev) => prev.map(update));
      setRooms((prev) =>
        prev.map((r) =>
          r.id === roomId && r.lastMessage ? { ...r, lastMessage: update(r.lastMessage) } : r
        )
      );
    };

    const handleMessageDelivered = (data: {
      roomId: string;
      userId: string;
      messageIds: string[];
    }) => applyReceipt(data.roomId, data.userId, 'DELIVERED', new Set(data.messageIds));

    // The server marks every message in the room read for that user
    const handleMessageRead = (data: { roomId: string; userId: string }) =>
      applyReceipt(data.roomId, data.userId, 'READ');

    const replaceEverywhere = (updated: Message) => {
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
      setRooms((prev) =>
        prev.map((r) =>
          r.lastMessage?.id === updated.id
            ? { ...r, lastMessage: { ...r.lastMessage, ...updated } }
            : r
        )
      );
    };

    const handleMessageUpdated = (updatedMsg: Message) => replaceEverywhere(updatedMsg);
    const handleMessageDeleted = (data: { messageId: string; deletedMessage: Message }) =>
      replaceEverywhere(data.deletedMessage);

    const handleTypingStatus = (data: {
      roomId: string;
      userId: string;
      displayName?: string;
      isTyping: boolean;
    }) => {
      setTyping(data.roomId, data.userId, data.isTyping ? data.displayName || 'Someone' : null);
    };

    const handlePresenceChange = (data: {
      userId: string;
      isOnline: boolean;
      lastSeenAt?: string;
    }) => {
      setOnlineMap((prev) => ({ ...prev, [data.userId]: data.isOnline }));
      if (data.lastSeenAt) {
        setLastSeenMap((prev) => ({ ...prev, [data.userId]: data.lastSeenAt! }));
      }
    };

    const handleRoomAdded = () => fetchRooms();
    const handleKeysChanged = (data: { userId: string }) => {
      e2ee.invalidateDevices(data.userId);
      // Messages that failed (e.g. from a device we didn't know yet) may decrypt now
      const failed = messagesRef.current.filter((m) => m.e2eeState === 'error');
      if (!failed.length) return;
      hydrateAll(failed).then((retried) => {
        const byId = new Map(retried.map((m) => [m.id, m]));
        setMessages((prev) => prev.map((m) => byId.get(m.id) ?? m));
      });
    };

    // Message events are applied in arrival order, after decryption (which is async)
    let chain: Promise<void> = Promise.resolve();
    const inOrder =
      <T,>(fn: (data: T) => void | Promise<void>) =>
      (data: T) => {
        chain = chain
          .then(() => fn(data))
          .catch((err) => console.error('Message event failed:', err));
      };
    const onNew = inOrder(async (m: Message) => handleNewMessage(await hydrate(m)));
    const onUpdated = inOrder(async (m: Message) => handleMessageUpdated(await hydrate(m)));
    const onDeleted = inOrder(async (d: { messageId: string; deletedMessage: Message }) =>
      handleMessageDeleted({ ...d, deletedMessage: await hydrate(d.deletedMessage) })
    );
    const onDelivered = inOrder(handleMessageDelivered);
    const onRead = inOrder(handleMessageRead);

    socket.on('connect', handleConnect);
    socket.on('session:ready', handleReady);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('message:new', onNew);
    socket.on('message:delivered', onDelivered);
    socket.on('message:read', onRead);
    socket.on('message:updated', onUpdated);
    socket.on('message:deleted', onDeleted);
    socket.on('keys:changed', handleKeysChanged);
    socket.on('typing:status', handleTypingStatus);
    socket.on('presence:change', handlePresenceChange);
    socket.on('room:added', handleRoomAdded);

    return () => {
      clearTimeout(readyFallback);
      socket.off('connect', handleConnect);
      socket.off('session:ready', handleReady);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('message:new', onNew);
      socket.off('message:delivered', onDelivered);
      socket.off('message:read', onRead);
      socket.off('message:updated', onUpdated);
      socket.off('message:deleted', onDeleted);
      socket.off('keys:changed', handleKeysChanged);
      socket.off('typing:status', handleTypingStatus);
      socket.off('presence:change', handlePresenceChange);
      socket.off('room:added', handleRoomAdded);
    };
  }, [accessToken, user, fetchRooms, dispatchMessage, notify, setTyping]);

  // ------------------------------------------------------ Rooms: create
  /** Tell the server to subscribe every member's sockets to a new room. */
  const announceRoom = (roomId: string) => getSocket()?.emit('room:sync', roomId);

  const createDirectChat = useCallback(
    async (targetUserId: string): Promise<Room> => {
      const res = await api.post('/chats/direct', { targetUserId });
      const room: Room = res.data.data;
      announceRoom(room.id);
      await fetchRooms();
      setActiveRoom(room);
      return room;
    },
    [fetchRooms, setActiveRoom]
  );

  const createGroup = useCallback(
    async (name: string, description?: string, memberIds?: string[]): Promise<Room> => {
      const res = await api.post('/chats/group', { name, description, memberIds });
      const room: Room = res.data.data;
      announceRoom(room.id);
      await fetchRooms();
      setActiveRoom(room);
      return room;
    },
    [fetchRooms, setActiveRoom]
  );

  const joinedRoom = useCallback(
    async (room: Room) => {
      announceRoom(room.id);
      await fetchRooms();
      setActiveRoom(room);
    },
    [fetchRooms, setActiveRoom]
  );

  const jumpToMessage = useCallback(
    (roomId: string, messageId: string) => {
      if (activeRoomIdRef.current !== roomId) {
        const room = roomsRef.current.find((r) => r.id === roomId);
        if (room) setActiveRoom(room);
      }
      setJumpTarget({ roomId, messageId });
    },
    [setActiveRoom]
  );

  const clearJumpTarget = useCallback(() => setJumpTarget(null), []);

  const visibleMessages = useMemo(
    () => (hiddenIds.size ? messages.filter((m) => !hiddenIds.has(m.id)) : messages),
    [messages, hiddenIds]
  );

  const typingByRoom = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const [roomId, users] of Object.entries(typingMap)) {
      const names = Object.values(users);
      if (names.length) out[roomId] = names;
    }
    return out;
  }, [typingMap]);

  return (
    <ChatContext.Provider
      value={{
        rooms,
        activeRoom,
        messages: visibleMessages,
        isLoadingRooms: !!user && !roomsLoaded,
        isLoadingMessages: !!activeRoomId && messagesRoomId !== activeRoomId,
        isLoadingOlder,
        hasMoreMessages,
        typingUsers: activeRoomId ? typingByRoom[activeRoomId] || [] : [],
        typingByRoom,
        replyingTo,
        editingMessageId,
        onlineMap,
        lastSeenMap,
        connectionState,
        unreadMarkerId,
        jumpTarget:
          jumpTargetState && jumpTargetState.roomId === activeRoomId
            ? jumpTargetState.messageId
            : null,
        setActiveRoom,
        loadOlderMessages,
        sendMessage,
        retryMessage,
        discardMessage,
        editMessage,
        deleteMessage,
        sendTypingStatus,
        setReplyingTo,
        setEditingMessageId,
        jumpToMessage,
        clearJumpTarget,
        createDirectChat,
        createGroup,
        joinedRoom,
        refreshRooms: fetchRooms,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatContextType {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
