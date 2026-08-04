const express = require('express');
const Client = require('../models/Client');
const Invoice = require('../models/Invoice');
const License = require('../models/License');
const { requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();
router.use(requireAdmin);

router.get('/summary', asyncHandler(async (req, res) => {
  const [clientCount, activeLicenses, overdueInvoices, pendingInvoices] = await Promise.all([
    Client.countDocuments(),
    License.countDocuments({ valid: true, status: 'active' }),
    Invoice.find({ status: 'overdue' }).populate('client').lean(),
    Invoice.find({ status: 'pending' }).lean(),
  ]);

  const paidThisMonthAgg = await Invoice.aggregate([
    {
      $match: {
        status: 'paid',
        paid_at: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  return res.json({
    success: true,
    summary: {
      clients: clientCount,
      active_licenses: activeLicenses,
      overdue_invoices: overdueInvoices,
      pending_invoices_count: pendingInvoices.length,
      revenue_this_month: paidThisMonthAgg[0]?.total || 0,
    },
  });
}));

module.exports = router;
