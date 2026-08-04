require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET no está configurado. Define un valor en .env antes de iniciar el servidor.');
  process.exit(1);
}
if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD_HASH) {
  console.warn('ADMIN_USER / ADMIN_PASSWORD_HASH no configurados: el panel admin no permitirá iniciar sesión hasta configurarlos (ver scripts/hash-password.js).');
}

const { ipAllowlistFor, corsOriginResolver } = require('./middleware/accessControl');

const app = express();
// TRUST_PROXY = número de saltos de proxy reverso de confianza delante de
// este servicio (ej. "1" para un solo nginx delante). NUNCA usar un booleano
// "true" aquí: eso significa "confiar en cualquier cantidad de saltos", lo
// que permite falsificar la IP de origen encadenando X-Forwarded-For falsos
// — express-rate-limit (usado en el login) directamente rechaza esa
// configuración por insegura. Sin proxy real delante, se deja en false (no
// confiar en X-Forwarded-For en absoluto).
const trustProxyHops = parseInt(process.env.TRUST_PROXY, 10);
app.set('trust proxy', trustProxyHops > 0 ? trustProxyHops : false);
app.use(cors({ origin: corsOriginResolver, credentials: true }));
app.use(express.json());
app.use(cookieParser());

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection (revisa que la ruta use asyncHandler):', err);
});

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/license_db';
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

app.get('/', (req, res) => res.json({ ok: true, message: 'Key Validator API' }));

const adminIpGate = ipAllowlistFor('admin');
// /security queda deliberadamente FUERA de este gate (sigue protegido por
// requireAdmin/JWT dentro de su propio router): si se quedara detrás del
// mismo candado que administra, un admin cuya IP cambie después de activar
// la restricción no tendría forma de entrar a corregirla sin acceso directo
// a la base de datos.
app.use(['/admin', '/clients', '/plans', '/invoices', '/dashboard', '/licenses'], adminIpGate);

app.use('/admin', require('./routes/adminAuth'));
app.use('/clients', require('./routes/clients'));
app.use('/plans', require('./routes/plans'));
app.use('/invoices', require('./routes/invoices'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/licenses', require('./routes/licenses')); // GET/POST /licenses (admin)
app.use('/security', require('./routes/security')); // lista de IPs/orígenes permitidos (admin)
app.use('/account', require('./routes/account')); // register/login/me/api-key/plan (público, portal de cuenta)
app.use('/pricing', require('./routes/pricing')); // GET público, sin caché — precios reales para home/index.html
app.use('/contact', require('./routes/contact')); // POST público (formulario de contacto) + GET/PUT/DELETE admin
app.use('/blog', require('./routes/blog')); // GET público (posts publicados) + CRUD admin
app.use('/status', require('./routes/status')); // GET público (estado del sistema) + CRUD admin
app.use('/', require('./routes/validate')); // POST /validate (público, contrato existente)

app.use('/admin-ui', express.static(path.join(__dirname, 'public', 'admin')));

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Ruta no encontrada' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || (err.name === 'ValidationError' ? 400 : 500);
  res.status(status).json({ success: false, message: err.message || 'Error interno del servidor' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Key Validator API listening on port ${PORT}`));
