const API_BASE = window.location.origin;

async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  // Un 401 en /admin/login o /admin/login/2fa solo significa "credenciales
  // (o código) incorrectos", no una sesión expirada — no debe redirigir,
  // debe dejar que el mensaje real llegue y quedarse en el formulario.
  const isLoginPath = path === '/admin/login' || path === '/admin/login/2fa';
  if (res.status === 401 && !isLoginPath) {
    window.location.href = '/admin-ui/index.html';
    throw new Error('No autorizado');
  }
  if (!res.ok) {
    throw new Error((data && data.message) || `Error ${res.status}`);
  }
  return data;
}

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtMoney(amount, currency) {
  if (amount === undefined || amount === null) return '—';
  return `${(currency || 'USD')} ${Number(amount).toFixed(2)}`;
}

async function requireAdminSession() {
  try {
    await apiFetch('/admin/me');
  } catch (e) {
    window.location.href = '/admin-ui/index.html';
    throw e;
  }
}

async function logout() {
  await apiFetch('/admin/logout', { method: 'POST' });
  window.location.href = '/admin-ui/index.html';
}

const STATUS_LABELS = {
  active: 'Activa', pending: 'Pendiente', suspended: 'Suspendida', expired: 'Expirada',
  blocked: 'Bloqueada',
  paid: 'Pagada', overdue: 'Vencida', cancelled: 'Cancelada',
  new: 'Nuevo', read: 'Leído', archived: 'Archivado',
  draft: 'Borrador', published: 'Publicado',
  operational: 'Operacional', degraded: 'Degradado', outage: 'Interrupción',
  investigating: 'Investigando', identified: 'Identificado', monitoring: 'Monitoreando', resolved: 'Resuelto',
};

function statusBadge(status) {
  const label = STATUS_LABELS[status] || status || '—';
  return `<span class="badge ${status || 'pending'}">${label}</span>`;
}

async function withBusy(button, fn) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Guardando…';
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}
