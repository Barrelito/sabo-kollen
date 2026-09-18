import { getRuntime } from './runtime.js';

export async function vercelHandler(req, res) {
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  let body = req.body && typeof req.body === 'object' ? req.body : {};
  if (typeof req.body === 'string') { try { body = JSON.parse(req.body); } catch { body = {}; } }
  const result = await getRuntime().handle({ method: req.method, url: new URL(req.url, `${protocol}://${host}`).href, headers: req.headers, body });
  for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
  res.status(result.status).json(result.body);
}
