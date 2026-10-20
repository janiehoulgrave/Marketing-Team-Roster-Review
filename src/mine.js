// "My roster": the review cards for the signed-in staff member.
import { S, render, pending } from './main.js';
import { data } from './data.js';
import { Q, NEVER, status, STATUS_LABEL, esc, tierCls, pickAnswers } from './questions.js';
import { STAFF } from './config.js';

let filter = 'all', query = '', openId = null;
const timers = {};
export function resetMine() { filter = 'all'; query = ''; openId = null; }

export const rosterFor = (teams, name) => teams.filter(t => t.ma === name || t.sec === name)
  .map(t => ({ ...t, role: t.ma === name ? 'primary' : 'secondary' }));
const mine = () => rosterFor(S.roster, S.acc.staff);
const R = () => S.mine;

export function renderMine() {
  return `<section class="intro"><p id="hello"></p>
      <div class="progress"><strong id="progText"></strong><div class="bar"><span id="progBar"></span></div></div></section>
    <div class="tools">
      <input class="search" id="q" type="search" placeholder="Search teams, offices or agents" value="${esc(query)}" aria-label="Search teams">
      <div class="seg" id="filters" role="group" aria-label="Filter teams"></div>
    </div>
    <div class="list" id="list"></div>`;
}
export function wireMine(main) {
  main.querySelector('#q').oninput = e => { query = e.target.value.toLowerCase(); renderList(); };
  renderFilters(); renderList();
}

