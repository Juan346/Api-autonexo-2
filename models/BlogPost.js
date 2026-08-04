const mongoose = require('mongoose');

// Contenido en HTML libre (no Markdown): igual que Plan.description, es
// texto de confianza que solo el admin autenticado puede escribir — se
// inyecta tal cual en el detalle del post (ver home/post.html), sin pasar
// por un parser de Markdown que esta API no tiene motivo para cargar.
const blogPostSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
  excerpt: { type: String, trim: true },
  content_html: { type: String, default: '' },
  tag: { type: String, trim: true, default: 'Actualización' },
  author_name: { type: String, trim: true, default: 'Equipo Autonexo' },
  author_role: { type: String, trim: true, default: '' },
  author_avatar_url: { type: String, trim: true, default: '' },
  cover_image_url: { type: String, trim: true, default: '' },
  read_minutes: { type: Number, default: 3 },
  status: { type: String, enum: ['draft', 'published'], default: 'draft' },
  published_at: { type: Date },
  // Traducción al inglés resuelta una vez al guardar (ver lib/translate.js
  // + routes/blog.js), mismo criterio que Plan.name_en en key_validator_api
  // — el visitante que le da clic a "Traducir" en post.html solo lee estos
  // campos ya cacheados, nunca dispara una traducción en vivo.
  title_en: String,
  excerpt_en: String,
  content_html_en: String,
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('BlogPost', blogPostSchema);
