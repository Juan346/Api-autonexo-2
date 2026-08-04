const express = require('express');
const BlogPost = require('../models/BlogPost');
const { requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { translateManyEsToEn } = require('../lib/translate');

const router = express.Router();

// Rango de marcas diacríticas combinantes (U+0300–U+036F), construido con
// fromCharCode para no depender de escribir caracteres no-ASCII literales
// en el código fuente — mismo patrón que DIACRITICS_RE en home/docs.js.
const DIACRITICS_RE = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');

function normalizeSlug(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(DIACRITICS_RE, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const LIST_FIELDS = 'title slug excerpt tag author_name author_avatar_url cover_image_url read_minutes published_at';

// Traduce content_html bloque por bloque (cada <p>, <h2-6>, <li> o
// <blockquote>, sin importar si está envuelto en un <div> de figura
// personalizada u otro contenedor) en vez de mandar el HTML entero al
// traductor, que lo destrozaría (etiquetas incluidas como si fueran
// palabras). Un bloque que tiene OTRA etiqueta anidada DENTRO de sí mismo
// (ej. un <a> o <b> en medio del texto) se deja intacto en español —
// traducir alrededor de marcado inline es más riesgo de romperlo que valor
// real, y sigue siendo texto legible aunque quede sin traducir.
const BLOCK_RE = /<(p|h[1-6]|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
const HAS_NESTED_TAG_RE = /<[a-z]/i;

async function translateContentHtml(html) {
  const raw = String(html || '');
  const blocks = [];
  let match;
  BLOCK_RE.lastIndex = 0;
  while ((match = BLOCK_RE.exec(raw)) !== null) {
    blocks.push({ full: match[0], inner: match[2] });
  }

  const translatable = blocks.filter((b) => b.inner.trim() && !HAS_NESTED_TAG_RE.test(b.inner));
  if (!translatable.length) return raw;

  const translated = await translateManyEsToEn(translatable.map((b) => b.inner));

  let result = raw;
  translatable.forEach((b, i) => {
    const translatedInner = translated[i] || b.inner;
    const newBlock = b.full.replace(b.inner, translatedInner);
    result = result.replace(b.full, newBlock);
  });
  return result;
}

// Traduce título/extracto/contenido en paralelo, con fallback al español
// campo por campo si una traducción puntual falla — mismo criterio que
// buildTranslatedFields en routes/plans.js.
async function buildTranslatedPost(title, excerpt, content_html) {
  const [titleEn, excerptEn, contentEn] = await Promise.all([
    translateManyEsToEn([title]).then((r) => r[0]),
    excerpt ? translateManyEsToEn([excerpt]).then((r) => r[0]) : Promise.resolve(null),
    translateContentHtml(content_html),
  ]);
  return {
    title_en: titleEn || title,
    excerpt_en: excerptEn || excerpt || '',
    content_html_en: contentEn,
  };
}

// -------- Público --------

router.get('/', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const posts = await BlogPost.find({ status: 'published' })
    .sort({ published_at: -1 })
    .select(LIST_FIELDS)
    .lean();
  return res.json({ success: true, posts });
}));

// Antes de /:slug para que un post con slug "admin" (si algún día existe)
// no le gane a esta ruta fija.
router.get('/admin/list', requireAdmin, asyncHandler(async (req, res) => {
  const posts = await BlogPost.find().sort({ created_at: -1 }).lean();
  return res.json({ success: true, posts });
}));

router.get('/:slug', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const post = await BlogPost.findOne({ slug: req.params.slug.toLowerCase(), status: 'published' }).lean();
  if (!post) return res.status(404).json({ success: false, message: 'Post no encontrado' });
  return res.json({ success: true, post });
}));

// -------- Admin --------

router.post('/', requireAdmin, asyncHandler(async (req, res) => {
  const { title, excerpt, content_html, tag, author_name, author_role, author_avatar_url, cover_image_url, read_minutes, status } = req.body || {};
  if (!title) return res.status(400).json({ success: false, message: 'El título es obligatorio' });

  const slug = normalizeSlug(req.body && req.body.slug) || normalizeSlug(title);
  if (!slug) return res.status(400).json({ success: false, message: 'No se pudo generar un slug válido' });

  const publish = status === 'published';
  const translated = await buildTranslatedPost(title, excerpt, content_html);
  const post = new BlogPost({
    title, slug, excerpt, content_html, tag, author_name, author_role, author_avatar_url, cover_image_url,
    read_minutes: read_minutes || 3,
    status: publish ? 'published' : 'draft',
    published_at: publish ? new Date() : undefined,
    ...translated,
  });

  try {
    await post.save();
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Ya existe un post con ese slug' });
    }
    throw err;
  }
  return res.status(201).json({ success: true, post });
}));

router.put('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const existing = await BlogPost.findById(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: 'Post no encontrado' });

  const { title, excerpt, content_html, tag, author_name, author_role, author_avatar_url, cover_image_url, read_minutes, status } = req.body || {};
  const update = { title, excerpt, content_html, tag, author_name, author_role, author_avatar_url, cover_image_url, read_minutes };

  const slug = normalizeSlug(req.body && req.body.slug);
  if (slug) update.slug = slug;

  // El form de admin siempre manda title/excerpt/content_html juntos en
  // cada guardado, así que re-traducir en cada PUT es simple y correcto
  // (mismo criterio que routes/plans.js).
  if (title) {
    Object.assign(update, await buildTranslatedPost(
      title,
      excerpt !== undefined ? excerpt : existing.excerpt,
      content_html !== undefined ? content_html : existing.content_html
    ));
  }

  // Publicar por primera vez fija published_at "ahora"; si ya estaba
  // publicado y se vuelve a guardar, la fecha original no se mueve — no
  // tiene sentido que un post "salte" al tope del blog solo por editarle
  // una coma.
  if (status === 'published' || status === 'draft') {
    update.status = status;
    if (status === 'published' && !existing.published_at) update.published_at = new Date();
  }

  let post;
  try {
    post = await BlogPost.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Ya existe un post con ese slug' });
    }
    throw err;
  }
  return res.json({ success: true, post });
}));

router.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const post = await BlogPost.findByIdAndDelete(req.params.id);
  if (!post) return res.status(404).json({ success: false, message: 'Post no encontrado' });
  return res.json({ success: true });
}));

module.exports = router;
