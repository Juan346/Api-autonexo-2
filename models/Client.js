const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  contact_name: String,
  email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
  phone: String,
  address: String,
  notes: String,
  // Presente solo en clientes que se auto-registraron desde el portal de
  // cuenta (home/app.html) vía POST /account/register. Los clientes creados
  // a mano desde el panel admin no tienen contraseña y no pueden iniciar
  // sesión en el portal hasta que se les asigne una.
  password_hash: String,
  // Un cliente eligió "Seleccionar" un plan de pago desde el portal de
  // cuenta (POST /account/plan). Esto NO activa el plan por sí solo — solo
  // deja constancia para que el equipo se comunique y haga la instalación
  // manualmente (ver routes/account.js).
  requested_plan: String,
  requested_plan_at: Date,
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('Client', clientSchema);
