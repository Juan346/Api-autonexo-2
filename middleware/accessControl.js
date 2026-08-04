const AccessRule = require('../models/AccessRule');
const SecuritySettings = require('../models/SecuritySettings');
const { ipMatchesRule, normalizeIp } = require('../lib/ipMatch');

// Cache en memoria de las reglas — esta app corre en un solo proceso (mismo
// criterio ya documentado para el rate limiter y el scheduler de la app
// Flask), así que un cache simple sin TTL, invalidado en cada escritura
// desde routes/security.js, es suficiente y evita una consulta a Mongo en
// cada request.
let cache = null; // { rules: AccessRule[], settings: SecuritySettings }

async function loadCache() {
  if (cache) return cache;
  const [rules, settings] = await Promise.all([
    AccessRule.find().lean(),
    SecuritySettings.findOne().lean(),
  ]);
  cache = { rules, settings: settings || { ip_allowlist_enabled: false } };
  return cache;
}

function invalidateCache() {
  cache = null;
}

function getClientIp(req) {
  return normalizeIp(req.ip);
}

async function isIpAllowedForScope(ip, scope) {
  const { rules } = await loadCache();
  const candidates = rules.filter((r) => r.type === 'ip' && (r.scope === scope || r.scope === 'all'));
  return candidates.some((r) => ipMatchesRule(ip, r.value));
}

async function isIpAllowlistEnabled() {
  const { settings } = await loadCache();
  return !!settings.ip_allowlist_enabled;
}

function ipAllowlistFor(scope) {
  return async function (req, res, next) {
    try {
      const enabled = await isIpAllowlistEnabled();
      if (!enabled) return next();

      const ip = getClientIp(req);
      const allowed = await isIpAllowedForScope(ip, scope);
      if (!allowed) {
        return res.status(403).json({ success: false, message: `IP no autorizada (${ip})` });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

async function corsOriginResolver(origin, callback) {
  // Llamadas servidor-a-servidor (curl, requests de Python, etc.) no mandan
  // header Origin — CORS solo rige peticiones hechas desde un navegador, así
  // que estas siempre pasan (el /validate público se protege con
  // ipAllowlistFor('validate'), no con CORS).
  if (!origin) return callback(null, true);

  try {
    const { rules } = await loadCache();
    const originRules = rules.filter((r) => r.type === 'origin');

    if (originRules.length === 0) {
      // Sin ninguna regla configurada todavía: comportamiento previo,
      // backward-compatible con instalaciones ya desplegadas.
      const fallback = process.env.CORS_ORIGIN || '';
      return callback(null, fallback ? origin === fallback : false);
    }

    const allowed = originRules.some((r) => r.value === origin);
    return callback(null, allowed);
  } catch (err) {
    return callback(err);
  }
}

module.exports = {
  ipAllowlistFor,
  corsOriginResolver,
  isIpAllowedForScope,
  isIpAllowlistEnabled,
  getClientIp,
  invalidateCache,
};
