// GET /api/load           → menú para los clientes (caché en la red de Vercel, 15 s)
// GET /api/load?admin=true → menú recién sacado de GitHub, sin caché (requiere contraseña)
const { checkPw, sleep } = require('./_auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ error: 'method' });

  const { GITHUB_TOKEN, GITHUB_USERNAME, GITHUB_REPO, FILE_PATH = 'menu.json', GITHUB_BRANCH = 'main' } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_USERNAME || !GITHUB_REPO) return res.status(500).json({ error: 'server config' });

  const admin = req.query.admin === 'true';
  if (admin && !checkPw(req.headers['x-admin-password'])) {
    await sleep(1000);
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const url = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${FILE_PATH}?ref=${GITHUB_BRANCH}`;
    const r = await fetch(url, {
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.raw+json',
        'User-Agent': 'la-placita-menu',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    // Caché: clientes → borde de Vercel; admin → nunca.
    const cache = admin ? 'no-store' : 'public, max-age=0, s-maxage=15, stale-while-revalidate=60';

    if (r.status === 404) { // primer arranque: aún no existe menu.json → el frontend usa el menú por defecto
      res.setHeader('Cache-Control', admin ? 'no-store' : 'public, max-age=0, s-maxage=10');
      return res.status(200).json({ cats: [] });
    }
    if (!r.ok) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(502).json({ error: 'github ' + r.status });
    }
    const menu = JSON.parse(await r.text());
    res.setHeader('Cache-Control', cache);
    return res.status(200).json(menu);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'load failed' });
  }
};
