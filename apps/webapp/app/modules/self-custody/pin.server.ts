/**
 * Self-Service Custody PIN
 *
 * The shared workspace PIN that volunteers enter before they can take or
 * return an item by QR scan. Only its scrypt hash is stored, on
 * `Organization.selfCustodyPinHash`, in the form `scrypt$<saltHex>$<hashHex>`.
 *
 * @see {@link file://./../../routes/_layout+/settings.self-service.tsx}
 * @see {@link file://./../../routes/qr+/_public+/$qrId_.self-custody.tsx}
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const PREFIX = "scrypt";

export { PinSchema } from "./schemas";

/**
 * Hashes a PIN with a fresh random salt.
 *
 * @param pin - The plain PIN, already validated with {@link PinSchema}
 * @returns The value to store, `scrypt$<saltHex>$<hashHex>`
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scryptAsync(pin, salt, KEY_LENGTH);
  return `${PREFIX}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/**
 * Checks a PIN against a stored hash in constant time.
 *
 * @param pin - The PIN the volunteer typed
 * @param stored - `Organization.selfCustodyPinHash`, possibly null
 * @returns True only for a well-formed hash that matches the PIN
 */
export async function verifyPin(
  pin: string,
  stored: string | null
): Promise<boolean> {
  if (!stored) return false;

  const [prefix, saltHex, hashHex] = stored.split("$");
  const isHex = (value: string | undefined) =>
    !!value && value.length % 2 === 0 && /^[0-9a-f]+$/.test(value);
  if (prefix !== PREFIX || !isHex(saltHex) || !isHex(hashHex)) return false;

  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== KEY_LENGTH) return false;

  const actual = await scryptAsync(
    pin,
    Buffer.from(saltHex, "hex"),
    KEY_LENGTH
  );
  return timingSafeEqual(actual, expected);
}
