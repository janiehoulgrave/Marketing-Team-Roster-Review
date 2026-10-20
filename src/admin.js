// Admin: read-only overview of every review, flags, and roster data upload.
import { S, render, setRoster } from './main.js';
import { data } from './data.js';
import { STAFF, ADMINS } from './config.js';
import { rosterFor } from './mine.js';
import { Q, OFF, REACH_SHORT, isOff, status, STATUS_LABEL, esc, tierCls, safeUrl } from './questions.js';

let view = { tab: 'staff', person: null, open: null };
let upload = null; // parsed file waiting for confirmation
export const adminTab = () => view.tab;
export function resetAdmin() { view = { tab: 'staff', person: null, open: null }; upload = null; resetUnassigned(); }
const NAMES = Object.keys(STAFF);
const isPerson = n => !!STAFF[n];

const FLAGS = {
  heavyTpl: { label: 'Heavy and templated', cls: '', desc: 'Heavy workload made up mostly of templated content. These are the clearest candidates for self-serve tools or a reassignment.' },
  offProc:  { label: 'Goes around Zendesk', cls: 'w', desc: 'The team skips marketing@compass.com and goes straight to the person by direct email, text or phone.' },
  walkup:   { label: 'Walks up in office', cls: 'w', desc: 'Requests made in person that never show up in Zendesk or Monday.com.' },
  combine:  { label: 'Combine records', cls: 'i', desc: 'Teams with both a primary and a secondary MA on staff. Both reviews are shown side by side so the records can be merged.' },
};
const flagChip = k => `<span class="flag ${FLAGS[k].cls}">${FLAGS[k].label}</span>`;
function teamFlags(t, r) {
  const f = [];
  if (r && r.freq !== "I've never spoken to them") {
    if (r.load === 'Heavy' && r.work != null && r.work <= 1) f.push('heavyTpl');
    if ((r.reach || []).some(k => ['email', 'text', 'call'].includes(k))) f.push('offProc');
    if ((r.reach || []).includes('walkup')) f.push('walkup');
  }
  if (t.sec && isPerson(t.sec)) f.push('combine');
  return f;
}

function model() {
  const RESP = Object.fromEntries(NAMES.map(n => [n, {}]));
  S.all.forEach(d => { if (RESP[d.staff]) RESP[d.staff][d.teamId] = d; });
  const stats = s => {
    const ts = rosterFor(S.roster, s), rs = RESP[s];
    const done = ts.filter(t => status(rs[t.id]) === 'done').length;
    const prog = ts.filter(t => status(rs[t.id]) === 'prog').length;
    const ans = ts.map(t => rs[t.id]).filter(Boolean);
    const heavy = ans.filter(r => r.load === 'Heavy').length;
    const w = ans.filter(r => r.work != null);
    const work = w.length ? w.reduce((a, r) => a + r.work, 0) / w.length : null;
    const off = ans.filter(isOff).length, walk = ans.filter(r => (r.reach || []).includes('walkup')).length;
    const tiers = {}; ts.forEach(t => tiers[t.tier] = (tiers[t.tier] || 0) + 1);
    const flagged = ts.filter(t => teamFlags(t, rs[t.id]).some(k => k !== 'combine')).length;
    return { ts, done, prog, heavy, work, off, walk, tiers, flagged, members: ts.reduce((a, t) => a + t.members.length, 0) };
  };
  const ALL = Object.fromEntries(NAMES.map(s => [s, stats(s)]));
  const avgHeavy = NAMES.reduce((a, s) => a + ALL[s].heavy, 0) / NAMES.length;
  return { RESP, ALL, avgHeavy, heavyLoad: s => ALL[s].heavy >= 3 && ALL[s].heavy >= avgHeavy * 1.5 };
}

function go(main, v) { view = { ...view, ...v }; renderAdmin(main); window.scrollTo({ top: 0 }); }

