import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

function genSlug() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { tree, pos } = req.body;
  if (!tree || !pos) return res.status(400).json({ error: 'Missing tree or pos' });

  const slug = genSlug();
  await redis.set(`map:${slug}`, JSON.stringify({ tree, pos }));

  return res.status(200).json({ slug });
}
