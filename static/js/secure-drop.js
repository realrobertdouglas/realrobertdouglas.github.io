// Secure message drop: any <form data-secure-drop> on the page. The message is encrypted here, in the
// sender's browser, to Robert's public key (/static/robert-drop.asc) before it is sent, so the server
// and this website only ever see ciphertext. OpenPGP.js loads the first time someone starts typing.
const ENDPOINT = 'https://drop.douglas.lol/send';
let pgp, key;
const load = () => (pgp ||= import('/static/js/openpgp.min.mjs'));
const publicKey = async () => {
  const openpgp = await load();
  if (!key) key = await openpgp.readKey({ armoredKey: await (await fetch('/static/robert-drop.asc')).text() });
  return key;
};

// The sidebar link opens the message window (a <dialog>); ×, Esc or a click outside closes it.
// After a message is sent, closing resets the window so it's ready for another.
for (const opener of document.querySelectorAll('[data-drop-open]')) {
  const dlg = opener.parentElement.querySelector('dialog');
  if (!dlg) continue;
  opener.addEventListener('click', () => { dlg.showModal(); publicKey().catch(() => {}); dlg.querySelector('textarea').focus(); });
  dlg.querySelector('[data-drop-close]').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => {
    const done = dlg.querySelector('[data-done]'), form = dlg.querySelector('form');
    if (done && !done.hidden) { done.hidden = true; form.hidden = false; form.reset(); const b = form.querySelector('button[type=submit]'); b.disabled = false; b.textContent = 'Send'; }
  });
}

for (const form of document.querySelectorAll('form[data-secure-drop]')) {
  const box = form.closest('[data-secure-drop-box]') || form.parentElement;
  const msg = form.querySelector('[name=message]'), reply = form.querySelector('[name=reply]');
  const btn = form.querySelector('button[type=submit]'), status = box.querySelector('[data-status]');
  const done = box.querySelector('[data-done]'), label = btn.textContent;
  const say = (t, bad) => { if (status) { status.textContent = t; status.classList.toggle('sd-bad', !!bad); } };
  msg.addEventListener('focus', () => { publicKey().catch(() => {}); }, { once: true });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = msg.value.trim();
    if (!text) { msg.focus(); say('Write a message first.', true); return; }
    btn.disabled = true; btn.textContent = 'Encrypting…'; say('');
    try {
      const openpgp = await load();
      const r = reply && reply.value.trim();
      const body = (r ? `Reply to: ${r}\n\n` : 'Reply to: (anonymous)\n\n') + text;
      const armored = await openpgp.encrypt({ message: await openpgp.createMessage({ text: body }), encryptionKeys: await publicKey() });
      btn.textContent = 'Sending…';
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ m: armored }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) throw new Error(out.error || 'Could not send. Please try again.');
      form.hidden = true;
      if (done) {
        const refEl = done.querySelector('[data-ref]'); if (refEl) refEl.textContent = out.ref;
        const c = done.querySelector('[data-cipher]'); if (c) c.textContent = armored;
        done.hidden = false;
      }
    } catch (err) {
      say(err && err.message ? err.message : 'Could not send. Please try again.', true);
      btn.disabled = false; btn.textContent = label;
    }
  });
}
