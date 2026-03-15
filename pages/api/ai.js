const rateMap = new Map();

function getRateKey(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
}

function isRateLimited(ip) {
  const now = Date.now();
  const window = 60_000; // 1 minute
  const limit = 10;      // max 10 requests per minute per IP

  if (!rateMap.has(ip)) { rateMap.set(ip, []); }
  const times = rateMap.get(ip).filter(t => now - t < window);
  times.push(now);
  rateMap.set(ip, times);

  // cleanup old IPs every 1000 requests
  if (rateMap.size > 1000) {
    for (const [key, val] of rateMap) {
      if (val.every(t => now - t > window)) rateMap.delete(key);
    }
  }

  return times.length > limit;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const ip = getRateKey(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: { message: "Слишком много запросов. Подождите минуту." } });
  }

  // Block oversized requests
  const body = req.body;
  const bodyStr = JSON.stringify(body);
  if (bodyStr.length > 20000) {
    return res.status(413).json({ error: { message: "Запрос слишком большой." } });
  }

  // Only allow haiku model
  if (body.model && !body.model.includes("haiku")) {
    return res.status(403).json({ error: { message: "Модель не разрешена." } });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
      },
      body: bodyStr,
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
}