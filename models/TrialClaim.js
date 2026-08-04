const mongoose = require('mongoose');

// Una fila por cada prueba gratis otorgada — se consulta en POST
// /account/register para bloquear una segunda prueba desde la misma IP o el
// mismo navegador (cookie propia del sitio, no del dominio de esta API; ver
// nota en routes/account.js sobre por qué no es una cookie Set-Cookie normal).
const trialClaimSchema = new mongoose.Schema({
  ip: { type: String, index: true },
  device_id: { type: String, index: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

module.exports = mongoose.model('TrialClaim', trialClaimSchema);
