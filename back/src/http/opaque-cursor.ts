import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Cursor opaco sin estado para paginación por desplazamiento.
 *
 * El cursor no revela la posición interna: el desplazamiento se cifra con
 * AES-256-GCM (iv aleatorio + texto cifrado + etiqueta de autenticación)
 * usando una clave derivada del secreto de la aplicación. Una cadena
 * inválida, manipulada o firmada con otra clave no se puede descifrar y el
 * endpoint la rechaza con el error canónico 400 de entrada inválida.
 */

const CURSOR_KEY_PREFIX = "phoenix-training:opaque-cursor:v1:";
const CURSOR_IV_BYTES = 12;
const CURSOR_TAG_BYTES = 16;

let processFallbackKey: Buffer | null = null;

/**
 * Clave de 32 bytes para cifrar los cursores. Con un secreto configurado se
 * deriva de forma determinista (los cursores sobreviven a reinicios); sin
 * secreto (p. ej. en pruebas) se usa una clave aleatoria por proceso, válida
 * mientras la aplicación siga viva.
 */
export function opaqueCursorKey(secret: string | undefined): Buffer {
  if (secret && secret.length > 0) {
    return createHash("sha256").update(CURSOR_KEY_PREFIX + secret).digest();
  }
  if (processFallbackKey === null) {
    processFallbackKey = randomBytes(32);
  }
  return processFallbackKey;
}

export function encodeOpaqueCursor(offset: number, key: Buffer): string {
  const iv = randomBytes(CURSOR_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const payload = JSON.stringify({ offset });
  const ciphertext = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, tag]).toString("base64url");
}

/**
 * Recupera el desplazamiento de un cursor. Devuelve `0` cuando no hay cursor
 * (primera página) y `null` cuando el cursor es inválido, está manipulado o
 * no se puede descifrar, para que el límite HTTP responda con 400.
 */
export function decodeOpaqueCursor(cursor: string | undefined, key: Buffer): number | null {
  if (cursor === undefined) {
    return 0;
  }
  try {
    const raw = Buffer.from(cursor, "base64url");
    if (raw.length < CURSOR_IV_BYTES + CURSOR_TAG_BYTES) {
      return null;
    }
    const iv = raw.subarray(0, CURSOR_IV_BYTES);
    const tag = raw.subarray(raw.length - CURSOR_TAG_BYTES);
    const ciphertext = raw.subarray(CURSOR_IV_BYTES, raw.length - CURSOR_TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const parsed = JSON.parse(decrypted.toString("utf8")) as { offset?: unknown };
    if (
      typeof parsed.offset === "number" &&
      Number.isInteger(parsed.offset) &&
      parsed.offset >= 0
    ) {
      return parsed.offset;
    }
    return null;
  } catch {
    return null;
  }
}
