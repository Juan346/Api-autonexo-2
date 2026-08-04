// Traducción ES->EN "mejor esfuerzo" para texto libre que un admin escribe
// en el panel (nombre, descripción, features de un Plan). Se llama UNA vez
// al guardar el plan (ver routes/plans.js) y el resultado se cachea en el
// propio documento — los visitantes en inglés nunca disparan esta llamada,
// solo leen el campo _en ya resuelto.
//
// Usa MyMemory (api.mymemory.translated.net), gratis y sin API key, en el
// mismo espíritu que ipapi.co en home/script.js: un servicio externo de
// referencia, no crítico — si falla, se degrada mostrando el texto en
// español tal cual (ver el fallback en cada _en en routes/plans.js), nunca
// se bloquea el guardado del plan por esto.
const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const TIMEOUT_MS = 6000;

function extractNumbers(text) {
  return String(text).match(/\d+/g) || [];
}

async function translateEsToEn(text) {
  const clean = String(text || '').trim();
  if (!clean) return null;

  try {
    const url = `${MYMEMORY_URL}?q=${encodeURIComponent(clean)}&langpair=es|en`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;

    const data = await res.json();
    const translated = data && data.responseData && data.responseData.translatedText;
    if (!translated || data.responseStatus !== 200) return null;

    // Salvavidas barato contra una falla real y observada del servicio: en
    // frases cortas tipo "N <sustantivo> máximo(s)" a veces se "come" el
    // número (ej. "2 usuarios máximos" -> "maximum users", sin el 2). Un
    // límite mal traducido en una página de precios es peor que dejarlo en
    // español, así que si el original tiene números y no TODOS sobreviven
    // en la traducción, se descarta el resultado.
    const sourceNumbers = extractNumbers(clean);
    if (sourceNumbers.length && !sourceNumbers.every((n) => translated.includes(n))) {
      return null;
    }

    return translated;
  } catch (err) {
    return null;
  }
}

// Traduce varios textos en paralelo. Devuelve un array del mismo largo,
// alineado por índice; cualquier entrada que falle queda en null (el que
// llama decide el fallback — normalmente, usar el texto original).
async function translateManyEsToEn(texts) {
  return Promise.all(texts.map(translateEsToEn));
}

module.exports = { translateEsToEn, translateManyEsToEn };
