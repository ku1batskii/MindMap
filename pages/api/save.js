import { createClient } from 'redis';

function generateSlug() {
  return Math.random().toString(36).substring(2, 8);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { tree, pos } = req.body;
  if (!tree) return res.status(400).json({ error: 'No tree data' });

  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();

  const slug = generateSlug();
  await client.set('map:' + slug, JSON.stringify({ tree, pos }));
  await client.disconnect();

  return res.status(200).json({ slug });
}
