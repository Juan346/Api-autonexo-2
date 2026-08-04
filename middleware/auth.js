const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = 'autonexo_admin_token';

function signAdminToken(username) {
  return jwt.sign({ sub: username, role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
}

function requireAdmin(req, res, next) {
  const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
  if (!token) {
    return res.status(401).json({ success: false, message: 'No autorizado' });
  }
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Sesión inválida o expirada' });
  }
}

// Token intermedio de vida corta para el segundo paso del login cuando 2FA
// está activo: usuario+contraseña correctos NO alcanzan para abrir sesión
// todavía, solo habilitan pedir el código de la app autenticadora (ver
// POST /admin/login/2fa en routes/adminAuth.js). El role distinto
// ('admin_pending_2fa') evita que este token, si se filtrara, sirva para
// nada más que ese único paso — nunca pasa requireAdmin.
function signPending2faToken(username) {
  return jwt.sign({ sub: username, role: 'admin_pending_2fa' }, JWT_SECRET, { expiresIn: '5m' });
}

function verifyPending2faToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  if (payload.role !== 'admin_pending_2fa') throw new Error('rol inválido para este token');
  return payload;
}

// Sesión de cliente (portal de cuenta en home/app.html) — deliberadamente
// separada de la sesión admin: distinto claim `role`, y transportada como
// Bearer token en vez de cookie httpOnly. El portal es un sitio estático que
// puede vivir en un origen distinto al de esta API (a diferencia de
// /admin-ui, que esta misma API sirve same-origin), así que una cookie con
// SameSite=Lax no viajaría de forma fiable en peticiones cross-site; un
// Bearer token evita ese problema sin depender de la topología de despliegue.
function signCustomerToken(clientId) {
  return jwt.sign({ sub: String(clientId), role: 'customer' }, JWT_SECRET, { expiresIn: '30d' });
}

function requireCustomer(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ success: false, message: 'No autorizado' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'customer') throw new Error('rol inválido para este token');
    req.customerId = payload.sub;
    return next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Sesión inválida o expirada' });
  }
}

module.exports = {
  signAdminToken, requireAdmin, COOKIE_NAME, signCustomerToken, requireCustomer,
  signPending2faToken, verifyPending2faToken,
};
