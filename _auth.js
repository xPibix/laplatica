// Archivo auxiliar (el "_" evita que Vercel lo publique como endpoint).
const crypto = require('crypto');
const SALT = 'laplacita:'; // debe ser igual que SALT en index.html

// Compara SHA-256(SALT + contraseña) con ADMIN_PASS_SHA (variable de entorno).
function checkPw(pw) {
  if (typeof pw !== 'string' || !pw || pw.length > 100) return false;
  const given = Buffer.from(crypto.createHash('sha256').update(SALT + pw).digest('hex'));
  const real = Buffer.from(String(process.env.ADMIN_PASS_SHA || '').toLowerCase());
  return given.length === real.length && crypto.timingSafeEqual(given, real);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { checkPw, sleep };
