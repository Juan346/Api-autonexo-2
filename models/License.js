const mongoose = require('mongoose');

const licenseSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  status: { type: String, default: 'pending' },
  valid: { type: Boolean, default: false },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
  // true durante la prueba gratis de 14 días iniciada desde el portal de
  // cuenta; se apaga en cuanto el cliente elige un plan de pago (POST
  // /account/plan). No aplica a licencias creadas a mano desde el admin.
  is_trial: { type: Boolean, default: false },
  holder_name: String,
  company_name: String,
  site_name: String,
  admin_email: String,
  expiration_date: Date,
  max_users: Number,
  max_vehicles: Number,
  max_sites: Number,
  notes: String,
  verified_at: Date,
}, { timestamps: { createdAt: 'issued_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('License', licenseSchema);
