// POST /api/save  (cabecera x-admin-password + cuerpo JSON {cats:[...]})
// El token de GitHub vive SOLO aquí, en variables de entorno de Vercel.
const { checkPw, sleep } = require('./_auth');

const str = (v, max) => String(v ?? '').slice(0, max);
const ALLOWED_AL = new Set(['gluten','crustaceos','huevo','pescado','cacahuetes','soja','lacteos','frutos','apio','mostaza','sesamo','sulfitos','altramuces','moluscos']);

// Valida y limpia el menú recibido (nadie puede guardar basura aunque conozca la contraseña).
function sanitize(body) {
  if (!body || !Array.isArray(body.cats) || body.cats.length === 0 || body.cats.length > 40) return null;
  const cats = body.cats.map((c) => ({
    id: str(c.id, 20),
    name: str(c.name, 80),
    sub: str(c.sub, 120),
    items: (Array.isArray(c.items) ? c.items : []).slice(0, 300).map((i) => ({
      id: str(i.id, 20),
      name: str(i.name, 120),
      desc: str(i.desc, 400),
      price: str(i.price, 20),
      img: /^https?:\/\//i.test(String(i.img || '')) ? str(i.img, 500) : '',
      al: (Array.isArray(i.al) ? i.al : []).filter((a) => ALLOWED_AL.has(a)),
    })),
  }));
  return { cats };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });

  const { GITHUB_TOKEN, GITHUB_USERNAME, GITHUB_REPO, FILE_PATH = 'menu.json', GITHUB_BRANCH = 'main' } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_USERNAME || !GITHUB_REPO) return res.status(500).json({ error: 'server config' });

  if (!checkPw(req.headers['x-admin-password'])) {
    await sleep(1000); // frena la fuerza bruta
    return res.status(401).json({ error: 'unauthorized' });
  }

  const menu = sanitize(req.body);
  if (!menu) return res.status(400).json({ error: 'invalid menu' });

  const api = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${FILE_PATH}`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'la-placita-menu',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const content = Buffer.from(JSON.stringify(menu, null, 1), 'utf8').toString('base64');

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      // 1) sha más reciente
      let sha;
      const g = await fetch(`${api}?ref=${GITHUB_BRANCH}`, { headers, cache: 'no-store' });
      if (g.ok) sha = (await g.json()).sha;
      else if (g.status !== 404) return res.status(502).json({ error: 'github get ' + g.status });

      // 2) escribir
      const body = { message: 'Actualizar carta', content, branch: GITHUB_BRANCH };
      if (sha) body.sha = sha;
      const p = await fetch(api, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (p.ok) return res.status(200).json({ ok: true });
      if (p.status !== 409 && p.status !== 422) return res.status(502).json({ error: 'github put ' + p.status });
      // 409/422 → conflicto de sha: un reintento con sha nuevo
    }
    return res.status(409).json({ error: 'conflict' });
  } catch (e) {
    return res.status(502).json({ error: 'save failed' });
  }
};
