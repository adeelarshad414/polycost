import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// scrypt is deliberately expensive (~50 ms here). The sync variant blocked the
// event loop for every request in flight during a login, so a burst of logins
// stalled the whole API. The async variant runs on the libuv thread pool.
function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derived) =>
      error ? reject(error) : resolve(derived),
    );
  });
}

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH_BYTES = 64;
const HASH_PREFIX = 'scrypt:v1';

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, KEY_LENGTH_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  return [
    HASH_PREFIX,
    SCRYPT_N.toString(),
    SCRYPT_R.toString(),
    SCRYPT_P.toString(),
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join(':');
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');

  if (parts.length !== 7 || `${parts[0]}:${parts[1]}` !== HASH_PREFIX) {
    return false;
  }

  const n = Number(parts[2]);
  const r = Number(parts[3]);
  const p = Number(parts[4]);
  const salt = Buffer.from(parts[5], 'base64url');
  const expected = Buffer.from(parts[6], 'base64url');

  if (
    !Number.isInteger(n) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    salt.length === 0 ||
    expected.length === 0
  ) {
    return false;
  }

  const derived = await scryptAsync(password, salt, expected.length, { N: n, r, p });

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/**
 * A real hash of a random password, computed once. Login verifies against it
 * when the account does not exist or cannot sign in, so those paths cost the
 * same scrypt work as a wrong password and response time does not reveal which
 * emails are registered.
 */
let dummyHash: Promise<string> | undefined;

export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(32).toString('base64url'));
  await verifyPassword(password, await dummyHash);
}
