import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { publishEvent } from '../src/realtime/events.js';
import { attachSocket } from '../src/realtime/socket.js';
import { userWithToken } from './factories.js';
import { resetState } from './helpers.js';

const app = createApp();
let http: Server;
let realtime: Awaited<ReturnType<typeof attachSocket>>;
let url: string;
const sockets: Socket[] = [];

function client(token?: string) {
  const socket = connect(url, {
    auth: token ? { token } : {},
    transports: ['websocket'],
    reconnection: false,
  });
  sockets.push(socket);
  return socket;
}

const connected = (s: Socket) =>
  new Promise<void>((resolve, reject) => {
    s.on('connect', () => resolve());
    s.on('connect_error', reject);
  });

describe('Socket.IO realtime', () => {
  beforeAll(async () => {
    await resetState();
    http = createServer(app);
    realtime = await attachSocket(http);
    await new Promise<void>((resolve) => http.listen(0, resolve));
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await realtime.close();
  });

  it('rejects connections without a valid token', async () => {
    await expect(connected(client())).rejects.toThrow('unauthorized');
    await expect(connected(client('not-a-jwt'))).rejects.toThrow('unauthorized');
  });

  it('delivers events to the owner and staff only, via Redis pub/sub', async () => {
    const owner = await userWithToken(app, 'ANALYST');
    const stranger = await userWithToken(app, 'ANALYST');
    const manager = await userWithToken(app, 'MANAGER');
    const [ownerSocket, strangerSocket, managerSocket] = [owner, stranger, manager].map((u) =>
      client(u.accessToken),
    );
    await Promise.all([ownerSocket, strangerSocket, managerSocket].map((s) => connected(s!)));

    let strangerGotIt = false;
    strangerSocket!.on('analysis:progress', () => (strangerGotIt = true));
    const ownerEvent = new Promise((resolve) => ownerSocket!.once('analysis:progress', resolve));
    const managerEvent = new Promise((resolve) => managerSocket!.once('analysis:progress', resolve));

    // Published exactly as the worker process would.
    await publishEvent('analysis:progress', owner.user.id, {
      analysisId: 'x',
      stage: 'analyzing',
      percent: 40,
    });

    expect(await ownerEvent).toEqual({ analysisId: 'x', stage: 'analyzing', percent: 40 });
    expect(await managerEvent).toMatchObject({ stage: 'analyzing' });
    await new Promise((r) => setTimeout(r, 200));
    expect(strangerGotIt).toBe(false);
  });
});
