// ============================================================================
// SCR.trial — run the comparison yourself, with your own key.
//
// One interface spec. One model. Two harnesses. The only thing that differs is
// what the retrieval component decided to put in front of the model.
//
// Both results are rendered here, in your browser, and audited with axe-core —
// the same engine that scored every run on this page. The model call goes
// through a relay because neither endpoint accepts a browser call directly;
// the key is forwarded once and never stored.
// ============================================================================
(function (SCR) {
'use strict';
const T = SCR.trial = {};
const $ = id => document.getElementById(id);
const el = (t, c, txt) => { const n = document.createElement(t); if (c) n.className = c;
  if (txt !== undefined) n.textContent = txt; return n; };
const esc = s => String(s === undefined || s === null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const WEIGHT = { critical: 10, serious: 5, moderate: 2, minor: 1 };

const state = { data: null, busy: false, task: 0, axe: null };

async function axeSource(url) {
  if (state.axe) return state.axe;
  state.axe = await fetch(url).then(r => r.text());
  return state.axe;
}

// Render the document in a same-origin iframe and run the real engine against it.
async function auditHtml(html, must, axeSrc) {
  return new Promise(resolve => {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.style.cssText = 'position:absolute;left:-10000px;width:1100px;height:900px';
    document.body.append(frame);
    const done = out => { frame.remove(); resolve(out); };
    const timer = setTimeout(() => done({ error: 'the page did not load' }), 20000);
    frame.onload = async () => {
      try {
        const d = frame.contentDocument;
        const s = d.createElement('script');
        s.textContent = axeSrc;
        d.head.appendChild(s);
        const res = await frame.contentWindow.axe.run(d, { resultTypes: ['violations'] });
        const violations = res.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length }));
        const missing = [];
        for (const [sel, want] of (must || [])) {
          let got = 0;
          try { got = d.querySelectorAll(sel).length; } catch (e) { got = 0; }
          if (got < want) missing.push(`${sel} (${got}/${want})`);
        }
        clearTimeout(timer);
        done({ violations, missing,
               weighted: violations.reduce((a, v) => a + (WEIGHT[v.impact] || 1) * v.n, 0) });
      } catch (e) {
        clearTimeout(timer);
        done({ error: String(e).slice(0, 160) });
      }
    };
    frame.srcdoc = html;
  });
}

async function ask({ key, provider, model, system, user }) {
  const r = await fetch('/api/infer', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, provider, model, system, user, temperature: 0.2, max_tokens: 2000 }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `relay returned ${r.status}`);
  return d;
}

function extractHtml(text) {
  const m = String(text || '').match(/```(?:html)?\s*\n([\s\S]*?)```/);
  let body = (m ? m[1] : String(text || '')).trim();
  const i = body.indexOf('<');
  return i > 0 ? body.slice(i) : body;
}

T.open = async function () {
  const host = $('regs'); if (!host) return;
  host.hidden = false;
  host.innerHTML = `<div class="regs-head"><span>RUN THE COMPARISON YOURSELF</span>`
    + `<button id="regsClose">CLOSE</button></div><div id="trialBody"><p>Loading…</p></div>`;
  host.querySelector('#regsClose').addEventListener('click', () => { host.hidden = true; });
  if (!state.data) {
    try { state.data = await fetch('trial.json').then(r => r.json()); }
    catch (e) { $('trialBody').innerHTML = '<p>The comparison data is not in this build.</p>'; return; }
  }
  render();
};

