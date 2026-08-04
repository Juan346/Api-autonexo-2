const Invoice = require('../models/Invoice');
const License = require('../models/License');

const GRACE_PERIOD_DAYS = parseInt(process.env.GRACE_PERIOD_DAYS || '7', 10);

function addBillingCycle(date, cycle) {
  const result = new Date(date);
  if (cycle === 'yearly') {
    result.setFullYear(result.getFullYear() + 1);
  } else {
    result.setMonth(result.getMonth() + 1);
  }
  return result;
}

async function nextInvoiceNumber() {
  const last = await Invoice.findOne().sort({ created_at: -1 }).select('invoice_number').lean();
  let nextSeq = 1;
  if (last && last.invoice_number) {
    const match = last.invoice_number.match(/(\d+)$/);
    if (match) nextSeq = parseInt(match[1], 10) + 1;
  }
  return `INV-${String(nextSeq).padStart(6, '0')}`;
}

/**
 * Suspende la licencia de un cliente si tiene una factura pendiente vencida
 * hace más de GRACE_PERIOD_DAYS y no fue pagada. Se llama de forma perezosa
 * (sin cron) cada vez que se valida o consulta una licencia/cliente.
 */
async function applyOverdueSuspension(license) {
  if (!license || !license.client) return license;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - GRACE_PERIOD_DAYS);

  const overdue = await Invoice.findOne({
    client: license.client,
    status: 'pending',
    due_date: { $lt: cutoff },
  });

  if (overdue) {
    // "blocked" es una decisión manual del equipo (moderación), no un efecto
    // de la mora — nunca la degradamos a "suspended" automáticamente, ni
    // aunque haya una factura vencida real. Solo un admin la revierte.
    if (license.status !== 'blocked' && (license.valid || license.status !== 'suspended')) {
      license.valid = false;
      license.status = 'suspended';
      await license.save();
    }
    await Invoice.updateMany(
      { client: license.client, status: 'pending', due_date: { $lt: cutoff } },
      { $set: { status: 'overdue' } }
    );
  }

  return license;
}

module.exports = { addBillingCycle, nextInvoiceNumber, applyOverdueSuspension, GRACE_PERIOD_DAYS };
