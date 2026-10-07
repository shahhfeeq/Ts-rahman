// Vercel serverless function. Keeps your Anthropic API key private.
const hits = new Map();
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const ip = (req.headers['x-forwarded-for'] || 'x').split(',')[0];
  const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  if (h.length >= Number(process.env.HOURLY_LIMIT || 40)) return res.status(429).json({ error: 'Too many requests. Try again later.' });
  hits.set(ip, [...h, now]);
  const { prompt, web, imgs } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || prompt.length > 120000) return res.status(400).json({ error: 'Bad request' });
  const body = {
    model: process.env.MODEL || 'claude-sonnet-5-5',
    max_tokens: 8000,
    messages: [{ role: 'user', content: [
      ...(Array.isArray(imgs) ? imgs.slice(0, 4).map(d => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: d } })) : []),
      { type: 'text', text: prompt }
    ] }]
  };
  if (web) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }];
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const d = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: d.error?.message || 'API error' });
  const text = d.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const sources = [];
  d.content.forEach(b => (b.citations || []).forEach(c => { if (c.url && !sources.some(s => s.url === c.url)) sources.push({ title: c.title, url: c.url }); }));
  res.json({ text, sources });
}
