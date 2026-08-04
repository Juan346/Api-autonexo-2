const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
  name: { type: String, required: true },
  // Identificador estable usado por el portal de cuenta (home/app.html) para
  // seleccionar un plan por nombre (data-plan-key="esencial", etc.) sin
  // hardcodear ObjectIds de Mongo en el frontend.
  slug: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
  price: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  billing_cycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
  max_users: { type: Number, default: 5 },
  max_vehicles: { type: Number, default: 50 },
  // Cantidad de sedes/sucursales que cubre el plan (1 = un solo taller).
  // null = ilimitadas (plan Empresarial, que hoy no se siembra como Plan
  // real porque su precio es "Personalizado" — ver home/app.html).
  max_sites: { type: Number, default: 1 },
  description: String,
  // Lista de "qué incluye" mostrada como viñetas dondequiera que se pinte
  // el plan (portal de cuenta, precios públicos). Texto libre por línea,
  // no derivado de max_users/max_vehicles/max_sites, para que el admin
  // pueda describir el plan con sus propias palabras.
  features: { type: [String], default: [] },
  // Traducción al inglés de name/description/features, resuelta UNA vez al
  // guardar el plan (ver lib/translate.js + routes/plans.js) y cacheada acá
  // — el visitante en inglés solo lee estos campos, nunca dispara la
  // traducción. Si la traducción falló en ese momento, quedan igual al
  // texto en español (degradación explícita, no un campo vacío ambiguo).
  name_en: String,
  description_en: String,
  features_en: { type: [String], default: [] },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('Plan', planSchema);
