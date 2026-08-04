const express = require('express');
const Client = require('../models/Client');
const License = require('../models/License');
const { requireAdmin } = require('../middleware/auth');
const { applyOverdueSuspension } = require('../lib/billing');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();
router.use(requireAdmin);

router.get('/', asyncHandler(async (req, res) => {
  const clients = await Client.find().sort({ created_at: -1 }).lean();
  return res.json({ success: true, clients });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, contact_name, email, phone, address, notes } = req.body || {};
  if (!name) return res.status(400).json({ success: false, message: 'El nombre del taller es obligatorio' });

  const client = new Client({ name, contact_name, email, phone, address, notes });
  await client.save();
  return res.status(201).json({ success: true, client });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id).lean();
  if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });

  let license = await License.findOne({ client: client._id });
  if (license) {
    license = await applyOverdueSuspension(license);
  }

  return res.json({ success: true, client, license });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { name, contact_name, email, phone, address, notes } = req.body || {};
  const client = await Client.findByIdAndUpdate(
    req.params.id,
    { name, contact_name, email, phone, address, notes },
    { new: true }
  );
  if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
  return res.json({ success: true, client });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const client = await Client.findByIdAndDelete(req.params.id);
  if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
  return res.json({ success: true });
}));

module.exports = router;
