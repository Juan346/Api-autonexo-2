const express = require('express');
const rateLimit = require('express-rate-limit');
const ContactMessage = require('../models/ContactMessage');
const { requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// El formulario de contacto es público (cualquier visitante del sitio),
// así que necesita su propio límite de intentos — mismo criterio que
// authLimiter en routes/account.js, pero más permisivo porque no protege
// contraseñas, solo evita spam masivo.
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Demasiados mensajes enviados. Intenta de nuevo en unos minutos.' },
});

router.post('/', contactLimiter, asyncHandler(async (req, res) => {
  const { name, email, workshop, reason, message } = req.body || {};
  const cleanName = (name || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanMessage = (message || '').trim();
  const cleanReason = ContactMessage.REASONS.includes(reason) ? reason : 'other';

  if (!cleanName || !cleanEmail || !cleanMessage) {
    return res.status(400).json({ success: false, message: 'Nombre, correo y mensaje son obligatorios' });
  }
  if (!EMAIL_RE.test(cleanEmail)) {
    return res.status(400).json({ success: false, message: 'Ingresa un correo válido' });
  }
  if (cleanMessage.length > 4000) {
    return res.status(400).json({ success: false, message: 'El mensaje es demasiado largo' });
  }

  await new ContactMessage({
    name: cleanName,
    email: cleanEmail,
    workshop: (workshop || '').trim(),
    reason: cleanReason,
    message: cleanMessage,
  }).save();

  // No hay envío de correo desde esta API (a diferencia de la app Flask,
  // que sí tiene app/email_utils.py) — el mensaje queda guardado para que
  // el equipo lo revise desde /admin-ui/contacts.html.
  return res.status(201).json({ success: true, message: 'Recibimos tu mensaje. Te responderemos pronto.' });
}));

router.get('/', requireAdmin, asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const messages = await ContactMessage.find(filter).sort({ created_at: -1 }).lean();
  return res.json({ success: true, messages });
}));

router.put('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!['new', 'read', 'archived'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Estado inválido' });
  }
  const msg = await ContactMessage.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!msg) return res.status(404).json({ success: false, message: 'Mensaje no encontrado' });
  return res.json({ success: true, message: msg });
}));

router.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const msg = await ContactMessage.findByIdAndDelete(req.params.id);
  if (!msg) return res.status(404).json({ success: false, message: 'Mensaje no encontrado' });
  return res.json({ success: true });
}));

module.exports = router;
