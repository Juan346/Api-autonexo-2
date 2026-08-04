const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const Client = require('../models/Client');
const License = require('../models/License');
const Plan = require('../models/Plan');
const TrialClaim = require('../models/TrialClaim');
const ContactMessage = require('../models/ContactMessage');
const { signCustomerToken, requireCustomer } = require('../middleware/auth');
const { applyOverdueSuspension } = require('../lib/billing');
const { getClientIp } = require('../middleware/accessControl');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

const TRIAL_DAYS = 14;
const MS_DAY = 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Cubre register + login: ambos verifican contraseñas, así que ambos deben
// estar acotados contra fuerza bruta / creación masiva de cuentas.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
});

async function generateUniqueApiKey() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const key = `anx_live_${crypto.randomBytes(20).toString('hex')}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await License.findOne({ key }).lean();
    if (!exists) return key;
  }
  throw new Error('No se pudo generar una clave de API única, intenta de nuevo');
}

async function buildAccountView(clientId) {
  const client = await Client.findById(clientId).lean();
  if (!client) return null;

  let license = await License.findOne({ client: clientId }).populate('plan');
  if (license) license = await applyOverdueSuspension(license);

  // El nombre del plan solicitado se resuelve acá (no solo el slug) para
  // que el dashboard pueda mostrar "Solicitaste el Plan Profesional" sin
  // tener que ir a buscar el plan aparte. Si el admin borró ese plan
  // después de la solicitud, cae al slug tal cual — mejor eso que romper.
  let requestedPlan = null;
  if (client.requested_plan) {
    const plan = await Plan.findOne({ slug: client.requested_plan }).lean();
    requestedPlan = { slug: client.requested_plan, name: plan ? plan.name : client.requested_plan };
  }

  return {
    client: {
      id: client._id,
      contact_name: client.contact_name,
      workshop_name: client.name,
      email: client.email,
      requested_plan: requestedPlan,
      requested_plan_at: client.requested_plan_at || null,
    },
    license: license ? {
      key: license.key,
      status: license.status,
      valid: license.valid,
      is_trial: !!license.is_trial,
      expiration_date: license.expiration_date,
      max_users: license.max_users,
      max_vehicles: license.max_vehicles,
      max_sites: license.max_sites,
    } : null,
    plan: (license && license.plan) ? {
      slug: license.plan.slug,
      name: license.plan.name,
      price: license.plan.price,
      currency: license.plan.currency,
      billing_cycle: license.plan.billing_cycle,
    } : null,
  };
}

router.post('/register', authLimiter, asyncHandler(async (req, res) => {
  const { name, workshop, email, password } = req.body || {};
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanName = (name || '').trim();
  const cleanWorkshop = (workshop || '').trim();
  // Cookie propia del sitio (no de esta API — ver nota en TrialClaim.js),
  // generada por home/app.js y reenviada aquí solo como dato de solicitud.
  const deviceId = String((req.body && req.body.trial_device_id) || '').trim().slice(0, 100);

  if (!cleanName || !cleanWorkshop || !cleanEmail || !password) {
    return res.status(400).json({ success: false, message: 'Todos los campos son obligatorios' });
  }
  if (!EMAIL_RE.test(cleanEmail)) {
    return res.status(400).json({ success: false, message: 'Ingresa un correo válido' });
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 8 caracteres' });
  }

  const existing = await Client.findOne({ email: cleanEmail });
  if (existing) {
    return res.status(409).json({ success: false, message: 'Ya existe una cuenta con este correo' });
  }

  const ip = getClientIp(req);
  const claimConditions = [];
  if (ip) claimConditions.push({ ip });
  if (deviceId) claimConditions.push({ device_id: deviceId });
  const priorClaim = claimConditions.length
    ? await TrialClaim.findOne({ $or: claimConditions })
    : null;
  if (priorClaim) {
    return res.status(409).json({
      success: false,
      code: 'trial_already_claimed',
      message: 'Ya se usó una prueba gratis desde este dispositivo o red. Inicia sesión o escríbenos a ventas@autonexo.com para contratar un plan.',
    });
  }

  const password_hash = await bcrypt.hash(password, 10);
  const client = new Client({
    name: cleanWorkshop,
    contact_name: cleanName,
    email: cleanEmail,
    password_hash,
  });
  await client.save();

  // La prueba gratis refleja los límites del plan Profesional (si ya se
  // sembró vía seed.js); si todavía no existe ese Plan en la base, cae a
  // valores por defecto razonables en vez de fallar el registro.
  const profesional = await Plan.findOne({ slug: 'profesional' }).lean();
  const trialMaxUsers = profesional ? profesional.max_users : 10;
  const trialMaxVehicles = profesional ? profesional.max_vehicles : 100;
  const trialMaxSites = profesional ? profesional.max_sites : 2;

  const license = new License({
    key: await generateUniqueApiKey(),
    client: client._id,
    status: 'active',
    valid: true,
    is_trial: true,
    holder_name: client.contact_name,
    company_name: client.name,
    admin_email: client.email,
    expiration_date: new Date(Date.now() + TRIAL_DAYS * MS_DAY),
    max_users: trialMaxUsers,
    max_vehicles: trialMaxVehicles,
    max_sites: trialMaxSites,
    verified_at: new Date(),
  });
  await license.save();

  await new TrialClaim({ ip: ip || undefined, device_id: deviceId || undefined, client: client._id }).save();

  const token = signCustomerToken(client._id);
  return res.status(201).json({ success: true, token, account: await buildAccountView(client._id) });
}));

router.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !password) {
    return res.status(400).json({ success: false, message: 'Correo y contraseña requeridos' });
  }

  const client = await Client.findOne({ email: cleanEmail });
  const validPassword = client && client.password_hash
    ? await bcrypt.compare(password, client.password_hash)
    : false;

  if (!validPassword) {
    return res.status(401).json({ success: false, message: 'Correo o contraseña incorrectos' });
  }

  const token = signCustomerToken(client._id);
  return res.json({ success: true, token, account: await buildAccountView(client._id) });
}));

router.get('/me', requireCustomer, asyncHandler(async (req, res) => {
  const account = await buildAccountView(req.customerId);
  if (!account) return res.status(404).json({ success: false, message: 'Cuenta no encontrada' });
  return res.json({ success: true, account });
}));

router.post('/api-key/regenerate', requireCustomer, asyncHandler(async (req, res) => {
  const license = await License.findOne({ client: req.customerId });
  if (!license) return res.status(404).json({ success: false, message: 'No tienes una licencia activa' });

  license.key = await generateUniqueApiKey();
  await license.save();
  return res.json({ success: true, account: await buildAccountView(req.customerId) });
}));

// Público — alimenta el selector de planes del dashboard (home/app.html) con
// los planes reales en vez de precios hardcodeados en el HTML. Ver
// routes/pricing.js para el equivalente que usa la página de marketing.
router.get('/plans', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const plans = await Plan.find({ slug: { $exists: true, $ne: null } })
    .sort({ price: 1 })
    .select('slug name price currency billing_cycle description max_users max_vehicles max_sites features name_en description_en features_en')
    .lean();
  return res.json({ success: true, plans });
}));

// Elegir un plan NO lo activa: solo deja constancia en el cliente para que
// el equipo se comunique y coordine la prueba y la instalación a mano (este
// producto se instala por taller, no es self-service). El admin asigna el
// plan real desde /admin-ui/licenses.html cuando la instalación queda lista.
router.post('/plan', requireCustomer, asyncHandler(async (req, res) => {
  const slug = ((req.body && req.body.plan) || '').trim().toLowerCase();
  const plan = await Plan.findOne({ slug });
  if (!plan) return res.status(404).json({ success: false, message: 'Plan no encontrado' });

  const client = await Client.findByIdAndUpdate(req.customerId, {
    requested_plan: plan.slug,
    requested_plan_at: new Date(),
  }, { new: true });

  // La solicitud queda en Client.requested_plan (para lógica interna) y
  // TAMBIÉN como ContactMessage, para que el equipo la vea en la misma
  // bandeja que ya revisa (/admin-ui/contacts.html) en vez de tener que ir
  // a buscarla aparte en la ficha del cliente.
  await new ContactMessage({
    name: client.contact_name,
    email: client.email,
    workshop: client.name,
    reason: 'plan_request',
    message: `Solicitó el Plan ${plan.name} desde el panel de cuenta. Coordinar prueba e instalación.`,
  }).save();

  return res.json({
    success: true,
    message: `Recibimos tu solicitud del Plan ${plan.name}. Nuestro equipo se pondrá en contacto contigo para coordinar la prueba y la instalación.`,
    account: await buildAccountView(req.customerId),
  });
}));

module.exports = router;
