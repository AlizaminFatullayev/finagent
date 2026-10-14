import { seal, unseal } from '../../lib/crypto.js';
import type { Tx } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';
import type { TokenMap } from './masker.js';

/** Stores the token map encrypted at rest (AES-256-GCM); the plaintext map never touches the database. */
export async function saveVault(fileId: string, tokens: TokenMap, db: Tx | typeof prisma = prisma) {
  const encryptedMap = seal(JSON.stringify(tokens));
  await db.maskingVault.upsert({
    where: { fileId },
    create: { fileId, encryptedMap },
    update: { encryptedMap },
  });
}

export async function loadVault(fileId: string): Promise<TokenMap> {
  const vault = await prisma.maskingVault.findUnique({ where: { fileId } });
  return vault ? (JSON.parse(unseal(vault.encryptedMap)) as TokenMap) : {};
}
