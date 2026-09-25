// The private inbox for the secure message drop. Robert picks his passphrase-locked key file and types
// the passphrase; the key is unlocked in this tab only. It signs a one-time challenge to prove to the
// server that he holds the key, fetches the (still encrypted) messages, and decrypts them here.
import * as openpgp from '/static/js/openpgp.min.mjs';

const API = 'https://drop.douglas.lol';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let key = null, token = null, msgs = [], tab = 'new', sel = null;

function err(t) { $('ib-err').hidden = !t; $('ib-err').textContent = t || ''; }
async function api(path, opts = {}) {
  const res = await fetch(API + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) } });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || 'The server did not answer.');
  return out;
}
function when(iso) {
  const d = new Date(iso), today = new Date(), y = new Date(Date.now() - 864e5);
  const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return 'Today, ' + t;
  if (d.toDateString() === y.toDateString()) return 'Yesterday, ' + t;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}
const kb = (n) => (n / 1024).toFixed(1) + ' KB';

async function unlock(e) {
  e.preventDefault(); err('');
  const file = $('ib-keyfile').files[0], pass = $('ib-pass').value;
  if (!file) { err('Choose your private key file first (robert-drop-PRIVATE-passphrase-locked.asc).'); return; }
  const btn = e.submitter || $('ib-unlock').querySelector('button'); btn.disabled = true; btn.textContent = 'Unlocking…';
  try {
    let k;
    try { k = await openpgp.readPrivateKey({ armoredKey: await file.text() }); } catch { throw new Error('That file isn\'t a private key.'); }
    try { key = k.isDecrypted() ? k : await openpgp.decryptKey({ privateKey: k, passphrase: pass }); } catch { throw new Error('Wrong passphrase.'); }
    $('ib-pass').value = '';
    const { challenge, mac } = await api('/admin/challenge');
    const signature = await openpgp.sign({ message: await openpgp.createMessage({ text: challenge }), signingKeys: key, detached: true });
    token = (await api('/admin/login', { method: 'POST', body: JSON.stringify({ challenge, mac, signature }) })).token;
    $('ib').classList.add('open'); $('ib-unlock').hidden = true; $('ib-lockbar').hidden = false; $('ib-main').hidden = false;
    $('ib-state').textContent = 'Unlocked in this tab. Your key is forgotten when you lock or close it.';
    $('ib-who').textContent = 'Key ' + key.getFingerprint().toUpperCase().slice(-16).replace(/(.{4})/g, '$1 ').trim();
    await refresh();
  } catch (x) { key = null; token = null; err(x.message); }
  btn.disabled = false; btn.innerHTML = '🔑&nbsp; Unlock';
}

async function refresh() {
  err('');
  const { messages } = await api('/admin/messages');
  msgs = await Promise.all(messages.map(async (m) => {
    let text = '', reply = '', bad = false;
    try {
      const { data } = await openpgp.decrypt({ message: await openpgp.readMessage({ armoredMessage: m.ciphertext }), decryptionKeys: key });
      const r = data.match(/^Reply to: (.*)\n\n/);
      reply = r && r[1] !== '(anonymous)' ? r[1] : ''; text = r ? data.slice(r[0].length) : data;
    } catch { bad = true; text = 'This message could not be decrypted with your key.'; }
    return { ...m, text, reply, bad };
  }));
  draw();
}

function lock() {
  key = null; token = null; msgs = []; sel = null;
  $('ib').classList.remove('open'); $('ib-unlock').hidden = false; $('ib-lockbar').hidden = true; $('ib-main').hidden = true;
  $('ib-keyfile').value = ''; $('ib-state').textContent = 'Locked. Messages stay encrypted until you unlock them here.';
}

const shown = () => msgs.filter((m) => (tab === 'arch' ? m.status === 'archived' : tab === 'new' ? ((m.status === 'new' || m.id === sel) && m.status !== 'archived') : m.status !== 'archived'));
function draw() {
  $('ib-count').textContent = msgs.filter((m) => m.status === 'new').length;
  const rows = shown();
  $('ib-list').innerHTML = rows.length ? rows.map((m) => {
    const cut = m.text.search(/[.?!](\s|$)/), first = cut > 0 ? m.text.slice(0, cut + 1) : m.text.split('\n')[0], rest = m.text.slice(first.length).trim();
    return `<li data-id="${m.id}" class="${m.status !== 'new' ? 'read ' : ''}${sel === m.id ? 'sel' : ''}"><span class="u"></span><div><div class="t">${esc(first.length > 70 ? first.slice(0, 68) + '…' : first || '(empty)')}</div><div class="prev">${esc(rest || ' ')}</div></div><span class="when">${when(m.created_at)}</span></li>`;
  }).join('') : `<li style="cursor:default;grid-template-columns:1fr"><span class="prev">${tab === 'new' ? 'No new messages.' : 'Nothing here.'}</span></li>`;
  const m = msgs.find((x) => x.id === sel);
  if (!m || !rows.includes(m)) { $('ib-view').hidden = true; return; }
  $('ib-view').hidden = false;
  $('ib-view').innerHTML = `<div class="meta">${when(m.created_at)} · reference ${esc(m.ref)} · ${kb(m.size)}</div><div class="body">${esc(m.text)}</div>`
    + `<div class="reply">${m.reply ? 'Reply to: <strong>' + esc(m.reply) + '</strong>' : 'No reply details. The sender chose to stay anonymous.'}</div>`
    + `<div class="acts"><button class="ghost" data-act="copy">Copy message</button>${m.reply ? '<button class="ghost" data-act="copyreply">Copy reply details</button>' : ''}`
    + `<button class="ghost" data-act="arch">${m.status === 'archived' ? 'Move back to inbox' : 'Archive'}</button>`
    + `${m.status !== 'archived' ? '<button class="ghost" data-act="unread">Mark unread</button>' : ''}</div>`;
}
async function setStatus(m, status) {
  const was = m.status; m.status = status; draw();
  try { await api('/admin/messages/' + m.id, { method: 'POST', body: JSON.stringify({ status }) }); } catch (x) { m.status = was; draw(); err(x.message); }
}

$('ib-unlock').addEventListener('submit', unlock);
$('ib-lock').addEventListener('click', lock);
$('ib-refresh').addEventListener('click', () => refresh().catch((x) => err(x.message)));
document.querySelector('.ib .tabs').addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]'); if (!t) return;
  tab = t.dataset.tab; sel = null; document.querySelectorAll('.ib .tabs span').forEach((s) => s.classList.toggle('on', s === t)); draw();
});
$('ib-list').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-id]'); if (!li) return;
  sel = li.dataset.id; const m = msgs.find((x) => x.id === sel);
  if (m.status === 'new') setStatus(m, 'read'); else draw();
});
$('ib-view').addEventListener('click', async (e) => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  const m = msgs.find((x) => x.id === sel);
  if (a.dataset.act === 'copy' || a.dataset.act === 'copyreply') { await navigator.clipboard.writeText(a.dataset.act === 'copy' ? m.text : m.reply); a.textContent = 'Copied ✓'; return; }
  if (a.dataset.act === 'arch') setStatus(m, m.status === 'archived' ? 'read' : 'archived');
  if (a.dataset.act === 'unread') setStatus(m, 'new');
});
addEventListener('pagehide', lock);
