import type { Role } from '../generated/prisma/enums.js';

declare global {
  namespace Express {
    interface Request {
      // Set by requestId middleware; echoed in logs and error bodies for support tickets.
      id: string;
      // Set by the auth middleware once the access token is verified.
      user?: { id: string; email: string; role: Role };
    }
  }
}

export {};
