const mongoose = require('mongoose');

const STATUSES = ['operational', 'degraded', 'outage'];

const statusComponentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  status: { type: String, enum: STATUSES, default: 'operational' },
  // Orden de aparición en /estado.html — no alfabético, el admin lo fija.
  order: { type: Number, default: 0 },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('StatusComponent', statusComponentSchema);
module.exports.STATUSES = STATUSES;
