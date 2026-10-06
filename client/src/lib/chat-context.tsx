'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './auth-context';
import { getSocket } from './socket';
import { api } from './api';

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
}

export interface MessageReceipt {
  id: string;
  userId: string;
  status: 'SENT' | 'DELIVERED' | 'READ';
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

interface ChatContextType {
  rooms: Room[];
  activeRoom: Room | null;
  messages: Message[];
  isLoadingRooms: boolean;
  isLoadingMessages: boolean;
  hasMoreMessages: boolean;
  typingUsers: string[]; // Display names of currently typing users in active room
  replyingTo: Message | null;
  onlineMap: Record<string, boolean>;
  setActiveRoom: (room: Room | null) => void;
  loadOlderMessages: () => Promise<void>;
  sendMessage: (content: string, attachments?: any[], replyToId?: string) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  sendTypingStatus: (isTyping: boolean) => void;
  setReplyingTo: (msg: Message | null) => void;
  createDirectChat: (targetUserId: string) => Promise<Room>;
  createGroup: (name: string, description?: string, memberIds?: string[]) => Promise<Room>;
  refreshRooms: () => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user, accessToken } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [typingMap, setTypingMap] = useState<Record<string, { [userId: string]: string }>>({});
  const [onlineMap, setOnlineMap] = useState<Record<string, boolean>>({});
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  const activeRoomRef = useRef<Room | null>(null);
  activeRoomRef.current = activeRoom;