function renderTop() {
  const ts = mine(), done = ts.filter(t => status(R()[t.id]) === 'done').length;
  const sec = ts.filter(t => t.role === 'secondary').length;
  const hello = document.getElementById('hello'); if (!hello) return;
  hello.textContent = ts.length
    ? `${S.acc.staff.split(' ')[0]}, you have ${ts.length} teams to review${sec ? `, including ${sec} where you're the secondary MA` : ''}. Answer for how each team works with you today, then add notes on anyone below. Your answers save as you go.`
    : `${S.acc.staff.split(' ')[0]}, there are no teams assigned to you in the current roster.`;
  document.getElementById('progText').textContent = `${done} of ${ts.length} teams complete`;
  document.getElementById('progBar').style.width = (ts.length ? done / ts.length * 100 : 0) + '%';
}
function renderFilters() {
  const ts = mine(), c = { all: ts.length, todo: 0, prog: 0, done: 0 };
  ts.forEach(t => c[status(R()[t.id])]++);
  const el = document.getElementById('filters'); if (!el) return;
  el.innerHTML = [['all', 'All'], ['todo', 'Not started'], ['prog', 'In progress'], ['done', 'Complete']]
    .map(([k, l]) => `<button aria-pressed="${filter === k}" data-f="${k}">${l}<span class="n">${c[k]}</span></button>`).join('');
  el.querySelectorAll('button').forEach(b => b.onclick = () => { filter = b.dataset.f; renderFilters(); renderList(); });
}
function matches(t) {
  if (filter !== 'all' && status(R()[t.id]) !== filter) return false;
  if (!query) return true;
  return (t.name + ' ' + t.office + ' ' + t.members.map(m => m[0]).join(' ')).toLowerCase().includes(query);
}
const isPerson = n => !!STAFF[n];
function secChips(t) {
  if (t.role === 'secondary') return `<span class="flag i">You're the secondary MA · Primary: ${esc(t.ma)}</span>`;
  if (t.sec) return `<span class="flag i">Secondary MA: ${esc(t.sec)}</span>`;
  return '';
}
function headHTML(t) {
  const st = status(R()[t.id]);
  const princ = t.principals.length ? t.principals.join(', ') : 'No principal listed';
  const chips = secChips(t), n = t.members.length;
  return `<button class="card-head" aria-expanded="${openId === t.id}" data-open="${t.id}">
    <h2>${esc(t.name)}</h2>
    <div class="right"><span class="pill s-${st}">${STATUS_LABEL[st]}</span><span class="chev" aria-hidden="true"></span></div>
    <div class="meta"><span class="tier ${tierCls(t.tier)}">${esc(t.tier)}</span><span>${esc(t.office || 'Office not listed')}</span><span class="sep"></span><span>${n} ${n === 1 ? 'person' : 'people'}</span><span class="sep"></span><span>Principal: ${esc(princ)}</span></div>
    ${chips ? `<div class="secnote">${chips}</div>` : ''}
  </button>`;
}
function renderList() {
  renderTop();
  const el = document.getElementById('list'); if (!el) return;
  const ts = mine().filter(matches);
  if (!ts.length) { el.innerHTML = `<div class="empty">No teams match. Clear the search or pick another filter.</div>`; return; }
  el.innerHTML = ts.map(t => `<article class="card ${openId === t.id ? 'open' : ''}" id="c-${t.id}">${headHTML(t)}${openId === t.id ? bodyHTML(t) : ''}</article>`).join('');
  el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => {
    openId = openId === b.dataset.open ? null : b.dataset.open; renderList();
    if (openId) document.getElementById('c-' + openId).scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  if (openId) { const t = ts.find(x => x.id === openId); if (t) wire(t); }
}

const lab = (k, forId) => `<${forId ? `label for="${forId}"` : 'div'} class="ql">${Q[k].label}${Q[k].hint ? `<span class="hint">${Q[k].hint}</span>` : ''}</${forId ? 'label' : 'div'}>`;
const single = (k, r) => `<div class="opts" data-single="${k}">${Q[k].opts.map(o => `<button type="button" class="opt" aria-pressed="${r[k] === o}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
const multi = (k, r, opts) => { const v = r[k] || []; return `<div class="opts" data-multi="${k}">${opts.map(o => { const [val, l] = Array.isArray(o) ? o : [o, o]; return `<button type="button" class="opt" aria-pressed="${v.includes(val)}" data-v="${esc(val)}">${esc(l)}</button>`; }).join('')}</div>`; };
function slider(k, r, tid) {
  const set = r[k] != null, v = set ? r[k] : 2;
  return `<div class="slider ${set ? '' : 'unset'}" data-slider="${k}"><span class="read">${set ? Q[k].stops[v] : 'Drag to set'}</span>
    <input type="range" id="${k}-${tid}" min="0" max="4" step="1" value="${v}" aria-label="${esc(Q[k].label)}">
    <div class="ends"><span>${Q[k].ends[0]}</span><span>${Q[k].ends[1]}</span></div></div>`;
}
const linkRow = (tid, l, i) => `<div class="linkrow"><input type="url" id="link-${tid}-${i}" value="${esc(l)}" placeholder="https://" aria-label="Template link ${i + 1}"><button type="button" class="x" aria-label="Remove link">×</button></div>`;
const savedText = r => r?.updated ? 'Saved ' + new Date(r.updated).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Your answers save as you go.';

function bodyHTML(t) {
  const r = R()[t.id] || {};
  const links = r.links && r.links.length ? r.links : [''];
  const notes = r.agentNotes || {};
  const banner = t.role === 'secondary'
    ? `<div class="banner2">You're the secondary MA here. ${esc(t.ma)} reviews this team too, and managers see both reviews side by side.</div>`
    : t.sec && isPerson(t.sec) ? `<div class="banner2">${esc(t.sec)} is the secondary MA and reviews this team too. Managers see both reviews side by side.</div>` : '';
  return `${banner}<div class="body">
    <div class="q">${lab('freq')}${single('freq', r)}<div class="never" id="never-${t.id}" ${r.freq === NEVER ? '' : 'hidden'}>That marks this team complete. Fill in anything else you know, or add notes on team members below.</div></div>
    <div class="q">${lab('load')}${single('load', r)}</div>
    <div class="q">${lab('work', 'work-' + t.id)}${slider('work', r, t.id)}</div>
    <div class="q">${lab('reach')}${multi('reach', r, Q.reach.opts)}</div>
    <div class="q">${lab('plan', 'plan-' + t.id)}${slider('plan', r, t.id)}</div>
    <div class="q">${lab('channels')}${multi('channels', r, Q.channels.opts)}</div>
    <div class="q">${lab('design')}${single('design', r)}<label class="check" for="brand-${t.id}"><input type="checkbox" id="brand-${t.id}" data-check="brand" ${r.brand ? 'checked' : ''}> They have a brand system</label></div>
    <div class="q">${lab('ops')}${single('ops', r)}<div class="q sub" id="opsname-${t.id}" ${r.ops === 'Yes' ? '' : 'hidden'}><label class="ql" for="opsName-${t.id}">${Q.opsName.label}</label><input type="text" class="textin" id="opsName-${t.id}" data-text="opsName" value="${esc(r.opsName)}" placeholder="Name"></div></div>
    <div class="q">${lab('specialty', 'specialty-' + t.id)}<textarea id="specialty-${t.id}" data-text="specialty" rows="2" placeholder="e.g. Capitol Hill condos, first-time buyers, luxury waterfront">${esc(r.specialty)}</textarea></div>
    <div class="q">${lab('projects', 'projects-' + t.id)}<textarea id="projects-${t.id}" data-text="projects" rows="3" placeholder="e.g. Spring listing launch, new team logo, quarterly market report mailer">${esc(r.projects)}</textarea></div>
    <div class="q">${lab('links')}<div class="links" id="links-${t.id}">${links.map((l, i) => linkRow(t.id, l, i)).join('')}</div><div><button type="button" class="btn link" data-addlink>+ Add another link</button></div></div>
    <div class="q">${lab('note', 'note-' + t.id)}<textarea id="note-${t.id}" data-text="note" rows="2">${esc(r.note)}</textarea></div>
    <section class="members">
      <div class="members-head"><h3>Team members</h3><span class="eyebrow">Notes are optional</span></div>
      ${t.members.map((m, i) => `<div class="mem"><div class="mem-top"><span class="nm">${esc(m[0])}</span><span class="role">${esc(m[1])}</span>${m[2] ? `<span class="tier ${tierCls(m[2])}">${esc(m[2])}</span>` : ''}</div>
        <textarea id="an-${t.id}-${i}" data-agent="${esc(m[0])}" rows="1" placeholder="Add a note about ${esc(m[0].split(' ')[0])}" aria-label="Note about ${esc(m[0])}">${esc(notes[m[0]])}</textarea></div>`).join('')}
    </section>
    <div class="foot"><span id="saved-${t.id}">${savedText(R()[t.id])}</span><button type="button" class="btn primary" data-close>Done with this team</button></div>
  </div>`;
}

function save(t) {
  const el = document.getElementById('saved-' + t.id);
  if (el) el.textContent = 'Saving…';
  pending.add(t.id);
  clearTimeout(timers[t.id]);
  timers[t.id] = setTimeout(async () => {
    try {
      await data.saveResponse(S.user, S.acc.staff, t.id, pickAnswers(R()[t.id]));
      R()[t.id].updated = Date.now();
      const e2 = document.getElementById('saved-' + t.id); if (e2) e2.textContent = 'Saved just now';
    } catch (e) {
      const e2 = document.getElementById('saved-' + t.id);
      if (e2) { e2.textContent = "Couldn't save. Check your connection; your answers are kept on this page and will retry with your next change."; e2.classList.add('err'); }
    } finally { pending.delete(t.id); }
  }, 700);
}

function wire(t) {
  const card = document.getElementById('c-' + t.id);
  const r = () => (R()[t.id] = R()[t.id] || {});
  const touch = () => {
    const st = status(R()[t.id]);
    const pill = card.querySelector('.pill'); pill.className = 'pill s-' + st; pill.textContent = STATUS_LABEL[st];
    renderTop(); renderFilters(); save(t);
  };
  card.querySelectorAll('[data-single]').forEach(g => g.querySelectorAll('.opt').forEach(b => b.onclick = () => {
    const k = g.dataset.single, on = b.getAttribute('aria-pressed') !== 'true';
    g.querySelectorAll('.opt').forEach(x => x.setAttribute('aria-pressed', 'false'));
    if (on) b.setAttribute('aria-pressed', 'true');
    r()[k] = on ? b.dataset.v : null;
    if (k === 'freq') card.querySelector('#never-' + t.id).hidden = r().freq !== NEVER;
    if (k === 'ops') card.querySelector('#opsname-' + t.id).hidden = r().ops !== 'Yes';
    touch();
  }));
  card.querySelectorAll('[data-multi]').forEach(g => g.querySelectorAll('.opt').forEach(b => b.onclick = () => {
    const k = g.dataset.multi, on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', on);
    const v = new Set(r()[k] || []); on ? v.add(b.dataset.v) : v.delete(b.dataset.v); r()[k] = [...v];
    touch();
  }));
  card.querySelectorAll('[data-slider]').forEach(s => {
    const inp = s.querySelector('input'), k = s.dataset.slider;
    inp.oninput = () => { s.classList.remove('unset'); s.querySelector('.read').textContent = Q[k].stops[+inp.value]; r()[k] = +inp.value; touch(); };
    inp.onpointerdown = () => { if (s.classList.contains('unset')) inp.oninput(); };
  });
  card.querySelectorAll('[data-check]').forEach(c => c.onchange = () => { r()[c.dataset.check] = c.checked; touch(); });
  card.querySelectorAll('[data-text]').forEach(a => a.oninput = () => { r()[a.dataset.text] = a.value; touch(); });
  card.querySelectorAll('[data-agent]').forEach(a => a.oninput = () => { (r().agentNotes = r().agentNotes || {})[a.dataset.agent] = a.value; touch(); });
  const linksEl = card.querySelector('#links-' + t.id);
  const syncLinks = () => { r().links = [...linksEl.querySelectorAll('input')].map(i => i.value.trim()); touch(); };
  const wireLinks = () => linksEl.querySelectorAll('.linkrow').forEach(row => {
    row.querySelector('input').oninput = syncLinks;
    row.querySelector('.x').onclick = () => { if (linksEl.children.length > 1) row.remove(); else row.querySelector('input').value = ''; syncLinks(); };
  });
  wireLinks();
  card.querySelector('[data-addlink]').onclick = () => {
    linksEl.insertAdjacentHTML('beforeend', linkRow(t.id, '', Date.now() % 100000)); wireLinks();
    linksEl.lastElementChild.querySelector('input').focus();
  };
  card.querySelector('[data-close]').onclick = () => { openId = null; renderList(); document.getElementById('c-' + t.id)?.scrollIntoView({ block: 'nearest' }); };
}
