// TECH-SPEC §4.1, §4.6 (riga 327)
// Serializzazione JSON canonica (chiavi ordinate ricorsivamente) e SHA-256 puro (FIPS 180-4)
// senza alcuna dipendenza da moduli I/O nativi di Node, identico in browser e server.

import type { GameState } from './types.js';

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const SHA256_H0: readonly number[] = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
];

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/**
 * Codifica una stringa UTF-16 JavaScript in un array di byte UTF-8 puro.
 */
function utf8Encode(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        i++;
      }
    }
    if (code <= 0x7f) {
      bytes.push(code);
    } else if (code <= 0x7ff) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code <= 0xffff) {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

/**
 * Calcola l'hash SHA-256 esadecimale minuscolo di una stringa UTF-8 in modo puro.
 */
export function sha256Hex(input: string): string {
  const bytes = utf8Encode(input);
  const bitLen = bytes.length * 8;

  // Padding: byte 0x80 seguito da zeri fino a lunghezza congrua a 56 mod 64, poi lunghezza a 64 bit big-endian
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) {
    bytes.push(0x00);
  }

  const highBits = Math.floor(bitLen / 4294967296) >>> 0;
  const lowBits = bitLen >>> 0;
  bytes.push(
    (highBits >>> 24) & 0xff,
    (highBits >>> 16) & 0xff,
    (highBits >>> 8) & 0xff,
    highBits & 0xff,
    (lowBits >>> 24) & 0xff,
    (lowBits >>> 16) & 0xff,
    (lowBits >>> 8) & 0xff,
    lowBits & 0xff,
  );

  let h0 = SHA256_H0[0]!;
  let h1 = SHA256_H0[1]!;
  let h2 = SHA256_H0[2]!;
  let h3 = SHA256_H0[3]!;
  let h4 = SHA256_H0[4]!;
  let h5 = SHA256_H0[5]!;
  let h6 = SHA256_H0[6]!;
  let h7 = SHA256_H0[7]!;

  const w = new Array<number>(64).fill(0);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const idx = offset + i * 4;
      w[i] =
        ((bytes[idx]! << 24) |
          (bytes[idx + 1]! << 16) |
          (bytes[idx + 2]! << 8) |
          bytes[idx + 3]!) >>>
        0;
    }

    for (let i = 16; i < 64; i++) {
      const w15 = w[i - 15]!;
      const s0 = (rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const w2 = w[i - 2]!;
      const s1 = (rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = (((w[i - 16]! + s0) | 0) + ((w[i - 7]! + s1) | 0)) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const s1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + s1 + ch + SHA256_K[i]! + w[i]!) | 0;
      const s0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => word.toString(16).padStart(8, '0'))
    .join('');
}

/**
 * Serializza un valore JSON-safe in una stringa JSON canonica deterministica,
 * ordinando ricorsivamente le chiavi di ogni oggetto in ordine lessicografico.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const serializedItems = value.map((item) =>
      canonicalizeJson(item === undefined ? null : item),
    );
    return `[${serializedItems.join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const sortedKeys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();

  const pairs = sortedKeys.map(
    (key) => `${JSON.stringify(key)}:${canonicalizeJson(record[key])}`,
  );
  return `{${pairs.join(',')}}`;
}

/**
 * Calcola l'hash deterministico SHA-256 esadecimale di un GameState canonico (TECH-SPEC §4.6).
 */
export function stateHash(state: GameState): string {
  return sha256Hex(canonicalizeJson(state));
}
