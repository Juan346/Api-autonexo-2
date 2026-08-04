const express = require('express');
const StatusComponent = require('../models/StatusComponent');
const StatusIncident = require('../models/StatusIncident');
const { requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

// El banner general de /estado.html es el peor estado entre los
// componentes: un solo componente en 'outage' tiñe todo de rojo, uno en
// 'degraded' (sin ningún outage) lo tiñe de amarillo — igual que cualquier
// status page real (Statuspage.io, etc.), para que nunca diga "todo bien"
// si algo no lo está.
function computeOverall(components) {
  if (components.some((c) => c.status === 'outage')) return 'outage';
  if (components.some((c) => c.status === 'degraded')) return 'degraded';
  return 'operational';
}

// -------- Público --------

router.get('/', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const [components, incidents] = await Promise.all([
    StatusComponent.find().sort({ order: 1 }).lean(),
    StatusIncident.find().sort({ started_at: -1 }).limit(20).lean(),
  ]);
  return res.json({ success: true, overall: computeOverall(components), components, incidents });
}));

// -------- Admin: componentes --------

router.post('/components', requireAdmin, asyncHandler(async (req, res) => {
  const { name, description, status, order } = req.body || {};
  if (!name) return res.status(400).json({ success: false, message: 'El nombre es obligatorio' });
  const component = await new StatusComponent({ name, description, status, order }).save();
  return res.status(201).json({ success: true, component });
}));

router.put('/components/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { name, description, status, order } = req.body || {};
  const component = await StatusComponent.findByIdAndUpdate(
    req.params.id,
    { name, description, status, order },
    { new: true, runValidators: true }
  );
  if (!component) return res.status(404).json({ success: false, message: 'Componente no encontrado' });
  return res.json({ success: true, component });
}));

router.delete('/components/:id', requireAdmin, asyncHandler(async (req, res) => {
  const component = await StatusComponent.findByIdAndDelete(req.params.id);
  if (!component) return res.status(404).json({ success: false, message: 'Componente no encontrado' });
  return res.json({ success: true });
}));

// -------- Admin: incidentes --------

router.post('/incidents', requireAdmin, asyncHandler(async (req, res) => {
  const { title, description, status, started_at } = req.body || {};
  if (!title) return res.status(400).json({ success: false, message: 'El título es obligatorio' });
  const incident = await new StatusIncident({
    title, description, status,
    started_at: started_at ? new Date(started_at) : new Date(),
  }).save();
  return res.status(201).json({ success: true, incident });
}));

router.put('/incidents/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { title, description, status } = req.body || {};
  const update = { title, description, status };
  // resolved_at se fija solo la primera vez que pasa a 'resolved' — igual
  // que published_at en BlogPost, para que no se mueva por una edición
  // posterior de un incidente que ya estaba resuelto.
  if (status === 'resolved') {
    const existing = await StatusIncident.findById(req.params.id);
    if (existing && !existing.resolved_at) update.resolved_at = new Date();
  }
  const incident = await StatusIncident.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!incident) return res.status(404).json({ success: false, message: 'Incidente no encontrado' });
  return res.json({ success: true, incident });
}));

router.delete('/incidents/:id', requireAdmin, asyncHandler(async (req, res) => {
  const incident = await StatusIncident.findByIdAndDelete(req.params.id);
  if (!incident) return res.status(404).json({ success: false, message: 'Incidente no encontrado' });
  return res.json({ success: true });
}));

module.exports = router;
