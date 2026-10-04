import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 2 ** 14;
const SCRYPT_R = 8;
const SCRYPT_P = 5;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_SALT_LENGTH = 16;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const MAX_PASSWORD_BYTES = 512;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        maxmem: SCRYPT_MAX_MEMORY,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new Error('Password exceeds the supported byte length.');
  }

  const salt = randomBytes(SCRYPT_SALT_LENGTH);
  const key = await deriveKey(password, salt);
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) return false;

  const parts = encodedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  if (
    Number(parts[1]) !== SCRYPT_N ||
    Number(parts[2]) !== SCRYPT_R ||
    Number(parts[3]) !== SCRYPT_P ||
    !/^[A-Za-z0-9_-]+$/.test(parts[4]) ||
    !/^[A-Za-z0-9_-]+$/.test(parts[5])
  ) {
    return false;
  }

  const salt = Buffer.from(parts[4], 'base64url');
  const expectedKey = Buffer.from(parts[5], 'base64url');
  if (
    salt.length !== SCRYPT_SALT_LENGTH ||
    salt.toString('base64url') !== parts[4] ||
    expectedKey.length !== SCRYPT_KEY_LENGTH ||
    expectedKey.toString('base64url') !== parts[5]
  ) {
    return false;
  }

  try {
    const actualKey = await deriveKey(password, salt);
    return timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}
