const express = require('express');
const License = require('../models/License');
const { applyOverdueSuspension } = require('../lib/billing');
const { ipAllowlistFor } = require('../middleware/accessControl');

const router = express.Router();

router.post('/validate', ipAllowlistFor('validate'), async (req, res) => {
  try {
    const key = (req.body.key || '').trim();
    if (!key) return res.status(400).json({ valid: false, message: 'Key requerida' });

    let lic = await License.findOne({ key });
    if (!lic) return res.status(404).json({ valid: false, message: 'Licencia no encontrada' });

    lic = await applyOverdueSuspension(lic);

    const now = new Date();
    let isActive = !!lic.valid && lic.status === 'active';
    if (lic.expiration_date && new Date(lic.expiration_date) < now) isActive = false;

    return res.json({ valid: isActive, license: lic.toObject(), message: isActive ? 'Licencia válida' : 'Licencia no activa' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ valid: false, message: 'Error del servidor' });
  }
});

module.exports = router;
