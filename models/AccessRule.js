const mongoose = require('mongoose');

const accessRuleSchema = new mongoose.Schema({
  type: { type: String, enum: ['origin', 'ip'], required: true },
  value: { type: String, required: true },
  scope: { type: String, enum: ['validate', 'admin', 'all'], default: 'admin' },
  label: String,
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('AccessRule', accessRuleSchema);
