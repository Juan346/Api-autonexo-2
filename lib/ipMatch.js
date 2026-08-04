// Matching de IPv4 simple (IP exacta o CIDR, ej. "203.0.113.0/24") por
// aritmética de bits. IPv6 fuera de alcance a propósito: los servidores que
// consumen esta API (apps Flask de cada taller) son IPv4.

function ipToInt(ip) {
  const parts = (ip || '').split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
}

function normalizeIp(ip) {
  // Node antepone "::ffff:" a IPs IPv4 cuando el socket es dual-stack.
  return (ip || '').replace('::ffff:', '');
}

function ipMatchesRule(ip, rule) {
  const cleanIp = normalizeIp(ip);
  const [rangeIp, prefixStr] = (rule || '').split('/');
  const ipInt = ipToInt(cleanIp);
  const rangeInt = ipToInt(rangeIp);
  if (ipInt === null || rangeInt === null) return false;

  const prefix = prefixStr !== undefined ? parseInt(prefixStr, 10) : 32;
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

module.exports = { ipMatchesRule, normalizeIp, ipToInt };
