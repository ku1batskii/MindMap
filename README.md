# Mind Map

AI-powered mind map from stream of consciousness.

## Deploy to Vercel

1. Push this folder to a GitHub repo
2. Go to vercel.com → New Project → import your repo
3. In Vercel dashboard → Settings → Environment Variables:
   - Add `ANTHROPIC_API_KEY` = your key from console.anthropic.com
4. Deploy

## Local dev

```bash
npm install
cp .env.example .env.local
# paste your key into .env.local
npm run dev
```

## Cost

Uses claude-haiku — ~$0.25 per 1M input tokens.
Typical session (20 requests × 500 tokens) ≈ $0.003
