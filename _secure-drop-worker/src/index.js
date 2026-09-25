// douglas.lol secure message drop.
//   POST /send                  public: {m: armored PGP message}. Must be encrypted to Robert's key.
//   GET  /admin/challenge       a signed, time-limited challenge for the inbox to sign
//   POST /admin/login           {challenge, mac, signature}: signature by Robert's key → session token
//   GET  /admin/messages        (session) every message, still encrypted
//   POST /admin/messages/:id    (session) {status: new | read | archived}. Nothing is ever deleted.
import * as openpgp from 'openpgp';
import { EmailMessage } from 'cloudflare:email';
import PUBLIC_KEY from './public-key.asc';

const MAX_BYTES = 200_000;         // armored ciphertext; ~140 KB of text
const PER_SENDER_PER_DAY = 10;
const ALL_PER_DAY = 500;
const CHALLENGE_TTL = 5 * 60;      // seconds
const SESSION_TTL = 12 * 3600;

let keyPromise;
const publicKey = () => (keyPromise ||= openpgp.readKey({ armoredKey: PUBLIC_KEY }));

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmac(secret, text) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', k, enc.encode(text)));
}
async function sha(text) { return b64u(await crypto.subtle.digest('SHA-256', enc.encode(text))); }
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const now = () => Math.floor(Date.now() / 1000);
function ref() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(8));
  return [...r].map((x, i) => (i === 4 ? '-' : '') + c[x % c.length]).join('');
}

function cors(req, env) {
  const o = req.headers.get('Origin') || '';
  const ok = env.ALLOWED_ORIGINS.split(',').includes(o);
  return ok ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : { Vary: 'Origin' };
}
const json = (h, body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...h, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function send(req, env, h, ctx) {
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > MAX_BYTES + 1000) return json(h, { error: 'Message is too long.' }, 413);
  let body; try { body = await req.json(); } catch { return json(h, { error: 'Bad request.' }, 400); }
  const m = typeof body.m === 'string' ? body.m.trim() : '';
  if (!m || m.length > MAX_BYTES) return json(h, { error: m ? 'Message is too long.' : 'Empty message.' }, 400);
  if (!m.startsWith('-----BEGIN PGP MESSAGE-----') || !m.endsWith('-----END PGP MESSAGE-----')) return json(h, { error: 'Not an encrypted message.' }, 400);
  // Only accept messages locked to Robert's encryption key: no plaintext, nothing for anyone else.
  try {
    const key = await publicKey(), mine = (await key.getEncryptionKey()).getKeyID().toHex();
    const msg = await openpgp.readMessage({ armoredMessage: m });
    if (!msg.getEncryptionKeyIDs().some((k) => k.toHex() === mine)) return json(h, { error: 'Not encrypted to this inbox.' }, 400);
  } catch { return json(h, { error: 'Not an encrypted message.' }, 400); }

  const day = new Date().toISOString().slice(0, 10);
  const who = 'ip:' + (await sha((req.headers.get('CF-Connecting-IP') || 'unknown') + '|' + day + '|' + env.SESSION_SECRET)).slice(0, 32);
  const hit = async (k) => (await env.DB.prepare('INSERT INTO hits (k, d, n) VALUES (?1, ?2, 1) ON CONFLICT (k) DO UPDATE SET n = n + 1 RETURNING n').bind(k, day).first('n'));
  if ((await hit(who)) > PER_SENDER_PER_DAY) return json(h, { error: 'Too many messages today. Please try again tomorrow.' }, 429);
  if ((await hit('all:' + day)) > ALL_PER_DAY) return json(h, { error: 'The inbox is busy. Please try again tomorrow.' }, 429);

  const r = ref(), at = new Date().toISOString();
  await env.DB.prepare('INSERT INTO messages (id, ref, created_at, size, ciphertext) VALUES (?1, ?2, ?3, ?4, ?5)').bind(crypto.randomUUID(), r, at, m.length, m).run();
  ctx.waitUntil(Promise.all([notify(env, r, at).catch((e) => console.log('notify failed', e && e.message)), env.DB.prepare('DELETE FROM hits WHERE d < ?1').bind(day).run()]));
  return json(h, { ok: true, ref: r });
}

async function notify(env, r, at) {
  const lines = [
    `From: douglas.lol secure drop <${env.NOTIFY_FROM}>`, `To: ${env.NOTIFY_TO}`,
    `Subject: New secure message on douglas.lol (${r})`, `Date: ${new Date(at).toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@douglas.lol>`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '',
    `Someone sent you an encrypted message through douglas.lol (reference ${r}).`, '',
    'Open https://douglas.lol/inbox/ and unlock it with your key to read it.', 'This email never contains the message itself.',
  ];
  await env.NOTIFY.send(new EmailMessage(env.NOTIFY_FROM, env.NOTIFY_TO, lines.join('\r\n')));
}

async function session(req, env) {
  const t = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
  const [exp, mac] = t.split('.');
  return !!exp && Number(exp) > now() && same(mac, await hmac(env.SESSION_SECRET, 'session:' + exp));
}

export default {
  async fetch(req, env, ctx) {
    const h = cors(req, env), url = new URL(req.url), p = url.pathname;
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    try {
      if (p === '/' || p === '/health') return json(h, { ok: true, service: 'douglas.lol secure drop' });
      if (p === '/send' && req.method === 'POST') return await send(req, env, h, ctx);
      if (p === '/admin/challenge' && req.method === 'GET') {
        const challenge = `douglas.lol inbox login ${now()} ${b64u(crypto.getRandomValues(new Uint8Array(16)))}`;
        return json(h, { challenge, mac: await hmac(env.SESSION_SECRET, 'challenge:' + challenge) });
      }
      if (p === '/admin/login' && req.method === 'POST') {
        const { challenge, mac, signature } = await req.json();
        const ts = Number(String(challenge || '').split(' ')[3]);
        if (!same(mac, await hmac(env.SESSION_SECRET, 'challenge:' + challenge)) || !(now() - ts < CHALLENGE_TTL)) return json(h, { error: 'Challenge expired. Try again.' }, 401);
        try {
          const v = await openpgp.verify({ message: await openpgp.createMessage({ text: challenge }), signature: await openpgp.readSignature({ armoredSignature: signature }), verificationKeys: await publicKey(), expectSigned: true });
          await v.signatures[0].verified;
        } catch { return json(h, { error: 'That key is not the inbox key.' }, 401); }
        const exp = now() + SESSION_TTL;
        return json(h, { token: exp + '.' + (await hmac(env.SESSION_SECRET, 'session:' + exp)), expires: exp });
      }
      if (p.startsWith('/admin/')) {
        if (!(await session(req, env))) return json(h, { error: 'Locked.' }, 401);
        if (p === '/admin/messages' && req.method === 'GET') {
          const { results } = await env.DB.prepare('SELECT id, ref, created_at, size, status, ciphertext FROM messages ORDER BY created_at DESC LIMIT 1000').all();
          return json(h, { messages: results });
        }
        const m = p.match(/^\/admin\/messages\/([0-9a-f-]{36})$/);
        if (m && req.method === 'POST') {
          const { status } = await req.json();
          if (!['new', 'read', 'archived'].includes(status)) return json(h, { error: 'Bad status.' }, 400);
          const r = await env.DB.prepare('UPDATE messages SET status = ?1 WHERE id = ?2').bind(status, m[1]).run();
          return json(h, { ok: r.meta.changes === 1 });
        }
      }
      return json(h, { error: 'Not found.' }, 404);
    } catch (e) {
      console.log('error', e && e.stack);
      return json(h, { error: 'Something went wrong.' }, 500);
    }
  },
};
