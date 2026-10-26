// TECH-SPEC §6.2, §6.4, §6.5 — Gestione sessioni ospite con token opaco ad alta entropia
// e persistenza del solo hash SHA-256 in `players.token_hash`.

import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { GameRepository, PlayerRecord } from '../db/repository.js';

const GUEST_TITLES_IT = [
  'Stratega',
  'Cartografo',
  'Condottiero',
  'Architetto',
  'Cronista',
  'Comandante',
] as const;

/**
 * Calcola l'hash SHA-256 esadecimale (64 caratteri minuscoli) di un token ospite opaco.
 * Il token in chiaro non viene mai salvato nel database.
 */
export function hashGuestToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

/**
 * Genera un token opaco crittograficamente sicuro ad alta entropia (default 32 byte = 256 bit in base64url).
 */
export function generateOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

/**
 * Genera un nickname ospite leggibile in italiano conforme ai limiti del protocollo (<= 40 caratteri).
 */
export function generateGuestNickname(): string {
  const title =
    GUEST_TITLES_IT[randomInt(0, GUEST_TITLES_IT.length)] ?? 'Stratega';
  const suffix = String(randomInt(1000, 10000));
  return `${title} #${suffix}`;
}

export interface GuestSessionResult {
  readonly player: PlayerRecord;
  readonly token: string;
  readonly isNew: boolean;
}

export interface AuthenticateGuestOptions {
  readonly token?: string | undefined;
  readonly preferredNickname?: string | undefined;
  readonly now?: number | undefined;
}

/**
 * Risolve una sessione ospite esistente a partire dal token in chiaro (confrontando solo `SHA-256(token)`)
 * oppure crea un nuovo record in `players` salvando esclusivamente `token_hash`.
 */
export function authenticateOrCreateGuest(
  repository: GameRepository,
  options: AuthenticateGuestOptions = {},
): GuestSessionResult {
  const candidateToken = options.token?.trim();
  if (candidateToken !== undefined && candidateToken.length > 0) {
    const tokenHash = hashGuestToken(candidateToken);
    const existing = repository.getPlayerByTokenHash(tokenHash);
    if (existing !== null) {
      return {
        player: existing,
        token: candidateToken,
        isNew: false,
      };
    }
  }

  const freshToken = generateOpaqueToken(32);
  const tokenHash = hashGuestToken(freshToken);
  const playerId = `plr_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const rawNick = options.preferredNickname?.trim();
  const nickname =
    rawNick !== undefined && rawNick.length >= 1 && rawNick.length <= 40
      ? rawNick
      : generateGuestNickname();

  const player = repository.createPlayer({
    id: playerId,
    tokenHash,
    nickname,
    ...(options.now !== undefined ? { createdAt: options.now } : {}),
  });

  return {
    player,
    token: freshToken,
    isNew: true,
  };
}

/**
 * Risolve un giocatore a partire da un token opaco o da un header HTTP `Authorization: Bearer <token>`.
 * Restituisce `null` se il token è assente o non corrisponde ad alcun `token_hash` registrato.
 */
export function resolvePlayerFromToken(
  repository: GameRepository,
  rawTokenOrHeader: string | undefined | null,
): PlayerRecord | null {
  if (typeof rawTokenOrHeader !== 'string') {
    return null;
  }

  let token = rawTokenOrHeader.trim();
  if (token.toLowerCase().startsWith('bearer ')) {
    token = token.slice(7).trim();
  }
  if (token.length === 0) {
    return null;
  }

  const tokenHash = hashGuestToken(token);
  return repository.getPlayerByTokenHash(tokenHash);
}
