// TOTP (RFC 6238) para el 2FA del panel admin — implementado con el módulo
// crypto nativo de Node en vez de una librería externa, siguiendo el mismo
// criterio del resto de este proyecto (usar lo que ya trae la plataforma
// antes de sumar una dependencia) para un algoritmo tan chico y bien
// especificado que no vale la pena empaquetarlo aparte.
const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;

function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    output += BASE32_ALPHABET[parseInt(bits.substring(i, i + 5), 2)];
  }
  const remainder = bits.length % 5;
  if (remainder) {
    const lastChunk = bits.substring(bits.length - remainder).padEnd(5, '0');
    output += BASE32_ALPHABET[parseInt(lastChunk, 2)];
  }
  return output;
}

function base32Decode(base32) {
  const clean = String(base32 || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

// Secreto de 20 bytes (160 bits) codificado en base32 — el tamaño estándar
// que esperan Google Authenticator, Authy, etc.
function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

// HOTP (RFC 4226): un código de 6 dígitos a partir del secreto y un
// contador. TOTP (RFC 6238) es HOTP con el contador derivado del reloj.
function hotp(secretBuffer, counter) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuffer).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

function totpAt(secretBase32, timeMs) {
  const counter = Math.floor(timeMs / 1000 / STEP_SECONDS);
  return hotp(base32Decode(secretBase32), counter);
}

// Compara el código contra el paso actual y los `window` pasos anterior/
// siguiente (por defecto 1 = ±30s), para tolerar reloj desincronizado entre
// el teléfono del admin y este servidor sin abrir la ventana de más.
function verifyToken(secretBase32, token, window) {
  const w = window === undefined ? 1 : window;
  const clean = String(token || '').trim().replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return false;

  const now = Date.now();
  for (let step = -w; step <= w; step++) {
    const candidate = totpAt(secretBase32, now + step * STEP_SECONDS * 1000);
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(clean))) return true;
  }
  return false;
}

// URI estándar que cualquier app autenticadora reconoce al escanear el QR.
function buildOtpauthUri(secretBase32, accountLabel, issuer) {
  const label = encodeURIComponent(issuer + ':' + accountLabel);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

module.exports = { generateSecret, verifyToken, buildOtpauthUri, totpAt, base32Encode, base32Decode };
