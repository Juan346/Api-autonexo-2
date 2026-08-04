Key Validator API (Node + Mongoose)

Requisitos:
- Node.js 16+
- MongoDB en ejecución (local o remoto)

Instalación:

```bash
cd key_validator_api
npm install
```

Variables de entorno (opcional):
- `MONGODB_URI` (por defecto `mongodb://127.0.0.1:27017/license_db`)
- `PORT` (por defecto `4000`)
- `TRUST_PROXY` (número de saltos de proxy reverso, por defecto sin confiar en
  ninguno) — poner `1` SOLO si el servicio corre detrás de un proxy reverso
  propio (nginx, Cloudflare, etc.) que controla el header `X-Forwarded-For`.
  Esto afecta qué IP ve la lista de IPs permitidas (ver "Seguridad de red" más
  abajo). Nunca uses `true`: es una confianza permisiva (cualquier cantidad de
  saltos) que permite falsificar la IP de origen, y el límite de intentos de
  login del panel la rechaza por insegura.

Ejecutar en desarrollo:

```bash
npm run dev
```

Ejecutar en producción:

```bash
npm start
```

Uso:
- `POST /validate` con JSON `{ "key": "..." }` devuelve `{ valid: true|false, license, message }`.
- `POST /licenses` para crear una nueva licencia.
- `GET /pricing` (público, sin caché) → lista los planes con `slug` definido,
  igual que `GET /account/plans` pero pensado para `home/index.html` (la
  página de marketing, sin sesión). Vive en su propia ruta a propósito: no
  bajo `/account` (ese nombre sugiere que hace falta login, aunque no lo
  necesita) ni bajo `/plans` (que cae en el candado de IP del panel admin —
  ver `adminIpGate` en `index.js` — y bloquearía a cualquier visitante fuera
  de esa lista).

Portal de cuenta (home/app.html)
---------------------------------
`home/app.html` (login / registro / dashboard con plan y clave de API) es un
sitio estático que consume esta misma API con un juego de rutas **públicas**
separadas del admin, autenticadas con un Bearer token (no cookie, para no
depender de que el sitio y la API compartan origen):

- `POST /account/register` `{ name, workshop, email, password, trial_device_id }`
  → crea el `Client`, una `License` de prueba de 14 días y devuelve
  `{ token, account }`. `trial_device_id` es una cookie propia del sitio
  (no de esta API) que `home/app.js` genera y reenvía; junto con la IP de la
  petición, se usa para bloquear una segunda prueba gratis desde el mismo
  dispositivo o red (ver "Antiabuso de pruebas gratis" abajo).
- `POST /account/login` `{ email, password }` → `{ token, account }`.
- `GET /account/me` (header `Authorization: Bearer <token>`) → `{ account }`.
- `POST /account/api-key/regenerate` → regenera la `key` de la licencia del
  cliente autenticado.
- `GET /account/plans` (público) → lista los planes con `slug` definido
  (`{ slug, name, price, currency, billing_cycle, description, max_users,
  max_vehicles, max_sites }`), para que el selector de planes del dashboard
  muestre precios reales en vez de HTML hardcodeado.
- `POST /account/plan` `{ plan: "esencial" | "profesional" }` → **NO activa
  nada**: Autonexo se instala por taller, no es self-service de un clic. Solo
  guarda `requested_plan` / `requested_plan_at` en el `Client` (visible en
  `/admin-ui/clients.html`, columna "Interés en plan") para que el equipo se
  comunique y coordine la prueba y la instalación. El admin asigna el plan
  real a la licencia a mano desde `/admin-ui/licenses.html` cuando la
  instalación queda lista.

Antes de que el selector de planes funcione, sembra los planes `esencial` y
`profesional` que `GET /account/plans` expone:

```bash
node seed.js
```

Límites y moderación de licencias
-----------------------------------
Cada `License` (y cada `Plan`) tiene `max_sites` (cantidad de sedes/sucursales
que cubre), además de los ya existentes `max_users` y `max_vehicles`. Se
autocompleta al elegir un plan en `/admin-ui/licenses.html` y queda guardado
en la licencia — hoy es informativo (nadie en este servicio cuenta cuántas
sedes tiene realmente configuradas una instalación; eso vive en la base de
datos de cada taller, no aquí), pero le da al admin un límite de referencia
para conversaciones de ventas/soporte y para futura validación.

