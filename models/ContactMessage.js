const mongoose = require('mongoose');

// 'plan_request' no lo manda el formulario de contacto público — lo genera
// el propio backend cuando un cliente elige un plan desde el portal de
// cuenta (ver POST /account/plan), para que esa señal de interés aparezca
// en la misma bandeja de /admin-ui/contacts.html en vez de quedar enterrada
// solo en el campo requested_plan del Cliente.
const REASONS = ['sales', 'support', 'press', 'plan_request', 'other'];

const contactMessageSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  workshop: { type: String, trim: true },
  reason: { type: String, enum: REASONS, default: 'other' },
  message: { type: String, required: true, trim: true },
  status: { type: String, enum: ['new', 'read', 'archived'], default: 'new' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('ContactMessage', contactMessageSchema);
module.exports.REASONS = REASONS;
