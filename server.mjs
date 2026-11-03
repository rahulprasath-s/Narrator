import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SCRIPT_INSTRUCTIONS, extractScript } from './prompt.mjs';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
]);
const fail = (status, message) => Object.assign(new Error(message), { status });

export function createApp({ apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_MODEL || 'gpt-5.4-mini', fetchImpl = fetch } = {}) {
  let busy = false;
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    let acquired = false;
    try {
      const host = req.headers.host || '';
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) throw fail(403, 'Local access only.');
      if (req.headers.origin && req.headers.origin !== `http://${host}`) throw fail(403, 'Use the local Narrator app to make requests.');
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/api/status' && req.method === 'GET') return json(200, { configured: Boolean(apiKey) });
      if (pathname === '/api/translate' && req.method === 'POST') {
        if (!(req.headers['content-type'] || '').startsWith('application/json')) throw fail(415, 'Send source text as JSON.');
        let body = '';
        req.setEncoding('utf8');
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 200_000) throw fail(413, 'This passage is too large. Use at most forty thousand characters.');
        }
        let input;
        try { input = JSON.parse(body); } catch { throw fail(400, 'The request could not be read.'); }
        if (typeof input?.text !== 'string' || !input.text.trim()) throw fail(400, 'Paste a passage first.');
        if (input.text.length > 40_000) throw fail(413, 'Use at most forty thousand characters per passage.');
        if (!apiKey) throw fail(503, 'Add OPENAI_API_KEY to your .env file and restart Narrator to generate a script. You can try the sample without a key.');
        if (busy) throw fail(429, 'A script is already being generated. Please wait for it to finish.');
        busy = acquired = true;
        const upstream = await fetchImpl('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, store: false, instructions: SCRIPT_INSTRUCTIONS, input: [{ role: 'user', content: [{ type: 'input_text', text: input.text.trim() }] }], max_output_tokens: 14000 }),
          signal: AbortSignal.timeout(180_000),
        });
        if (!upstream.ok) {
          if (upstream.status === 401) throw fail(502, 'The AI provider rejected the API key. Check the server configuration.');
          if (upstream.status === 429) throw fail(429, 'The AI provider is at its usage limit. Check your quota or try again later.');
          throw fail(502, 'The AI provider could not generate a script. Check the configured model or try again later.');
        }
        let script;
        try { script = extractScript(await upstream.json()); } catch (error) { throw fail(502, error.message); }
        return json(200, { script });
      }
      if (req.method === 'GET' && assets.has(pathname)) {
        const [file, type] = assets.get(pathname);
        const data = await readFile(new URL(`./public/${file}`, import.meta.url));
        res.writeHead(200, { 'Content-Type': type }); res.end(data); return;
      }
      json(404, { error: 'Not found.' });
    } catch (error) {
      const timeout = error.name === 'TimeoutError';
      json(error.status || (timeout ? 504 : 500), { error: error.status ? error.message : timeout ? 'Generation took too long. Try a shorter passage.' : 'Something went wrong. Please try again.' });
    } finally { if (acquired) busy = false; }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT || 3000);
  createApp().listen(port, '127.0.0.1', () => console.log(`Narrator is ready at http://127.0.0.1:${port}`));
}