Además del ciclo de vida normal (`pending` → `active`, y `suspended` cuando
`lib/billing.js` detecta una factura vencida más allá del periodo de gracia),
`status` acepta `blocked`: una acción manual del equipo desde
`/admin-ui/licenses.html` (botón "Bloquear") para casos de moderación —
uso indebido, disputa, lo que sea — **distinta de una suspensión por mora**.
La diferencia importa porque la suspensión por mora se revierte sola cuando
`POST /invoices/:id/mark-paid` confirma el pago; `blocked` nunca se revierte
solo, ni por un pago ni por la lógica de facturación vencida — solo un admin
la desbloquea a mano. La validación pública (`POST /validate`) ya trata
cualquier `status` distinto de `active` como licencia no válida, así que
bloquear una licencia corta el acceso en el siguiente check-in periódico de
la instalación (`LICENSE_CHECK_INTERVAL_MINUTES` en la app Flask), sin
cambios adicionales.

Antiabuso de pruebas gratis
----------------------------
`POST /account/register` rechaza con `409 { code: "trial_already_claimed" }`
si la IP de la petición o la cookie `anx_tid` (puesta por `home/app.js`, no
por esta API) ya aparecen en la colección `TrialClaim` de un registro
anterior. Limitaciones a tener en cuenta: IPs compartidas (oficinas, redes
móviles con CGNAT) pueden bloquear a alguien legítimo, y alguien decidido a
abusar puede limpiar cookies + cambiar de red para evadirlo — es una
fricción razonable, no una prueba de identidad. Si un cliente legítimo queda
bloqueado, un admin puede borrar el `TrialClaim` correspondiente directamente
en Mongo (no hay UI para esto todavía).

Y para que el navegador pueda llamar a esta API desde el origen donde sirvas
`home/` (que normalmente NO es el mismo origen que esta API, a diferencia de
`/admin-ui`), configura `CORS_ORIGIN` en tu `.env` con ese origen, o agrega
una regla de tipo `origin` desde `/admin-ui/security.html`. Sin esto el
navegador bloqueará las peticiones desde `home/app.html` aunque el servidor
esté corriendo.

Integración con la app Flask:
- Añade en tu `.env` de Flask `LICENSE_API_URL=http://localhost:4000/validate` (o la URL pública del servicio).
- La app Flask corre un job en segundo plano (cada `LICENSE_CHECK_INTERVAL_MINUTES`
  minutos, por defecto 10) que consulta este endpoint y sincroniza el estado local
  de su licencia — así una suspensión o reactivación hecha desde este panel se
  refleja automáticamente en la instalación del taller sin acción manual.

Seguridad de red
-----------------
Desde el panel admin (`/admin-ui/security.html`) se puede:
- Restringir qué **dominios** pueden llamar a esta API desde un navegador (CORS).
- Restringir qué **IPs o rangos** (solo IPv4, ej. `203.0.113.0/24`) pueden acceder
  al panel admin y/o a `POST /validate`, con una restricción activable/desactivable
  (`ip_allowlist_enabled`, apagada por defecto).
- Todo esto ocurre a nivel de aplicación (Express valida cada petición) — el panel
  **nunca ejecuta comandos del sistema operativo ni toca `ufw`/firewalls reales**.
  Si además quieres una capa a nivel de sistema operativo, la propia página de
  Seguridad genera como referencia los comandos `ufw` correspondientes a tus reglas
  configuradas, para que los ejecutes tú mismo manualmente en el servidor.
- La página de Seguridad (`/security/*`) queda siempre accesible con una sesión de
  admin válida, incluso si la restricción de IP está activa y tu IP cambió — es la
  vía de escape para corregir la configuración sin necesitar acceso directo a la
  base de datos.

Usando Docker / docker-compose
--------------------------------
Se incluye un `docker-compose.yml` en la raíz del repositorio para levantar MongoDB y el validador juntos.

Arrancar los servicios:

```bash
docker-compose up -d --build
```

Comprobar logs del validador:

```bash
docker-compose logs -f key-validator
```

Parar y eliminar contenedores:

```bash
docker-compose down
```