export function renderAdmin(main) {
  if (!S.allReady) { main.innerHTML = `<div class="empty">Loading reviews…</div>`; return; }
  if (!S.roster.length && view.tab !== 'roster') view = { tab: 'roster', person: null, open: null };
  const M = model();
  if (view.person) return renderPerson(main, M, view.person);
  const st = NAMES.map(s => M.ALL[s]);
  const prim = t => M.RESP[t.ma]?.[t.id];
  const reviewed = S.roster.filter(t => status(prim(t)) === 'done').length;
  const staffDone = st.filter(x => x.ts.length && x.done === x.ts.length).length;
  const flagged = S.roster.filter(t => teamFlags(t, prim(t)).some(k => k !== 'combine')).length;
  const offTeams = S.roster.filter(t => prim(t) && isOff(prim(t))).length;
  main.innerHTML = `
    <section class="stats">
      <div class="stat"><span class="eyebrow">Staff finished</span><span class="v">${staffDone}<small> of ${NAMES.length}</small></span><span class="d">${st.filter(x => x.done + x.prog === 0).length} haven't started</span></div>
      <div class="stat"><span class="eyebrow">Teams reviewed</span><span class="v">${reviewed}<small> of ${S.roster.length}</small></span><span class="d">By the primary MA</span></div>
      <div class="stat"><span class="eyebrow">Teams flagged</span><span class="v">${flagged}</span><span class="d">Heavy and templated, around Zendesk, or walk-ups</span></div>
      <div class="stat"><span class="eyebrow">Going around Zendesk</span><span class="v">${offTeams}</span><span class="d">Teams using email, text, calls or walk-ups</span></div>
    </section>
    <nav class="tabs" role="tablist">
      ${[['staff', 'Staff progress'], ['flags', 'Flagged teams'], ['unassigned', 'Not on a roster'], ['reorg', 'Re-org'], ['roster', 'Roster data']].map(([k, l]) => `<button role="tab" aria-selected="${view.tab === k}" data-tab="${k}">${l}</button>`).join('')}
    </nav>
    <div id="tab"></div>`;
  main.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => go(main, { tab: b.dataset.tab }));
  const el = main.querySelector('#tab');
  if (view.tab === 'staff') el.innerHTML = staffTable(M);
  if (view.tab === 'flags') el.innerHTML = flagsTab(M);
  document.body.classList.toggle('xwide', view.tab === 'reorg');
  if (view.tab === 'reorg') { el.innerHTML = '<div class="empty">Loading the re-org…</div>'; import('./reorg.js').then(m => { if (view.tab === 'reorg' && el.isConnected) m.renderReorg(el); }); return; }
  if (view.tab === 'roster') return rosterTab(main, el);
  if (view.tab === 'unassigned') return unassignedTab(el);
  el.querySelectorAll('[data-person]').forEach(b => {
    const open = () => go(main, { person: b.dataset.person, open: b.dataset.team || null });
    b.onclick = open; b.onkeydown = e => { if (e.key === 'Enter') open(); };
  });
}

