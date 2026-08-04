const express = require('express');
const Plan = require('../models/Plan');
const { requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { translateManyEsToEn } = require('../lib/translate');

const router = express.Router();
router.use(requireAdmin);

// Vacío/ausente -> undefined (no "", para que el índice sparse+unique de
// Plan.slug lo trate como "sin slug" en vez de intentar imponer unicidad
// sobre una cadena vacía compartida entre varios planes).
function normalizeSlug(raw) {
  const trimmed = String(raw || '').trim().toLowerCase();
  return trimmed || undefined;
}

// El form de admin manda un array de strings (una línea de textarea por
// característica) ya partido en el cliente; por si acaso llega como string
// (ej. alguien pega el JSON a mano), también se acepta separado por saltos
// de línea. Líneas vacías se descartan.
function normalizeFeatures(raw) {
  var list = Array.isArray(raw) ? raw : String(raw || '').split('\n');
  return list.map((f) => String(f).trim()).filter(Boolean);
}

// Traduce name/description/features de una sola pasada (en paralelo) y
// arma los campos _en con fallback al texto en español ítem por ítem si
// una traducción puntual falló — así el guardado del plan nunca se bloquea
// ni queda con campos a medio traducir por una falla del servicio externo.
async function buildTranslatedFields(name, description, features) {
  const texts = [name, description || '', ...features];
  const translated = await translateManyEsToEn(texts);
  return {
    name_en: translated[0] || name,
    description_en: translated[1] || (description || ''),
    features_en: features.map((f, i) => translated[i + 2] || f),
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const plans = await Plan.find().sort({ price: 1 }).lean();
  return res.json({ success: true, plans });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, price, currency, billing_cycle, max_users, max_vehicles, max_sites, description } = req.body || {};
  if (!name || price === undefined) {
    return res.status(400).json({ success: false, message: 'Nombre y precio son obligatorios' });
  }

  const features = normalizeFeatures(req.body && req.body.features);
  const translated = await buildTranslatedFields(name, description, features);

  const plan = new Plan({
    name, price, currency, billing_cycle, max_users, max_vehicles, max_sites, description,
    slug: normalizeSlug(req.body && req.body.slug),
    features,
    ...translated,
  });

  try {
    await plan.save();
  } catch (err) {
    // slug duplicado (índice unique+sparse) -> mensaje claro en vez de 500.
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Ya existe un plan con ese slug' });
    }
    throw err;
  }
  return res.status(201).json({ success: true, plan });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const existing = await Plan.findById(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: 'Plan no encontrado' });

  const { name, price, currency, billing_cycle, max_users, max_vehicles, max_sites, description, features } = req.body || {};
  const update = { name, price, currency, billing_cycle, max_users, max_vehicles, max_sites, description };
  const normalizedFeatures = features !== undefined ? normalizeFeatures(features) : undefined;
  if (normalizedFeatures !== undefined) update.features = normalizedFeatures;

  // El form de admin siempre manda name/description/features juntos en cada
  // guardado, así que re-traducir en cada PUT es simple y correcto (el
  // costo es unas pocas llamadas HTTP en paralelo, no algo que valga la
  // pena optimizar con diffing mientras el panel tenga pocos planes). Si
  // algún caller manda solo un subset de campos (no el form real), se usa
  // lo existente para no traducir con datos incompletos ni vaciar features_en.
  if (name || normalizedFeatures !== undefined) {
    Object.assign(update, await buildTranslatedFields(
      name || existing.name,
      description !== undefined ? description : existing.description,
      normalizedFeatures !== undefined ? normalizedFeatures : existing.features
    ));
  }

  // Solo se toca el slug si mandaron uno no vacío — dejar el campo en blanco
  // en el formulario NO borra el slug existente (para eso, a mano en Mongo).
  const slug = normalizeSlug(req.body && req.body.slug);
  if (slug) update.slug = slug;

  let plan;
  try {
    plan = await Plan.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Ya existe un plan con ese slug' });
    }
    throw err;
  }
  if (!plan) return res.status(404).json({ success: false, message: 'Plan no encontrado' });
  return res.json({ success: true, plan });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const plan = await Plan.findByIdAndDelete(req.params.id);
  if (!plan) return res.status(404).json({ success: false, message: 'Plan no encontrado' });
  return res.json({ success: true });
}));

module.exports = router;
