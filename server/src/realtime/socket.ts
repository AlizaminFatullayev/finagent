import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { createRedis } from '../lib/redis.js';
import { userFromToken } from '../middleware/auth.js';
import { canSeeAllFiles } from '../middleware/rbac.js';
import { EVENTS_CHANNEL, STAFF_ROOM, userRoom, type EventEnvelope } from './events.js';

/** Attaches Socket.IO to the HTTP server and forwards Redis pub/sub events to the right rooms. */
export async function attachSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, { cors: { origin: env.CORS_ORIGINS, credentials: true } });

  // The handshake carries the same access token as REST calls; no token, no connection.
  io.use(async (socket, next) => {
    try {
      const user = await userFromToken(socket.handshake.auth?.token as string | undefined);
      socket.data.user = user;
      await socket.join(userRoom(user.id));
      if (canSeeAllFiles(user.role)) await socket.join(STAFF_ROOM);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  // A subscribed Redis connection cannot run other commands, so it gets its own.
  const subscriber = createRedis();
  await subscriber.subscribe(EVENTS_CHANNEL);
  subscriber.on('message', (_channel, raw: string) => {
    try {
      const { event, ownerId, payload } = JSON.parse(raw) as EventEnvelope;
      // Owner plus staff only: other analysts never receive events about files they cannot see.
      io.to([userRoom(ownerId), STAFF_ROOM]).emit(event, payload);
    } catch (err) {
      logger.warn({ err }, 'dropped malformed realtime event');
    }
  });

  return {
    io,
    async close() {
      await io.close();
      await subscriber.quit();
    },
  };
}
