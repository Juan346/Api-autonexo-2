const express = require('express');
const License = require('../models/License');
const { requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();
router.use(requireAdmin);

router.get('/', asyncHandler(async (req, res) => {
  const licenses = await License.find().populate('client plan').sort({ issued_at: -1 }).lean();
  return res.json({ success: true, licenses });
}));

router.post('/', asyncHandler(async (req, res) => {
  const payload = req.body || {};
  if (!payload.key) return res.status(400).json({ success: false, message: 'Key requerida' });
  const existing = await License.findOne({ key: payload.key });
  if (existing) return res.status(409).json({ success: false, message: 'Key ya existe' });

  if (payload.client) {
    const existingForClient = await License.findOne({ client: payload.client });
    if (existingForClient) {
      return res.status(409).json({ success: false, message: 'Este cliente ya tiene una licencia — edítala en vez de crear otra' });
    }
  }

  const lic = new License({
    key: payload.key,
    client: payload.client || undefined,
    plan: payload.plan || undefined,
    holder_name: payload.holder_name,
    company_name: payload.company_name,
    site_name: payload.site_name,
    admin_email: payload.admin_email,
    status: payload.status || 'active',
    expiration_date: payload.expiration_date ? new Date(payload.expiration_date) : null,
    max_users: payload.max_users || 5,
    max_vehicles: payload.max_vehicles || 50,
    max_sites: payload.max_sites || 1,
    valid: payload.valid !== undefined ? !!payload.valid : true,
    notes: payload.notes,
    verified_at: payload.verified_at ? new Date(payload.verified_at) : new Date(),
  });

  await lic.save();
  return res.status(201).json({ success: true, license: lic });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const license = await License.findById(req.params.id).populate('client plan');
  if (!license) return res.status(404).json({ success: false, message: 'Licencia no encontrada' });
  return res.json({ success: true, license });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const payload = req.body || {};

  if (payload.key) {
    const existing = await License.findOne({ key: payload.key, _id: { $ne: req.params.id } });
    if (existing) return res.status(409).json({ success: false, message: 'Key ya existe' });
  }
  if (payload.client) {
    const existingForClient = await License.findOne({ client: payload.client, _id: { $ne: req.params.id } });
    if (existingForClient) {
      return res.status(409).json({ success: false, message: 'Este cliente ya tiene otra licencia asignada' });
    }
  }

  const update = {};
  const fields = ['key', 'client', 'plan', 'holder_name', 'company_name', 'site_name', 'admin_email', 'status', 'max_users', 'max_vehicles', 'max_sites', 'notes'];
  fields.forEach((f) => { if (payload[f] !== undefined) update[f] = payload[f]; });
  if (payload.expiration_date !== undefined) {
    update.expiration_date = payload.expiration_date ? new Date(payload.expiration_date) : null;
  }
  if (payload.valid !== undefined) update.valid = !!payload.valid;
  if (payload.is_trial !== undefined) update.is_trial = !!payload.is_trial;

  const license = await License.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }).populate('client plan');
  if (!license) return res.status(404).json({ success: false, message: 'Licencia no encontrada' });
  return res.json({ success: true, license });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const license = await License.findByIdAndDelete(req.params.id);
  if (!license) return res.status(404).json({ success: false, message: 'Licencia no encontrada' });
  return res.json({ success: true });
}));

module.exports = router;