const TIERS = [['Tier 1', 't1'], ['Tier 2', 't2'], ['Tier 3', 't3'], ['Tier 4', 't4']];
function tierMix(tiers, total) {
  if (!total) return '<span class="dash">No teams</span>';
  const other = total - TIERS.reduce((a, [k]) => a + (tiers[k] || 0), 0);
  return `<div class="tiermix" title="${TIERS.map(([k]) => `${k}: ${tiers[k] || 0}`).join(', ')}, other: ${other}">${TIERS.map(([k, c]) => tiers[k] ? `<span style="width:${tiers[k] / total * 100}%;background:var(--${c})"></span>` : '').join('')}${other ? `<span class="tn" style="width:${other / total * 100}%"></span>` : ''}</div>`;
}
const scale = v => v == null ? '<span class="dash">No answers yet</span>' : `<div class="scale" title="${Q.work.stops[Math.round(v)]}"><b style="left:${5 + v / 4 * 90}%"></b></div><div class="scale-l"><span>Templated</span><span>Strategic</span></div>`;
function staffTable(M) {
  return `<div class="legend"><span>Tier mix:</span>${TIERS.map(([k, c]) => `<span><i style="background:var(--${c})"></i>${k}</span>`).join('')}<span><i style="background:repeating-linear-gradient(45deg,var(--t4) 0 2px,transparent 2px 4px)"></i>No tier</span></div>
  <div class="tablewrap"><table><thead><tr><th>Staff</th><th>Progress</th><th>Tier mix</th><th>Heavy teams</th><th>Work type</th><th>Off-process</th><th>Flags</th></tr></thead><tbody>
  ${NAMES.map(s => { const x = M.ALL[s], n = x.ts.length, pct = n ? x.done / n * 100 : 0;
    const sec = x.ts.filter(t => t.role === 'secondary').length;
    return `<tr data-person="${esc(s)}" tabindex="0">
      <td class="nm">${esc(s)}${ADMINS[s] ? ' <span class="eyebrow">admin</span>' : ''}<span class="sub">${n} teams${sec ? ` (${sec} as secondary)` : ''} · ${x.members} people</span></td>
      <td><div class="prog"><div class="bar"><span style="width:${pct}%"></span></div><span class="num">${x.done}/${n}</span></div>${n && x.done === n ? '<span class="pill s-done">Finished</span>' : x.done + x.prog === 0 ? '<span class="pill s-todo">Not started</span>' : ''}</td>
      <td>${tierMix(x.tiers, n)}</td>
      <td class="num">${x.heavy}${M.heavyLoad(s) ? ' <span class="flag w">Above average</span>' : ''}</td>
      <td>${scale(x.work)}</td>
      <td class="num" style="white-space:nowrap">${x.off}${x.walk ? ` <span class="dash">· ${x.walk} walk-up</span>` : ''}</td>
      <td>${x.flagged ? `<span class="flag">${x.flagged} team${x.flagged > 1 ? 's' : ''}</span>` : '<span class="dash">None</span>'}</td></tr>`; }).join('')}
  </tbody></table></div><p class="dash small">Select a person to read their teams, answers and notes. Reviews are read-only here.</p>`;
}
function flagsTab(M) {
  return Object.entries(FLAGS).map(([k, f]) => {
    const items = S.roster.filter(t => teamFlags(t, M.RESP[t.ma]?.[t.id]).includes(k));
    return `<section class="flaggroup"><h3>${f.label}<span class="num">${items.length}</span></h3><p>${f.desc}</p>
      ${items.length ? items.map(t => `<button class="fitem" data-person="${esc(t.ma)}" data-team="${t.id}"><span><span class="t">${esc(t.name)}</span> <span class="tier ${tierCls(t.tier)}">${esc(t.tier)}</span></span><span class="m">${esc(t.ma)}${k === 'combine' ? ' + ' + esc(t.sec) : ''} · ${esc(t.office)}</span></button>`).join('') : '<p>No teams yet.</p>'}</section>`;
  }).join('');
}

