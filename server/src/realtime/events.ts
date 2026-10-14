import { redis } from '../lib/redis.js';

export const EVENTS_CHANNEL = 'finagent:events';

export type RealtimeEvent =
  'file:ingest:progress' | 'analysis:progress' | 'analysis:completed' | 'analysis:failed';

export type EventEnvelope = { event: RealtimeEvent; ownerId: string; payload: Record<string, unknown> };

/** Rooms: each user has their own; managers and admins also join `staff`, since they see every file. */
export const userRoom = (userId: string) => `user:${userId}`;
export const STAFF_ROOM = 'staff';

/**
 * Publishes through Redis instead of emitting directly, so the worker process (which has no
 * sockets) can drive the UI, and every API replica forwards to the clients connected to it.
 */
export async function publishEvent(event: RealtimeEvent, ownerId: string, payload: Record<string, unknown>) {
  await redis.publish(EVENTS_CHANNEL, JSON.stringify({ event, ownerId, payload } satisfies EventEnvelope));
}
