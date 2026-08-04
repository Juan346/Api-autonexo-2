const express = require('express');
const Plan = require('../models/Plan');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

// Público, sin caché — lo consume home/index.html (la página de marketing)
// para mostrar precios reales en vez de HTML hardcodeado. Deliberadamente
// vive en su propia ruta en vez de reusar /account/plans: ese nombre sugiere
// que hace falta sesión (no es cierto, pero confunde al depurar), y /plans
// a secas cae bajo el mismo candado de IP del panel admin (adminIpGate en
// index.js) — este endpoint tiene que ser inequívocamente público.
router.get('/', asyncHandler(async (req, res) => {
  // Nunca cachear: el admin puede cambiar un precio en cualquier momento y
  // la página de precios tiene que reflejarlo de inmediato, sin depender de
  // que el visitante haga un hard-refresh para saltarse un 304 con ETag.
  res.set('Cache-Control', 'no-store');

  const plans = await Plan.find({ slug: { $exists: true, $ne: null } })
    .sort({ price: 1 })
    .select('slug name price currency billing_cycle description max_users max_vehicles max_sites features name_en description_en features_en')
    .lean();

  return res.json({ success: true, plans });
}));

module.exports = router;
