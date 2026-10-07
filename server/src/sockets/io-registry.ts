import type { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

/** Lets HTTP controllers emit socket events (e.g. key changes) without importing the server. */
export function setIO(server: SocketIOServer) {
  io = server;
}

export function getIO(): SocketIOServer | null {
  return io;
}
