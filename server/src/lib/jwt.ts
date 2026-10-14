import { jwtVerify, SignJWT } from 'jose';
import { env } from '../config/env.js';
import type { Role } from '../generated/prisma/enums.js';

const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
// Issuer and audience pin tokens to this API, so a token minted for another service is rejected.
const ISSUER = 'finagent';
const AUDIENCE = 'finagent-api';

export async function signAccessToken(user: { id: string; role: Role }) {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(env.ACCESS_TOKEN_TTL)
    .sign(secret);
}

/** Returns the user id, or throws if the signature, expiry, issuer or audience is wrong. */
export async function verifyAccessToken(token: string): Promise<string> {
  // The algorithm allowlist blocks `alg: none` and key-confusion attacks.
  const { payload } = await jwtVerify(token, secret, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ['HS256'],
  });
  if (!payload.sub) throw new Error('Token has no subject');
  return payload.sub;
}
