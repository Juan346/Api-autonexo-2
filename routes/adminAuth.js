const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { signAdminToken, requireAdmin, COOKIE_NAME, signPending2faToken, verifyPending2faToken } = require('../middleware/auth');
const SecuritySettings = require('../models/SecuritySettings');
const totp = require('../lib/totp');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en unos minutos.' },
});

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  const adminUser = process.env.ADMIN_USER;
  const adminHash = process.env.ADMIN_PASSWORD_HASH;

  if (!adminUser || !adminHash) {
    return res.status(500).json({ success: false, message: 'Admin no configurado (ADMIN_USER/ADMIN_PASSWORD_HASH)' });
  }
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Usuario y contraseña requeridos' });
  }

  const validUser = username === adminUser;
  const validPassword = validUser && await bcrypt.compare(password, adminHash);

  if (!validUser || !validPassword) {
    return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
  }

  const settings = await SecuritySettings.findOne().lean();
  if (settings && settings.totp_enabled) {
    // Usuario y contraseña correctos, pero todavía falta el código de la
    // app autenticadora — no se abre sesión (no se pone la cookie) hasta
    // POST /admin/login/2fa. El pending_token identifica que este usuario
    // ya pasó el primer paso, sin darle acceso a nada por sí solo.
    return res.json({ success: true, requires_2fa: true, pending_token: signPending2faToken(username) });
  }

  const token = signAdminToken(username);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
  });
  return res.json({ success: true });
}));

router.post('/login/2fa', loginLimiter, asyncHandler(async (req, res) => {
  const { pending_token, code } = req.body || {};
  if (!pending_token || !code) {
    return res.status(400).json({ success: false, message: 'Falta el token de verificación o el código' });
  }

  let payload;
  try {
    payload = verifyPending2faToken(pending_token);
  } catch (err) {
    return res.status(401).json({ success: false, message: 'La verificación expiró. Inicia sesión de nuevo.' });
  }

  const settings = await SecuritySettings.findOne().lean();
  if (!settings || !settings.totp_enabled || !settings.totp_secret) {
    return res.status(409).json({ success: false, message: '2FA no está activo' });
  }
  if (!totp.verifyToken(settings.totp_secret, code)) {
    return res.status(401).json({ success: false, message: 'Código inválido' });
  }

  const token = signAdminToken(payload.sub);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
  });
  return res.json({ success: true });
}));

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  return res.json({ success: true });
});

router.get('/me', requireAdmin, (req, res) => {
  return res.json({ success: true, admin: req.admin });
});

module.exports = router;
