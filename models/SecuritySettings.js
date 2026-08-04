const mongoose = require('mongoose');

// Documento único (singleton) — no hay _id fijo a propósito, se resuelve
// siempre con findOne()/findOneAndUpdate() sobre la colección completa.
const securitySettingsSchema = new mongoose.Schema({
  ip_allowlist_enabled: { type: Boolean, default: false },
  // 2FA (TOTP) para /admin-ui — ver lib/totp.js. totp_secret se guarda
  // desde POST /security/2fa/setup pero totp_enabled sigue en false hasta
  // que el admin confirma un código válido en POST /security/2fa/confirm;
  // así un "Configurar 2FA" a medias nunca deja al admin bloqueado fuera
  // de su propia sesión.
  totp_enabled: { type: Boolean, default: false },
  totp_secret: { type: String },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('SecuritySettings', securitySettingsSchema);
