const { Redis } = require('@upstash/redis');
const { requireAuth } = require('../lib/auth');

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN
});

module.exports = async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return; // requireAuth ya respondió 401

  try {
    if (req.method === 'GET') {
      if (req.query.all) {
        const keys = await redis.keys('entries:*');
        const months = {};
        for (const key of keys) {
          months[key.slice('entries:'.length)] = (await redis.get(key)) || [];
        }
        return res.status(200).json({ months });
      }
      const month = req.query.month;
      if (!month) return res.status(400).json({ error: 'Falta el parámetro month' });
      const entries = (await redis.get('entries:' + month)) || [];
      return res.status(200).json({ entries });
    }

    if (req.method === 'POST') {
      const { month, entries } = req.body || {};
      if (!month || !Array.isArray(entries)) {
        return res.status(400).json({ error: 'Faltan datos (month, entries)' });
      }
      await redis.set('entries:' + month, entries);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error accediendo a la base de datos' });
  }
};
