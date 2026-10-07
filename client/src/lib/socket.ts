import { io, Socket } from 'socket.io-client';

export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

let socket: Socket | null = null;

function readToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('cengine_access_token') : null;
}

export function getSocket(token?: string): Socket {
  if (!socket && (token || readToken())) {
    socket = io(SOCKET_URL, {
      // Evaluated on every (re)connect so a refreshed access token is picked up
      auth: (cb) => cb({ token: readToken() || token }),
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
  }

  return socket!;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