  // 1. Fetch Rooms List
  const fetchRooms = useCallback(async () => {
    if (!accessToken) return;
    try {
      setIsLoadingRooms(true);
      const res = await api.get('/chats');
      if (res.data?.data) {
        setRooms(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
    } finally {
      setIsLoadingRooms(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (user && accessToken) {
      fetchRooms();
    }
  }, [user, accessToken, fetchRooms]);

  // 2. Fetch Messages for Active Room
  const fetchMessages = useCallback(async (roomId: string) => {
    try {
      setIsLoadingMessages(true);
      const res = await api.get(`/messages/room/${roomId}?limit=30`);
      if (res.data?.data) {
        setMessages(res.data.data.messages);
        setHasMoreMessages(res.data.data.hasMore);
        setNextCursor(res.data.data.nextCursor);

        // Mark room as read
        await api.post(`/messages/room/${roomId}/read`);

        // Decrement unread count locally
        setRooms((prev) =>
          prev.map((r) => (r.id === roomId ? { ...r, unreadCount: 0 } : r))
        );
      }
    } catch (err) {
      console.error('Failed to load messages for room:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (activeRoom) {
      fetchMessages(activeRoom.id);
      setReplyingTo(null);

      // Join room socket channel
      const socket = getSocket();
      socket?.emit('room:join', activeRoom.id);
      socket?.emit('message:read', { roomId: activeRoom.id });
    } else {
      setMessages([]);
    }
  }, [activeRoom, fetchMessages]);

  // 3. Load Older Messages (Pagination scrolling upwards)
  const loadOlderMessages = async () => {
    if (!activeRoom || !nextCursor || isLoadingMessages) return;
    try {
      const res = await api.get(
        `/messages/room/${activeRoom.id}?cursor=${nextCursor}&limit=30`
      );
      if (res.data?.data) {
        setMessages((prev) => [...res.data.data.messages, ...prev]);
        setHasMoreMessages(res.data.data.hasMore);
        setNextCursor(res.data.data.nextCursor);
      }
    } catch (err) {
      console.error('Failed to load older messages:', err);
    }
  };

  // 4. Socket.IO Real-Time Event Handlers
  useEffect(() => {
    if (!accessToken || !user) return;
    const socket = getSocket(accessToken);

    const handleNewMessage = (newMsg: Message) => {
      // If message belongs to active room, append to messages
      if (activeRoomRef.current?.id === newMsg.roomId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });

        // If from another user, mark as read
        if (newMsg.senderId !== user.id) {
          socket.emit('message:read', { roomId: newMsg.roomId });
        }
      }

      // Update room list preview & unread count
      setRooms((prev) =>
        prev.map((r) => {
          if (r.id === newMsg.roomId) {
            const isCurrentActive = activeRoomRef.current?.id === newMsg.roomId;
            const newUnread =
              isCurrentActive || newMsg.senderId === user.id
                ? 0
                : r.unreadCount + 1;
            return {
              ...r,
              lastMessage: newMsg,
              unreadCount: newUnread,
              updatedAt: newMsg.createdAt,
            };
          }
          return r;
        }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      );
    };

    const handleMessageDelivered = (data: { roomId: string; userId: string; messageIds: string[] }) => {
      if (activeRoomRef.current?.id === data.roomId) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (data.messageIds.includes(msg.id)) {
              const updatedReceipts = (msg.receipts || []).map((rc) =>
                rc.userId === data.userId ? { ...rc, status: 'DELIVERED' as const } : rc
              );
              return { ...msg, receipts: updatedReceipts };
            }
            return msg;
          })
        );
      }
    };

    const handleMessageRead = (data: { roomId: string; userId: string }) => {
      if (activeRoomRef.current?.id === data.roomId) {
        setMessages((prev) =>
          prev.map((msg) => {
            const updatedReceipts = (msg.receipts || []).map((rc) =>
              rc.userId === data.userId ? { ...rc, status: 'READ' as const } : rc
            );
            return { ...msg, receipts: updatedReceipts };
          })
        );
      }
    };

    const handleMessageUpdated = (updatedMsg: Message) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m))
      );
    };

    const handleMessageDeleted = (data: { messageId: string; deletedMessage: Message }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === data.messageId ? data.deletedMessage : m))
      );
    };

    const handleTypingStatus = (data: {
      roomId: string;
      userId: string;
      displayName?: string;
      isTyping: boolean;
    }) => {
      setTypingMap((prev) => {
        const roomTyping = { ...(prev[data.roomId] || {}) };
        if (data.isTyping && data.displayName) {
          roomTyping[data.userId] = data.displayName;
        } else {
          delete roomTyping[data.userId];
        }
        return { ...prev, [data.roomId]: roomTyping };
      });
    };

    const handlePresenceChange = (data: { userId: string; isOnline: boolean }) => {
      setOnlineMap((prev) => ({ ...prev, [data.userId]: data.isOnline }));
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:delivered', handleMessageDelivered);
    socket.on('message:read', handleMessageRead);
    socket.on('message:updated', handleMessageUpdated);
    socket.on('message:deleted', handleMessageDeleted);
    socket.on('typing:status', handleTypingStatus);
    socket.on('presence:change', handlePresenceChange);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:delivered', handleMessageDelivered);
      socket.off('message:read', handleMessageRead);
      socket.off('message:updated', handleMessageUpdated);
      socket.off('message:deleted', handleMessageDeleted);
      socket.off('typing:status', handleTypingStatus);
      socket.off('presence:change', handlePresenceChange);
    };
  }, [accessToken, user]);

  // 5. Send Message Action
  const sendMessage = async (
    content: string,
    attachments?: any[],
    replyToId?: string
  ) => {
    if (!activeRoom || !user) return;
    const socket = getSocket();

    const payload = {
      roomId: activeRoom.id,
      content,
      attachments,
      replyToId: replyToId || replyingTo?.id,
    };

    // Emit via socket with ack callback
    if (socket && socket.connected) {
      socket.emit('message:send', payload, (res: { success: boolean; data?: Message; error?: string }) => {
        if (!res.success) {
          console.error('Socket send error:', res.error);
        }
      });
    } else {
      // Fallback to HTTP POST
      const res = await api.post(`/messages/room/${activeRoom.id}`, payload);
      if (res.data?.data) {
        setMessages((prev) => [...prev, res.data.data]);
      }
    }

    setReplyingTo(null);
  };

  // 6. Edit Message Action
  const editMessage = async (messageId: string, content: string) => {
    if (!activeRoom) return;
    const socket = getSocket();

    if (socket && socket.connected) {
      socket.emit('message:edit', {
        messageId,
        roomId: activeRoom.id,
        content,
      });
    } else {
      const res = await api.patch(`/messages/${messageId}`, { content });
      if (res.data?.data) {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? res.data.data : m)));
      }
    }
  };

  // 7. Delete Message Action
  const deleteMessage = async (messageId: string) => {
    if (!activeRoom) return;
    const socket = getSocket();

    if (socket && socket.connected) {
      socket.emit('message:delete', {
        messageId,
        roomId: activeRoom.id,
      });
    } else {
      const res = await api.delete(`/messages/${messageId}`);
      if (res.data?.data) {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? res.data.data : m)));
      }
    }
  };

  // 8. Typing indicator action
  const sendTypingStatus = (isTyping: boolean) => {
    if (!activeRoom || !user) return;
    const socket = getSocket();
    if (!socket || !socket.connected) return;

    if (isTyping) {
      socket.emit('typing:start', {
        roomId: activeRoom.id,
        displayName: user.displayName,
      });
    } else {
      socket.emit('typing:stop', { roomId: activeRoom.id });
    }
  };

  // 9. Create Direct Chat
  const createDirectChat = async (targetUserId: string): Promise<Room> => {
    const res = await api.post('/chats/direct', { targetUserId });
    const room = res.data.data;
    await fetchRooms();
    setActiveRoom(room);
    return room;
  };

  // 10. Create Group Chat
  const createGroup = async (
    name: string,
    description?: string,
    memberIds?: string[]
  ): Promise<Room> => {
    const res = await api.post('/chats/group', {
      name,
      description,
      memberIds,
    });
    const room = res.data.data;
    await fetchRooms();
    setActiveRoom(room);
    return room;
  };

  // Active room typing user names
  const activeRoomTyping = activeRoom ? Object.values(typingMap[activeRoom.id] || {}) : [];

  return (
    <ChatContext.Provider
      value={{
        rooms,
        activeRoom,
        messages,
        isLoadingRooms,
        isLoadingMessages,
        hasMoreMessages,
        typingUsers: activeRoomTyping,
        replyingTo,
        onlineMap,
        setActiveRoom,
        loadOlderMessages,
        sendMessage,
        editMessage,
        deleteMessage,
        sendTypingStatus,
        setReplyingTo,
        createDirectChat,
        createGroup,
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
