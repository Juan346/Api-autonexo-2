const express = require('express');
const Invoice = require('../models/Invoice');
const Plan = require('../models/Plan');
const Client = require('../models/Client');
const License = require('../models/License');
const { requireAdmin } = require('../middleware/auth');
const { addBillingCycle, nextInvoiceNumber } = require('../lib/billing');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();
router.use(requireAdmin);

router.get('/', asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.client) filter.client = req.query.client;
  if (req.query.status) filter.status = req.query.status;
  const invoices = await Invoice.find(filter).populate('client plan').sort({ due_date: 1 }).lean();
  return res.json({ success: true, invoices });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { client, plan: planId, due_date, amount, currency, description, notes } = req.body || {};
  if (!client) return res.status(400).json({ success: false, message: 'El cliente es obligatorio' });

  const clientDoc = await Client.findById(client);
  if (!clientDoc) return res.status(400).json({ success: false, message: 'Cliente no encontrado' });

  let resolvedAmount = amount;
  let resolvedCurrency = currency;
  let resolvedDescription = description;

  if (planId) {
    const plan = await Plan.findById(planId);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan no encontrado' });
    resolvedAmount = resolvedAmount ?? plan.price;
    resolvedCurrency = resolvedCurrency ?? plan.currency;
    resolvedDescription = resolvedDescription ?? `${plan.name} (${plan.billing_cycle})`;
  }

  if (resolvedAmount === undefined) {
    return res.status(400).json({ success: false, message: 'El monto es obligatorio si no se referencia un plan' });
  }

  const invoice = new Invoice({
    invoice_number: await nextInvoiceNumber(),
    client,
    plan: planId || undefined,
    amount: resolvedAmount,
    currency: resolvedCurrency || 'USD',
    description: resolvedDescription,
    due_date: due_date ? new Date(due_date) : new Date(),
    notes,
  });
  await invoice.save();
  return res.status(201).json({ success: true, invoice });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id).populate('client plan').lean();
  if (!invoice) return res.status(404).json({ success: false, message: 'Factura no encontrada' });
  return res.json({ success: true, invoice });
}));

router.post('/:id/mark-paid', asyncHandler(async (req, res) => {
  const { payment_method, notes } = req.body || {};
  const invoice = await Invoice.findById(req.params.id).populate('plan');
  if (!invoice) return res.status(404).json({ success: false, message: 'Factura no encontrada' });
  if (invoice.status === 'paid') {
    return res.status(409).json({ success: false, message: 'La factura ya estaba pagada' });
  }

  invoice.status = 'paid';
  invoice.paid_at = new Date();
  if (payment_method) invoice.payment_method = payment_method;
  if (notes) invoice.notes = notes;
  await invoice.save();

  let license = await License.findOne({ client: invoice.client });
  let nextInvoice = null;
  let warning = null;

  const cycle = invoice.plan ? invoice.plan.billing_cycle : 'monthly';
  const now = new Date();

  if (license && license.status === 'blocked') {
    // "blocked" es una decisión manual de moderación, no de cobranza — un
    // pago no la revierte sola. El pago queda registrado igual; el admin
    // desbloquea a mano desde /admin-ui/licenses.html cuando corresponda.
    warning = 'Esta licencia está bloqueada por moderación — el pago quedó registrado, pero la licencia sigue bloqueada. Desbloquéala a mano si corresponde.';
  } else if (license) {
    const base = license.expiration_date && license.expiration_date > now ? license.expiration_date : now;
    license.expiration_date = addBillingCycle(base, cycle);
    license.valid = true;
    license.status = 'active';
    if (invoice.plan) {
      license.max_users = invoice.plan.max_users;
      license.max_vehicles = invoice.plan.max_vehicles;
      license.max_sites = invoice.plan.max_sites;
    }
    license.verified_at = now;
    await license.save();

    if (invoice.plan) {
      nextInvoice = new Invoice({
        invoice_number: await nextInvoiceNumber(),
        client: invoice.client,
        plan: invoice.plan._id,
        amount: invoice.plan.price,
        currency: invoice.plan.currency,
        description: `${invoice.plan.name} (${invoice.plan.billing_cycle})`,
        due_date: license.expiration_date,
        status: 'pending',
      });
      await nextInvoice.save();
    }
  } else {
    warning = 'No hay una licencia vinculada a este cliente todavía; el pago quedó registrado pero no se activó ninguna licencia.';
  }

  return res.json({ success: true, invoice, license, next_invoice: nextInvoice, warning });
}));

router.post('/:id/cancel', asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) return res.status(404).json({ success: false, message: 'Factura no encontrada' });
  if (invoice.status === 'paid') {
    return res.status(409).json({ success: false, message: 'No se puede cancelar una factura ya pagada' });
  }
  invoice.status = 'cancelled';
  await invoice.save();
  return res.json({ success: true, invoice });
}));

module.exports = router;
