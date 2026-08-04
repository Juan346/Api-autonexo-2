const mongoose = require('mongoose');

// Vocabulario estándar de páginas de estado (Statuspage.io y similares):
// investigating -> identified -> monitoring -> resolved. No es un timeline
// de actualizaciones anidadas (eso sería sobre-ingeniería para lo que pidió
// el equipo) — cada incidente es una sola entrada que el admin edita a
// mano a medida que cambia de fase.
const STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'];

const statusIncidentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  status: { type: String, enum: STATUSES, default: 'investigating' },
  started_at: { type: Date, default: Date.now },
  resolved_at: { type: Date },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('StatusIncident', statusIncidentSchema);
module.exports.STATUSES = STATUSES;