function renderPerson(main, M, s) {
  const x = M.ALL[s];
  main.innerHTML = `<div class="back"><button class="btn link" id="back">← All staff</button></div>
    <div class="person"><div><span class="eyebrow">Staff review</span><h2>${esc(s)}</h2></div>
      <div class="flags"><span class="pill s-${x.ts.length && x.done === x.ts.length ? 'done' : x.done + x.prog ? 'prog' : 'todo'}">${x.done} of ${x.ts.length} complete</span>${M.heavyLoad(s) ? '<span class="flag w">Carrying more heavy teams than average</span>' : ''}</div></div>
    <section class="stats" style="margin-top:0">
      <div class="stat"><span class="eyebrow">Teams</span><span class="v">${x.ts.length}</span><span class="d">${x.members} people total</span></div>
      <div class="stat"><span class="eyebrow">Heavy</span><span class="v">${x.heavy}</span><span class="d">Team average is ${M.avgHeavy.toFixed(1)}</span></div>
      <div class="stat"><span class="eyebrow">Work type</span><span class="v" style="font-size:22px;padding-block:8px">${x.work == null ? '–' : Q.work.stops[Math.round(x.work)]}</span><span class="d">Average across answered teams</span></div>
      <div class="stat"><span class="eyebrow">Off-process</span><span class="v">${x.off}</span><span class="d">${x.walk} with walk-ups</span></div>
    </section>
    <div class="tlist">${x.ts.map(t => teamRow(M, s, t)).join('')}</div>`;
  main.querySelector('#back').onclick = () => go(main, { person: null, open: null });
  main.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { view.open = view.open === b.dataset.t ? null : b.dataset.t; renderPerson(main, M, s); });
  if (view.open) document.getElementById('r-' + view.open)?.scrollIntoView({ block: 'start' });
}
function teamRow(M, s, t) {
  const r = M.RESP[s][t.id], st = status(r), open = view.open === t.id, n = t.members.length;
  const fl = teamFlags(t, M.RESP[t.ma]?.[t.id]);
  const c = (l, v) => `<div class="cell"><span class="eyebrow">${l}</span><span>${v ? esc(v) : '<span class="dash">–</span>'}</span></div>`;
  const role = t.role === 'secondary' ? `<span class="flag i">Secondary MA · Primary: ${esc(t.ma)}</span>` : t.sec ? `<span class="flag i">Secondary MA: ${esc(t.sec)}</span>` : '';
  return `<article class="trow ${open ? 'open' : ''}" id="r-${t.id}">
    <button class="trow-head" data-t="${t.id}" aria-expanded="${open}">
      <div><h3>${esc(t.name)}</h3><div class="meta"><span class="tier ${tierCls(t.tier)}">${esc(t.tier)}</span><span>${esc(t.office)}</span><span>${n} ${n === 1 ? 'person' : 'people'}</span></div></div>
      ${c('Hear from them', r?.freq)}${c('Workload', r?.load)}${c('Work type', r?.work != null ? Q.work.stops[r.work] : null)}${c('Reaches you', r ? (r.reach || []).map(k => REACH_SHORT[k]).join(', ') : null)}
      <span class="pill s-${st}">${STATUS_LABEL[st]}</span>
      <div class="trow-flags">${role}${fl.filter(k => k !== 'combine').map(flagChip).join('')}${fl.includes('combine') ? flagChip('combine') : ''}</div>
    </button>
    ${open ? answers(M, t) : ''}</article>`;
}
function dlist(r) {
  if (!r) return '<p class="dash small" style="margin:0">No answers yet.</p>';
  const row = (k, v) => `<dt>${Q[k].label}</dt><dd>${v ? v : '<span class="dash">–</span>'}</dd>`;
  return `<dl>${row('freq', esc(r.freq))}${row('load', esc(r.load))}${row('work', r.work != null ? Q.work.stops[r.work] : '')}
    ${row('reach', (r.reach || []).map(k => esc(REACH_SHORT[k]) + (OFF.includes(k) ? ' <span class="flag w" style="font-size:10px;padding:0 5px">off-process</span>' : '')).join(', '))}
    ${row('plan', r.plan != null ? Q.plan.stops[r.plan] : '')}
    ${row('channels', esc((r.channels || []).join(', ')))}${row('design', esc(r.design))}${row('brand', r.brand ? 'Yes' : r.brand === false ? 'No' : '')}
    ${row('ops', r.ops ? esc(r.ops) + (r.ops === 'Yes' && r.opsName ? ': ' + esc(r.opsName) : '') : '')}${row('specialty', esc(r.specialty).replace(/\n/g, '<br>'))}
    ${row('projects', esc(r.projects).replace(/\n/g, '<br>'))}
    ${row('links', (r.links || []).filter(Boolean).map(l => safeUrl(l) ? `<a href="${esc(l)}" target="_blank" rel="noopener">${esc(l)}</a>` : esc(l)).join('<br>'))}
    ${row('note', esc(r.note).replace(/\n/g, '<br>'))}</dl>
    ${r.updated ? `<p class="dash small" style="margin:6px 0 0">Last updated ${new Date(r.updated).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>` : ''}`;
}
function answers(M, t) {
  const reviewers = [t.ma]; if (t.sec && isPerson(t.sec)) reviewers.push(t.sec);
  const notes = [];
  reviewers.forEach(p => Object.entries(M.RESP[p]?.[t.id]?.agentNotes || {}).forEach(([a, n]) => n && n.trim() && notes.push([a, n, p])));
  return `<div class="answers">
    ${reviewers.length > 1 ? `<div class="combine">This team has two reviewers. ${esc(t.ma)} is the primary MA and ${esc(t.sec)} is the secondary MA. Compare both reviews here before merging them into one record.</div>` : t.sec ? `<div class="combine">Secondary MA on the roster: ${esc(t.sec)}.</div>` : ''}
    <div class="cols">${reviewers.map(p => { const rr = M.RESP[p]?.[t.id]; return `<div class="col"><h4>${esc(p)} <span class="eyebrow">${p === t.ma ? 'Primary MA' : 'Secondary MA'}</span> <span class="pill s-${status(rr)}">${STATUS_LABEL[status(rr)]}</span></h4>${dlist(rr)}</div>`; }).join('')}</div>
    <div class="notes"><h5>Team member notes</h5>
      ${notes.length ? notes.map(([a, n, p]) => `<div class="note"><b>${esc(a)}</b> ${esc(n)}${reviewers.length > 1 ? ` <span class="by">from ${esc(p)}</span>` : ''}</div>`).join('') : '<div class="note dash">No notes on individual team members.</div>'}
      <div class="note by">Principal${t.principals.length > 1 ? 's' : ''}: ${esc(t.principals.join(', ') || 'none listed')} · ${t.members.length} on the team</div>
    </div></div>`;
}

function rosterTab(main, el) {
  const meta = S.rosterMeta;
  const counts = Object.fromEntries(NAMES.map(n => [n, rosterFor(S.roster, n).length]));
  el.innerHTML = `<div class="rosterbox">
    <div><span class="eyebrow">Current roster</span>
      <p>${meta ? `<b>${esc(meta.fileName || 'DMV Agent Directory')}</b>, uploaded ${new Date(meta.importedAt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} by ${esc(meta.importedBy)}. ${S.roster.length} teams.` : 'No roster uploaded yet. Upload the DMV Agent Directory export to give everyone their teams.'}</p>
      ${meta ? `<div class="counts">${NAMES.map(n => `<span><b class="num">${counts[n]}</b> ${esc(n)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="upload">
      <label class="ql" for="rfile">Upload a new DMV Agent Directory export (.xlsx)</label>
      <input type="file" id="rfile" accept=".xlsx">
      <p class="small dash">Teams are matched to staff by the Team Marketing Advisor column. Answers stay attached to each team by name, so a team that keeps its name keeps its answers.</p>
      <div id="preview"></div>
    </div></div>`;
  const prev = el.querySelector('#preview');
  const showPreview = () => {
    if (!upload) { prev.innerHTML = ''; return; }
    if (upload.error) { prev.innerHTML = `<p class="err">${esc(upload.error)}</p>`; return; }
    const by = Object.fromEntries(NAMES.map(n => [n, rosterFor(upload.teams, n).length]));
    const skipped = Object.entries(upload.otherMAs).sort((a, b) => b[1] - a[1]);
    const unPeople = (upload.unassigned || []).reduce((a, t) => a + t.members.length, 0);
    const removed = S.roster.filter(t => !upload.teams.some(u => u.id === t.id)).length;
    prev.innerHTML = `<div class="previewbox"><p><b>${upload.teams.length} teams</b> found in ${esc(upload.fileName)}.${removed ? ` ${removed} teams in the current roster aren't in this file.` : ''}</p>
      <div class="counts">${NAMES.map(n => `<span><b class="num">${by[n]}</b> ${esc(n)}</span>`).join('')}</div>
      ${skipped.length ? `<p class="small dash">Not on a staff roster, shown under Admin > Not on a roster: ${unPeople} people on ${upload.unassigned.length} teams. ${skipped.map(([k, v]) => `${esc(k)} (${v})`).join(', ')}</p>` : ''}
      <div class="row"><button class="btn primary" id="rsave">Replace roster with this file</button><button class="btn" id="rcancel">Cancel</button></div></div>`;
    prev.querySelector('#rcancel').onclick = () => { upload = null; el.querySelector('#rfile').value = ''; showPreview(); };
    prev.querySelector('#rsave').onclick = async e => {
      e.target.disabled = true; e.target.textContent = 'Saving…';
      try {
        await data.saveRoster(upload, S.user);
        setRoster(upload.teams, { fileName: upload.fileName, importedAt: Date.now(), importedBy: S.user.email }, upload.unassigned);
        upload = null; render();
      } catch (err) { e.target.disabled = false; e.target.textContent = 'Replace roster with this file'; prev.insertAdjacentHTML('beforeend', `<p class="err">Couldn't save the roster. ${esc(err.message)}</p>`); }
    };
  };
  el.querySelector('#rfile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    prev.innerHTML = '<p class="dash">Reading file…</p>';
    try {
      const { parseDirectory } = await import('./roster.js');
      upload = { ...parseDirectory(await f.arrayBuffer()), fileName: f.name };
    } catch (err) { upload = { error: err.message }; }
    showPreview();
  };
  showPreview();
}

// Teams whose MA isn't on staff (AEMs, shared service, no MA, Referral Directors, no team).
let un = { q: '', tier: 'all', open: new Set(), groups: new Set() };
export function resetUnassigned() { un = { q: '', tier: 'all', open: new Set(), groups: new Set() }; }
function unassignedTab(el) {
  if (!S.unassigned) {
    el.innerHTML = `<div class="soonbox"><h3>Upload the roster again</h3><p>The current roster was uploaded before this view existed. Upload the DMV Agent Directory again under Roster data and these teams will appear here.</p></div>`;
    return;
  }
  const groups = new Map();
  S.unassigned.forEach(t => { if (!groups.has(t.group)) groups.set(t.group, []); groups.get(t.group).push(t); });
  const order = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length);
  const people = S.unassigned.reduce((a, t) => a + t.members.length, 0);
  const tiers = ['all', 'Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'other'];
  el.innerHTML = `<p class="small dash" style="margin:0 0 12px;max-width:72ch">${people} people on ${S.unassigned.length} teams aren't on anyone's staff roster, grouped by the Team Marketing Advisor in the directory. Use this to see who could be brought onto a roster in the re-org.</p>
    <div class="tools" style="padding-top:0">
      <input class="search" id="uq" type="search" placeholder="Search teams, offices or agents" value="${esc(un.q)}" aria-label="Search teams not on a roster">
      <div class="seg" id="utier" role="group" aria-label="Filter by tier">${tiers.map(t => `<button aria-pressed="${un.tier === t}" data-tier="${t}">${t === 'all' ? 'All tiers' : t === 'other' ? 'No tier' : t}</button>`).join('')}</div>
    </div>
    <div id="ulist"></div>`;
  const list = el.querySelector('#ulist');
  const match = t => {
    if (un.tier === 'other' ? /^Tier \d/.test(t.tier) : un.tier !== 'all' && !t.tier.split(' / ').includes(un.tier)) return false;
    if (!un.q) return true;
    return (t.name + ' ' + t.office + ' ' + t.members.map(m => m[0]).join(' ')).toLowerCase().includes(un.q);
  };
  const draw = () => {
    const html = order.map(g => {
      const ts = groups.get(g).filter(match);
      if (!ts.length) return '';
      const n = ts.reduce((a, t) => a + t.members.length, 0);
      const tc = {}; ts.forEach(t => tc[t.tier] = (tc[t.tier] || 0) + 1);
      const shown = un.q || un.groups.has(g);
      return `<section class="flaggroup"><button class="grouphead" data-g="${esc(g)}" aria-expanded="${!!shown}"><h3>${esc(g)}<span class="num">${ts.length} teams · ${n} people</span></h3><span class="chev" aria-hidden="true"></span></button>
        <div class="legend" style="padding:0">${TIERS.map(([k]) => tc[k] ? `<span>${k}: <b class="num">${tc[k]}</b></span>` : '').join('')}${tierMix(tc, ts.length)}</div>
        ${!shown ? '' : ts.map(t => { const open = un.open.has(t.id); return `<div class="trow ${open ? 'open' : ''}">
          <button class="fitem" data-u="${t.id}" aria-expanded="${open}" style="border:0">
            <span><span class="t">${esc(t.name)}</span> <span class="tier ${tierCls(t.tier)}">${esc(t.tier)}</span></span>
            <span class="m">${esc(t.office || 'Office not listed')} · ${t.members.length} ${t.members.length === 1 ? 'person' : 'people'}${t.principals.length ? ' · Principal: ' + esc(t.principals.join(', ')) : ''}</span></button>
          ${open ? `<div class="answers" style="gap:6px">${t.members.map(m => `<div class="note"><b>${esc(m[0])}</b> <span class="by">${esc(m[1])}${m[2] ? ' · ' + esc(m[2]) : ''}</span></div>`).join('')}</div>` : ''}
        </div>`; }).join('')}</section>`;
    }).join('');
    list.innerHTML = html || '<div class="empty">No teams match. Clear the search or pick another tier.</div>';
    list.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { const g = b.dataset.g; un.groups.has(g) ? un.groups.delete(g) : un.groups.add(g); draw(); });
    list.querySelectorAll('[data-u]').forEach(b => b.onclick = () => { const id = b.dataset.u; un.open.has(id) ? un.open.delete(id) : un.open.add(id); draw(); });
  };
  el.querySelector('#uq').oninput = e => { un.q = e.target.value.toLowerCase(); draw(); };
  el.querySelectorAll('[data-tier]').forEach(b => b.onclick = () => { un.tier = b.dataset.tier; el.querySelectorAll('[data-tier]').forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); });
  draw();
}
