require('dotenv').config();
const mongoose = require('mongoose');

const Client = require('./models/Client');
const Plan = require('./models/Plan');
const License = require('./models/License');
const StatusComponent = require('./models/StatusComponent');

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/license_db';

async function run() {
  await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to', mongoUri);

  let plan = await Plan.findOne({ name: 'Básico' });
  if (!plan) {
    plan = await new Plan({
      name: 'Básico',
      price: 29,
      currency: 'USD',
      billing_cycle: 'monthly',
      max_users: 5,
      max_vehicles: 50,
      max_sites: 1,
      description: 'Plan de entrada para talleres pequeños',
    }).save();
    console.log('Plan creado:', plan.name);
  }

  // Estos dos son los que ofrece el selector de planes del portal de cuenta
  // (home/app.html → POST /account/plan) — el slug es lo que manda el
  // frontend, así que tienen que existir con exactamente estos slugs para
  // que el self-service funcione.
  const portalPlans = [
    {
      // name_en/description_en/features_en van a mano acá (no vía
      // lib/translate.js) porque ya tenemos esta copy exacta traducida y
      // revisada por un humano en home/i18n.js (plan_essential_*) — pedirle
      // lo mismo a un traductor automático sería peor calidad y gastaría
      // cupo del servicio gratis para nada.
      slug: 'esencial', name: 'Esencial', price: 29, currency: 'USD', billing_cycle: 'monthly',
      max_users: 3, max_vehicles: 50, max_sites: 1, description: '1 taller · hasta 3 usuarios',
      features: [
        '1 taller',
        'Hasta 3 usuarios',
        'Órdenes de trabajo ilimitadas',
        'Clientes y vehículos',
        'Facturación básica',
        'Soporte por correo',
      ],
      name_en: 'Essential',
      description_en: '1 shop · up to 3 users',
      features_en: [
        '1 shop location',
        'Up to 3 users',
        'Unlimited work orders',
        'Customers & vehicles',
        'Basic invoicing',
        'Email support',
      ],
    },
    {
      slug: 'profesional', name: 'Profesional', price: 79, currency: 'USD', billing_cycle: 'monthly',
      max_users: 10, max_vehicles: 200, max_sites: 2, description: 'Hasta 10 usuarios · 2 sucursales',
      features: [
        'Todo lo de Esencial, más:',
        'Hasta 10 usuarios',
        '2 sucursales',
        'Inventario y repuestos',
        'Recordatorios SMS / WhatsApp',
        'Reportes avanzados',
        'Soporte prioritario',
      ],
      name_en: 'Professional',
      description_en: 'Up to 10 users · 2 locations',
      features_en: [
        'Everything in Essential, plus:',
        'Up to 10 users',
        '2 locations',
        'Inventory & parts',
        'SMS / WhatsApp reminders',
        'Advanced reports',
        'Priority support',
      ],
    },
  ];
  for (const data of portalPlans) {
    // eslint-disable-next-line no-await-in-loop
    const existingPlan = await Plan.findOne({ slug: data.slug });
    if (existingPlan) continue;
    // eslint-disable-next-line no-await-in-loop
    const created = await new Plan(data).save();
    console.log('Plan creado:', created.name, `(${created.slug})`);
  }

  // Los mismos 4 componentes que ya mostraba /estado.html a mano — se
  // siembran una sola vez; el admin cambia su status desde
  // /admin-ui/status.html de ahí en adelante.
  const statusComponents = [
    { name: 'Sitio web', description: 'autonexo.com y páginas públicas', order: 1 },
    { name: 'Cuenta y panel de facturación', description: 'Registro, inicio de sesión, clave de API', order: 2 },
    { name: 'Servicio de validación de licencias', description: 'Verificación periódica de cada instalación', order: 3 },
    { name: 'Panel de administración', description: 'Gestión interna de clientes, planes y facturas', order: 4 },
  ];
  for (const data of statusComponents) {
    // eslint-disable-next-line no-await-in-loop
    const existingComponent = await StatusComponent.findOne({ name: data.name });
    if (existingComponent) continue;
    // eslint-disable-next-line no-await-in-loop
    await new StatusComponent(data).save();
    console.log('Componente de estado creado:', data.name);
  }

  let client = await Client.findOne({ name: 'Demo Co' });
  if (!client) {
    client = await new Client({
      name: 'Demo Co',
      contact_name: 'Demo User',
      email: 'demo@example.com',
      phone: '',
      address: '',
      notes: 'Cliente de ejemplo generado por seed.js',
    }).save();
    console.log('Cliente creado:', client.name);
  }

  const sampleKey = 'TEST-KEY-2026-ABCD';
  const exists = await License.findOne({ key: sampleKey });
  if (exists) {
    console.log('License already exists:', sampleKey);
    process.exit(0);
  }

  const lic = new License({
    key: sampleKey,
    status: 'pending',
    valid: false,
    client: client._id,
    holder_name: client.contact_name,
    company_name: client.name,
    site_name: 'demo.local',
    admin_email: client.email,
    expiration_date: new Date('2028-01-01T00:00:00Z'),
    max_users: plan.max_users,
    max_vehicles: plan.max_vehicles,
    max_sites: plan.max_sites,
    notes: 'Generated by seed script',
  });

  await lic.save();
  console.log('Inserted demo license with key:', sampleKey);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