function render() {
  const body = $('trialBody'); const d = state.data;
  body.textContent = '';
  const intro = el('div');
  intro.innerHTML = `<p>Everything on this page already happened. This runs it again, now, with a
    key you supply — so you can check the claim instead of taking it.</p>
    <p><b>One spec. One model. Two harnesses.</b> On the left is the context the agent gave itself
    on its first run; on the right, after it rewrote its own retrieval. Same model, same brief,
    same temperature. Both results are rendered below and audited with <b>axe-core</b>, the same
    engine that scored every run on this page.</p>
    <p style="color:var(--mid)">Your key goes to the model endpoint through a relay on this site,
    because neither endpoint accepts a browser call directly. It is used for that one request and
    never stored. The pages are rendered and audited entirely in your browser.</p>`;
  body.append(intro);

  const form = el('div', 'trial-form');
  form.innerHTML = `<label>KEY<input id="tKey" type="password" placeholder="wandb_v1_…"
      autocomplete="off" spellcheck="false"></label>
    <label>SPEC<select id="tTask">${d.tasks.map((t, i) =>
      `<option value="${i}">${esc(t.title)}</option>`).join('')}</select></label>
    <button id="tRun" class="run">BUILD BOTH</button>`;
  body.append(form);
  const note = el('p'); note.id = 'tNote'; note.style.color = 'var(--mid)'; body.append(note);
  const out = el('div', 'two'); out.id = 'tOut'; body.append(out);
  $('tRun').addEventListener('click', go);
  showTask();
  $('tTask').addEventListener('change', showTask);
}

function showTask() {
  const i = parseInt($('tTask').value, 10) || 0;
  state.task = i;
  const t = state.data.tasks[i];
  const out = $('tOut'); out.textContent = '';
  for (const side of ['before', 'after']) {
    const h = t[side];
    const box = el('div', 'trial-col'); box.id = 'tCol_' + side;
    box.innerHTML = `<div class="trial-head">${esc(side === 'before'
      ? state.data.before_label : state.data.after_label)}</div>`
      + `<div class="trial-meta">retrieval <b>${esc(h.retrieval)}</b> · references given `
      + `<b>${h.refs.length ? esc(h.refs.join(', ')) : 'none'}</b>`
      + (h.missing && h.missing.length
        ? ` · <span style="color:var(--red)">never shown: ${esc(h.missing.join(', '))}</span>` : '')
      + `</div><div class="trial-slot">press BUILD BOTH</div>`;
    out.append(box);
  }
  $('tNote').textContent = t.prompt.split('\n')[0];
}

async function go() {
  if (state.busy) return;
  const key = ($('tKey').value || '').trim();
  if (!key) { $('tNote').textContent = 'Paste a key first.'; return; }
  const provider = key.startsWith('sk-ant-') ? 'anthropic' : 'wandb';
  const model = provider === 'anthropic' ? 'claude-haiku-4-5-20251001' : state.data.models[0];
  const t = state.data.tasks[state.task];
  state.busy = true; $('tRun').disabled = true;
  $('tNote').textContent = `Asking ${model} for the same interface twice, then auditing both here…`;
  const axeSrc = await axeSource(state.data.axe);

  for (const side of ['before', 'after']) {
    const slot = $('tCol_' + side).querySelector('.trial-slot');
    slot.textContent = 'building…';
    try {
      const r = await ask({ key, provider, model, system: state.data.system, user: t[side].context });
      const html = extractHtml(r.text);
      slot.innerHTML = `<iframe class="preview" sandbox="allow-same-origin"></iframe>`
        + `<div class="trial-run">auditing…</div>`;
      slot.querySelector('.preview').srcdoc = html;
      const a = await auditHtml(html, t.must, axeSrc);
      const line = slot.querySelector('.trial-run');
      if (a.error) { line.className = 'trial-run fail'; line.textContent = '✗ ' + a.error; continue; }
      const clean = !a.violations.length && !a.missing.length;
      line.className = 'trial-run ' + (clean ? 'pass' : 'fail');
      line.textContent = clean ? '✓ zero violations, every requirement met'
        : `✗ ${a.weighted} weighted violations · `
          + a.violations.slice(0, 3).map(v => v.id).join(', ')
          + (a.missing.length ? ` · missing ${a.missing[0]}` : '');
    } catch (e) {
      $('tCol_' + side).querySelector('.trial-slot').innerHTML =
        `<div class="trial-run fail">${esc(String(e.message || e))}</div>`;
    }
  }
  state.busy = false; $('tRun').disabled = false;
  $('tNote').textContent = 'Same model, same brief. The only difference is what the harness put in '
    + 'front of it.';
}
})(window.SCR = window.SCR || {});
