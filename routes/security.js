const express = require('express');
const AccessRule = require('../models/AccessRule');
const SecuritySettings = require('../models/SecuritySettings');
const { requireAdmin } = require('../middleware/auth');
const { ipMatchesRule } = require('../lib/ipMatch');
const { getClientIp, invalidateCache } = require('../middleware/accessControl');
const asyncHandler = require('../lib/asyncHandler');
const totp = require('../lib/totp');

const router = express.Router();
router.use(requireAdmin);

router.get('/settings', asyncHandler(async (req, res) => {
  const settings = await SecuritySettings.findOne().lean();
  return res.json({
    success: true,
    ip_allowlist_enabled: !!(settings && settings.ip_allowlist_enabled),
    my_ip: getClientIp(req),
  });
}));

router.put('/settings', asyncHandler(async (req, res) => {
  const enabled = !!req.body.ip_allowlist_enabled;

  if (enabled) {
    const myIp = getClientIp(req);
    // Consulta directa (no cache) — esta comprobación decide si la persona
    // que la ejecuta se va a bloquear a sí misma, así que tiene que ver el
    // estado más reciente posible de las reglas.
    const adminRules = await AccessRule.find({ type: 'ip', scope: { $in: ['admin', 'all'] } }).lean();
    const wouldLockOutSelf = !adminRules.some((r) => ipMatchesRule(myIp, r.value));
    if (wouldLockOutSelf) {
      return res.status(409).json({
        success: false,
        message: `Con esto activado te bloquearías a ti mismo: tu IP actual (${myIp}) no está en ninguna regla con alcance "admin" o "todas". Agrégala primero.`,
      });
    }
  }

  await SecuritySettings.findOneAndUpdate({}, { ip_allowlist_enabled: enabled }, { upsert: true, new: true });
  invalidateCache();
  return res.json({ success: true, ip_allowlist_enabled: enabled });
}));

// -------- 2FA (TOTP) --------

router.get('/2fa/status', asyncHandler(async (req, res) => {
  const settings = await SecuritySettings.findOne().lean();
  return res.json({ success: true, enabled: !!(settings && settings.totp_enabled) });
}));

// Genera un secreto NUEVO y lo guarda, pero deja totp_enabled en false —
// todavía no protege el login. Se activa recién en /2fa/confirm, cuando el
// admin demuestra que de verdad escaneó el QR con un código válido. Llamar
// esto de nuevo antes de confirmar simplemente reemplaza el secreto
// pendiente (ej. si el QR no cargó bien la primera vez).
router.post('/2fa/setup', asyncHandler(async (req, res) => {
  const secret = totp.generateSecret();
  await SecuritySettings.findOneAndUpdate(
    {},
    { totp_secret: secret, totp_enabled: false },
    { upsert: true }
  );

  const otpauthUri = totp.buildOtpauthUri(secret, process.env.ADMIN_USER || 'admin', 'Autonexo');
  const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(otpauthUri);
  return res.json({ success: true, secret, otpauth_uri: otpauthUri, qr_url: qrUrl });
}));

router.post('/2fa/confirm', asyncHandler(async (req, res) => {
  const { code } = req.body || {};
  const settings = await SecuritySettings.findOne().lean();
  if (!settings || !settings.totp_secret) {
    return res.status(409).json({ success: false, message: 'Primero genera un código QR desde "Configurar 2FA"' });
  }
  if (!totp.verifyToken(settings.totp_secret, code)) {
    // 400, no 401: ya hay una sesión admin válida (pasó requireAdmin arriba
    // en este router) — esto es un código mal escrito, no una sesión
    // vencida. admin.js trata cualquier 401 fuera de /admin/login[/2fa]
    // como "sesión expirada" y redirige al login, lo que borraría este
    // formulario antes de que el admin viera el mensaje de error.
    return res.status(400).json({ success: false, message: 'Código inválido. Revisa la hora de tu teléfono e intenta de nuevo.' });
  }

  await SecuritySettings.findOneAndUpdate({}, { totp_enabled: true });
  return res.json({ success: true, enabled: true });
}));

// Exige un código válido (no solo la cookie de sesión) para desactivar —
// si alguien roba la sesión del admin, esto evita que apague el 2FA sin
// tener también el teléfono con la app autenticadora.
router.post('/2fa/disable', asyncHandler(async (req, res) => {
  const { code } = req.body || {};
  const settings = await SecuritySettings.findOne().lean();
  if (!settings || !settings.totp_enabled) {
    return res.json({ success: true, enabled: false });
  }
  if (!totp.verifyToken(settings.totp_secret, code)) {
    return res.status(400).json({ success: false, message: 'Código inválido' }); // ver nota de /2fa/confirm sobre por qué 400 y no 401
  }

  // $unset explícito: Mongoose descarta claves en `undefined` antes de armar
  // el update, así que { totp_secret: undefined } NO borraría el secreto
  // viejo de Mongo — se quedaría ahí, listo para revivir si alguien vuelve
  // a poner totp_enabled en true a mano.
  await SecuritySettings.findOneAndUpdate({}, { $set: { totp_enabled: false }, $unset: { totp_secret: 1 } });
  return res.json({ success: true, enabled: false });
}));

router.get('/rules', asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.type) filter.type = req.query.type;
  const rules = await AccessRule.find(filter).sort({ created_at: -1 }).lean();
  return res.json({ success: true, rules });
}));

router.post('/rules', asyncHandler(async (req, res) => {
  const { type, value, scope, label } = req.body || {};
  if (!['origin', 'ip'].includes(type)) {
    return res.status(400).json({ success: false, message: 'type debe ser "origin" o "ip"' });
  }
  if (!value) return res.status(400).json({ success: false, message: 'value es obligatorio' });

  if (type === 'ip') {
    const [rangeIp] = value.split('/');
    const valid = rangeIp.split('.').length === 4 && rangeIp.split('.').every((p) => {
      const n = Number(p);
      return Number.isInteger(n) && n >= 0 && n <= 255;
    });
    if (!valid) return res.status(400).json({ success: false, message: 'IP/CIDR inválida (solo IPv4, ej. 203.0.113.5 o 203.0.113.0/24)' });
  }

  const rule = new AccessRule({
    type,
    value,
    scope: type === 'origin' ? undefined : (scope || 'admin'),
    label,
  });
  await rule.save();
  invalidateCache();
  return res.status(201).json({ success: true, rule });
}));

router.delete('/rules/:id', asyncHandler(async (req, res) => {
  const rule = await AccessRule.findByIdAndDelete(req.params.id);
  if (!rule) return res.status(404).json({ success: false, message: 'Regla no encontrada' });
  invalidateCache();
  return res.json({ success: true });
}));

module.exports = router;
