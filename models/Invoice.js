const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  invoice_number: { type: String, required: true, unique: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  description: String,
  due_date: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'paid', 'overdue', 'cancelled'], default: 'pending' },
  paid_at: Date,
  payment_method: String,
  notes: String,
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('Invoice', invoiceSchema);
