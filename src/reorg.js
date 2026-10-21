// Admin > Re-org: a shared draft of who should own each team.
// Drag teams between staff, set second MAs, and watch agent counts against each role's benchmark.
// The draft lives in Firestore (reorg/draft) and only admins can read or change it.
import './reorg.css';
import { S } from './main.js';
import { data } from './data.js';
import { STAFF, ROLES, STAFF_ROLE } from './config.js';
import { NEVER, status, STATUS_LABEL as STATUS, esc, tierCls, safeUrl } from './questions.js';

const NAMES = Object.keys(STAFF);
const TIERS = [['Tier 1', 't1'], ['Tier 2', 't2'], ['Tier 3', 't3'], ['Tier 4', 't4']];
const REACH = { zendesk: 'Zendesk', email: 'Direct email', text: 'Text', call: 'Phone call', walkup: 'Walks up in office' };
const OFFP = ['email', 'text', 'call'];
const WORK = ['All templated', 'Mostly templated', 'Even mix', 'Mostly strategic', 'All strategic'];
const PLAN = ['Very reactive', 'Mostly reactive', 'Mixed', 'Mostly proactive', 'Very proactive'];
const WORK_SHORT = ['Templated', 'Mostly templated', 'Mixed work', 'Mostly strategic', 'Strategic'];
const FREQ_SHORT = { 'Weekly or more': 'Weekly+', 'Every couple weeks': 'Biweekly', 'Monthly': 'Monthly', 'Rarely': 'Rarely' };
const LOAD_LVL = { Light: 1, Moderate: 2, Heavy: 3 };
const SEC_OPTIONS = [...NAMES, 'DMV MAs & MCs'];
const BENCH = { ok: 'Within', under: 'Below', over: 'Above' };

// ---- draft state ----
const blank = () => ({ assign: {}, sec: {}, order: [], levels: ROLES.map(r => ({ ...r })) });
let draft = blank(), meta = null, saveTimer = null, saving = false, saveErr = null;
let pool = { q: '', group: 'DMV AEMs', tier: 'all' };
let root = null, ctx = null, resetArmed = false;

function normalize(d) {
  const b = blank();
  if (!d) return b;
  const levels = ROLES.map(r => ({ ...r, ...((d.levels || []).find(l => l.id === r.id) || {}), name: r.name }));
  return { assign: d.assign || {}, sec: d.sec || {}, order: d.order || [], levels };
}
export function reorgRefresh() { if (root && root.isConnected) renderAll(); }
export function reorgRemote(d) {
  if (saveTimer || saving) return; // our own change is on its way; don't overwrite it
  draft = normalize(d);
  meta = d ? { by: d.updatedBy, at: d.updatedAt } : null;
  if (root && root.isConnected) renderAll();
}
function save() {
  clearTimeout(saveTimer);
  setSync('Saving…');
  saveTimer = setTimeout(async () => {
    saveTimer = null; saving = true;
    try { await data.saveReorg(draft, S.user, S.acc.name); saveErr = null; meta = { by: S.acc.name, at: Date.now() }; }
    catch (e) { saveErr = e.message; }
    saving = false; setSync();
  }, 500);
}
function setSync(msg) {
  const el = root && root.querySelector('#syncstate'); if (!el) return;
  el.classList.toggle('err', !!saveErr);
  el.innerHTML = msg ? esc(msg) : saveErr ? `Couldn't save the draft. ${esc(saveErr)} Your last change is still on this page; make another change to retry.`
    : meta?.at ? `Shared draft. Last change by <b>${esc(meta.by || 'an admin')}</b>, ${new Date(meta.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`
    : 'Shared draft. You, Ariel and Sarah all see and edit the same draft. Nothing changes in the directory until you act on it.';
}

// ---- data from the roster and reviews ----
function buildCtx() {
  const isLic = m => m[1] === 'Principal' || m[1] === 'Agent';
  const prep = t => ({ ...t, agents: t.members.filter(isLic).length, people: t.members.length });
  const teams = S.roster.map(prep), poolTeams = (S.unassigned || []).map(prep);
  const ALL = [...teams, ...poolTeams];
  const RESP = Object.fromEntries(NAMES.map(n => [n, {}]));
  S.all.forEach(d => { if (RESP[d.staff]) RESP[d.staff][d.teamId] = d; });
  return {
    teams, poolTeams, ALL, RESP,
    BY_ID: Object.fromEntries(ALL.map(t => [t.id, t])),
    ORIGINAL: Object.fromEntries(ALL.map(t => [t.id, NAMES.includes(t.ma) && !t.group ? t.ma : null])),
    ORIG_SEC: Object.fromEntries(ALL.map(t => [t.id, t.sec || ''])),
  };
}
const owner = id => (id in draft.assign ? draft.assign[id] : ctx.ORIGINAL[id]);
const secOf = id => (id in draft.sec ? draft.sec[id] : ctx.ORIG_SEC[id]);
const changedIds = () => Object.keys(draft.assign).filter(id => ctx.BY_ID[id] && draft.assign[id] !== ctx.ORIGINAL[id]);
const secChangedIds = () => Object.keys(draft.sec).filter(id => ctx.BY_ID[id] && draft.sec[id] !== ctx.ORIG_SEC[id]);
const shortName = n => n === 'DMV MAs & MCs' ? 'MAs & MCs' : n.split(' ')[0];
const secTeamsFor = s => ctx.ALL.filter(t => secOf(t.id) === s && owner(t.id) && owner(t.id) !== s);
const level = s => draft.levels.find(l => l.id === STAFF_ROLE[s]) || draft.levels[0];
const benchStatus = (n, l) => n < l.min ? 'under' : n > l.max ? 'over' : 'ok';
const tierKey = t => (TIERS.find(([k]) => t.split(' / ')[0] === k) || [null])[0];
const tierShort = t => t.replace('No principal tier', 'No tier');
const primaryResp = t => (ctx.ORIGINAL[t.id] ? ctx.RESP[ctx.ORIGINAL[t.id]]?.[t.id] : null);
function flagsFor(t) {
  const r = primaryResp(t), f = [];
  if (r && r.freq !== NEVER) {
    if (r.load === 'Heavy' && r.work != null && r.work <= 1) f.push(['a', 'Heavy and templated']);
    if ((r.reach || []).some(k => OFFP.includes(k))) f.push(['w', 'Goes around Zendesk']);
    if ((r.reach || []).includes('walkup')) f.push(['w', 'Walks up in office']);
  }
  if (r && r.freq === NEVER) f.push(['i', 'Never spoken to']);
  return f;
}
// Agents on teams where this person is the second MA count toward their agent total and benchmark.
function statsFor(name, assignFn, secFn = secOf) {
  const ts = ctx.ALL.filter(t => assignFn(t.id) === name);
  const secTs = ctx.ALL.filter(t => secFn(t.id) === name && assignFn(t.id) !== name);
  const secAgents = secTs.reduce((a, t) => a + t.agents, 0);
  const tiers = {}; let other = 0;
  ts.forEach(t => { const k = tierKey(t.tier); k ? tiers[k] = (tiers[k] || 0) + 1 : other++; });
  const rs = ts.map(primaryResp).filter(r => r && r.freq !== NEVER);
  const w = rs.filter(r => r.work != null);
  return { ts, secTs, secAgents, teams: ts.length, agents: ts.reduce((a, t) => a + t.agents, 0) + secAgents, people: ts.reduce((a, t) => a + t.people, 0), tiers, other,
    heavy: rs.filter(r => r.load === 'Heavy').length, off: rs.filter(r => (r.reach || []).some(k => OFFP.includes(k))).length,
    walk: rs.filter(r => (r.reach || []).includes('walkup')).length, work: w.length ? w.reduce((a, r) => a + r.work, 0) / w.length : null,
    flagged: ts.filter(t => flagsFor(t).some(f => f[0] !== 'i')).length, noReview: ts.filter(t => !primaryResp(t)).length };
}
const today = s => statsFor(s, id => ctx.ORIGINAL[id], id => ctx.ORIG_SEC[id]);

// ---- small pieces ----
const delta = (n, was) => n === was ? '' : `<span class="delta ${n > was ? 'up' : 'down'}">${n > was ? '+' : '−'}${Math.abs(n - was)}</span>`;
function tierBar(x) {
  const total = x.teams || 1;
  return `<div class="tiermix" title="${TIERS.map(([k]) => `${k}: ${x.tiers[k] || 0}`).join(', ')}${x.other ? `, no tier: ${x.other}` : ''}">${TIERS.map(([k, c]) => x.tiers[k] ? `<span style="width:${x.tiers[k] / total * 100}%;background:var(--${c})"></span>` : '').join('')}${x.other ? `<span class="tn" style="width:${x.other / total * 100}%"></span>` : ''}</div>`;
}
const tierLegend = x => `<div class="tierlegend">${TIERS.map(([k]) => `<span>${k.replace('Tier ', 'T')} <b class="num">${x.tiers[k] || 0}</b></span>`).join('')}${x.other ? `<span>None <b class="num">${x.other}</b></span>` : ''}</div>`;
function track(n, was, l, max) {
  const pct = v => Math.min(100, v / max * 100);
  return `<div class="track" title="${n} agents · benchmark ${l.min}–${l.max}"><span class="band" style="left:${pct(l.min)}%;width:${pct(l.max) - pct(l.min)}%"></span>${was !== n ? `<span class="ghost" style="left:${pct(was)}%"></span>` : ''}<span class="mark" style="left:${pct(n)}%"></span></div>`;
}
function lift(t) {
  const r = primaryResp(t);
  if (!ctx.ORIGINAL[t.id] && !r) return '<span class="lift"><span class="none">Not reviewed</span></span>';
  if (!r) return '<span class="lift"><span class="none">No review yet</span></span>';
  if (r.freq === NEVER) return '<span class="lift"><span class="none">Never spoken to</span></span>';
  const lv = LOAD_LVL[r.load] || 0;
  const bits = [r.freq && FREQ_SHORT[r.freq], r.work != null && WORK_SHORT[r.work]].filter(Boolean);
  return `<span class="lift" title="Workload: ${esc(r.load || 'not answered')}"><span class="meter ${lv ? 'l' + lv : ''}"><i></i><i></i><i></i></span><b>${esc(r.load || 'No workload')}</b>${bits.map(b => `<span>· ${esc(b)}</span>`).join('')}</span>`;
}
function chip(t) {
  const orig = ctx.ORIGINAL[t.id], moved = owner(t.id) !== orig;
  const from = moved ? (orig ? `from ${orig.split(' ')[0]}` : `from ${t.group}`) : '';
  const sec = secOf(t.id), secNew = secOf(t.id) !== ctx.ORIG_SEC[t.id];
  const secTag = sec ? `<span class="sec2 ${secNew ? 'new' : ''}">${secNew ? 'New 2nd' : '2nd'}: ${esc(shortName(sec))}</span>` : secNew ? '<span class="sec2 new">2nd MA removed</span>' : '';
  return `<div class="chip ${moved ? 'moved' : ''}" draggable="true" role="button" tabindex="0" data-id="${esc(t.id)}" aria-label="${esc(t.name)}, ${esc(t.tier)}, ${t.agents} agents. Drag to move, or press Enter for details.">
    <span class="nm">${esc(t.name)}</span><span class="tier ${tierCls(t.tier)}">${esc(tierShort(t.tier).replace('Tier ', 'T'))}</span>
    <span class="sub"><span class="num">${t.agents} agt</span>${t.office ? `<span>${esc(t.office.split(',')[0])}</span>` : ''}${flagsFor(t).map(f => `<span class="dot ${f[0]}" title="${esc(f[1])}"></span>`).join('')}${from ? `<span class="from">${esc(from)}</span>` : ''}${secTag}</span>${lift(t)}</div>`;
}

// ---- render ----
export function renderReorg(el) {
  root = el;
  ctx = buildCtx();
  if (!S.reorgReady) { el.innerHTML = '<div class="empty">Loading the shared draft…</div>'; return; }
  if (!ctx.teams.length) { el.innerHTML = '<div class="empty">Upload the roster under Roster data first.</div>'; return; }
  el.innerHTML = `<div class="reorg">
    <div class="syncbar"><span class="syncstate" id="syncstate"></span><div class="actions"><button class="btn primary" id="rexport">Export revised roster</button><button class="btn" id="rcopy">Copy change list</button><button class="btn" id="rreset">Reset to current roster</button></div></div>
    <section class="glance" id="glance"></section>
    <details class="bench"><summary>Level benchmarks<span>Licensed agents per person by role. Changes here are shared with the other admins.</span></summary><div class="benchgrid" id="benchgrid"></div></details>
    <div class="layout">
      <div class="board" id="board"></div>
      <div class="side">
        <section class="panel pool" id="rpool" data-drop="__pool">
          <div class="panel-head"><div><span class="eyebrow">Drag in from here</span><h2>Not on a roster</h2></div>
            <div class="poolctl"><input type="search" id="pq" placeholder="Search team, office or principal" aria-label="Search teams not on a roster" value="${esc(pool.q)}">
              <div class="row"><select id="pgroup" aria-label="Group"></select>
              <select id="ptier" aria-label="Tier"><option value="all">All tiers</option><option>Tier 1</option><option>Tier 2</option><option>Tier 3</option><option>Tier 4</option><option value="none">No tier</option></select></div></div></div>
          <div class="tlist" id="poollist"></div>
        </section>
        <section class="panel"><div class="panel-head"><div><span class="eyebrow">Proposed changes</span><h2 id="chTitle">No changes yet</h2></div></div><div class="changes" id="changes"></div></section>
      </div>
    </div>
    <div class="scrim" id="scrim" hidden><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mTitle" id="modal"></div></div>
    <div class="toast" id="toast" hidden></div>
  </div>`;
  el.querySelector('#ptier').value = pool.tier;
  el.querySelector('#pq').oninput = e => { pool.q = e.target.value.toLowerCase(); renderPool(); };
  el.querySelector('#ptier').onchange = e => { pool.tier = e.target.value; renderPool(); };
  el.querySelector('#rcopy').onclick = copyList;
  el.querySelector('#rexport').onclick = exportRoster;
  el.querySelector('#rreset').onclick = reset;
  el.querySelector('#scrim').addEventListener('click', e => { if (e.target.id === 'scrim') closeModal(); });
  wireGlobal();
  renderAll();
}
function renderAll() {
  ctx = buildCtx();
  renderGlance(); renderBench(); renderBoard(); renderPool(); renderChanges(); setSync();
}
function renderGlance() {
  const within = NAMES.filter(s => benchStatus(statsFor(s, owner).agents, level(s)) === 'ok').length;
  const ch = changedIds().length, sc = secChangedIds().length;
  root.querySelector('#glance').innerHTML = `<div class="glance-head"><div><span class="eyebrow">${within} of ${NAMES.length} within their role's benchmark${ch || sc ? ` · ${[ch && `${ch} team${ch > 1 ? 's' : ''} moved`, sc && `${sc} second MA change${sc > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}` : ''}</span><h2>Drag a team onto a card to move it</h2></div>
    <div class="key"><span><i style="background:var(--ok-soft);border:1px solid var(--ok)"></i>Benchmark range</span><span><i style="background:var(--ink)"></i>Agents now</span><span><i style="background:var(--muted);width:3px"></i>Today</span>${TIERS.map(([k, c]) => `<span><i style="background:var(--${c})"></i>${k}</span>`).join('')}<span><span class="dot a"></span> Heavy and templated</span><span><span class="dot w"></span> Off-process or walk-ups</span><span><span class="dot i"></span> Never spoken to</span></div></div>`;
}
function renderBench() {
  const g = root.querySelector('#benchgrid');
  g.innerHTML = draft.levels.map(l => `<div class="benchrow"><b>${esc(l.name)}</b><div class="range"><input type="number" id="min-${l.id}" min="0" value="${l.min}" aria-label="${esc(l.name)} minimum agents"> to <input type="number" id="max-${l.id}" min="0" value="${l.max}" aria-label="${esc(l.name)} maximum agents"> agents</div></div>`).join('');
  draft.levels.forEach(l => ['min', 'max'].forEach(k => g.querySelector(`#${k}-${l.id}`).oninput = e => { l[k] = Math.max(0, +e.target.value || 0); save(); renderGlance(); renderBoard(); }));
}
function renderBoard() {
  const tierOrder = t => { const k = tierKey(t.tier); return k ? +k.slice(-1) : 9; };
  const rows = NAMES.map(s => ({ s, x: statsFor(s, owner), was: today(s), l: level(s) }));
  const max = Math.max(...rows.map(r => Math.max(r.x.agents, r.was.agents, r.l.max))) * 1.08;
  root.querySelector('#board').innerHTML = rows.map(({ s, x, was, l }) => {
    const st = benchStatus(x.agents, l);
    const ts = x.ts.slice().sort((a, b) => (owner(b.id) !== ctx.ORIGINAL[b.id]) - (owner(a.id) !== ctx.ORIGINAL[a.id]) || tierOrder(a) - tierOrder(b) || b.agents - a.agents);
    const sigs = `${x.heavy ? `<span class="sig a">${x.heavy} heavy</span>` : ''}${x.off ? `<span class="sig w">${x.off} off-process</span>` : ''}${x.walk ? `<span class="sig w">${x.walk} walk-up</span>` : ''}${x.noReview ? `<span class="sig n">${x.noReview} no review</span>` : ''}`;
    const st2 = secTeamsFor(s);
    return `<article class="mcard" data-drop="${esc(s)}">
      <div class="mhead">
        <div class="mtitle"><h3><button class="link" data-staff="${esc(s)}">${esc(s)}</button></h3><span class="pill p-${st}">${BENCH[st]}</span></div>
        <span class="mrole">${esc(l.name)}</span>
        <div class="mcounts">
          <div><span class="eyebrow">Teams</span><b class="num">${x.teams}${delta(x.teams, was.teams)}</b></div>
          <div><span class="eyebrow">Agents</span><b class="num">${x.agents}${delta(x.agents, was.agents)}</b>${x.secAgents ? `<span class="sub2">incl. ${x.secAgents} as 2nd</span>` : ''}</div>
        </div>
        <div class="mgauge"><span class="eyebrow">Benchmark ${l.min}–${l.max} agents</span>${track(x.agents, was.agents, l, max)}</div>
        <div class="mgauge"><span class="eyebrow">Tier mix</span>${tierBar(x)}${tierLegend(x)}</div>
        <div class="signals">${sigs || '<span class="sig n">No review flags</span>'}</div>
        ${st2.length ? `<div class="secon"><span class="eyebrow">Second MA on ${st2.length}</span>${st2.map(t => `<button class="link ${secOf(t.id) !== ctx.ORIG_SEC[t.id] ? 'new' : ''}" data-team="${esc(t.id)}">${esc(t.name)}</button>`).join('')}</div>` : ''}
      </div>
      <div class="tlist">${ts.length ? ts.map(chip).join('') : '<div class="drophint">Drag teams here</div>'}</div>
    </article>`;
  }).join('');
}
function renderPool() {
  const groups = [...new Set(ctx.poolTeams.map(t => t.group))].sort((a, b) => ctx.poolTeams.filter(t => t.group === b).length - ctx.poolTeams.filter(t => t.group === a).length);
  const gsel = root.querySelector('#pgroup');
  if (!gsel.options.length) {
    if (!groups.includes(pool.group)) pool.group = 'all';
    gsel.innerHTML = `<option value="all">All groups</option><option value="__moved">Taken off a roster</option>` + groups.map(g => `<option value="${esc(g)}">${esc(g)} (${ctx.poolTeams.filter(t => t.group === g).length})</option>`).join('');
    gsel.value = pool.group;
    gsel.onchange = e => { pool.group = e.target.value; renderPool(); };
  }
  const list = ctx.ALL.filter(t => owner(t.id) === null).filter(t => {
    if (pool.group === '__moved' ? !!t.group : pool.group !== 'all' && t.group !== pool.group) return false;
    if (pool.tier === 'none' ? tierKey(t.tier) : pool.tier !== 'all' && tierKey(t.tier) !== pool.tier) return false;
    return !pool.q || (t.name + ' ' + t.office + ' ' + t.principals.join(' ')).toLowerCase().includes(pool.q);
  });
  const LIMIT = 60;
  root.querySelector('#poollist').innerHTML = !S.unassigned
    ? '<div class="drophint">Upload the roster again under Roster data to see teams that aren\'t on a roster.</div>'
    : list.length ? list.slice(0, LIMIT).map(chip).join('') + (list.length > LIMIT ? `<div class="more">Showing ${LIMIT} of ${list.length}. Search or filter to narrow.</div>` : '')
    : '<div class="drophint">No teams match. Drag a team here to take it off a roster.</div>';
}
function renderChanges() {
  const ch = changedIds(), sc = secChangedIds(), total = ch.length + sc.length;
  root.querySelector('#chTitle').textContent = total ? `${total} change${total > 1 ? 's' : ''}` : 'No changes yet';
  const keys = ch.concat(sc.map(id => 'sec:' + id));
  const ordered = draft.order.filter(k => keys.includes(k)).reverse();
  keys.forEach(k => { if (!ordered.includes(k)) ordered.push(k); });
  root.querySelector('#changes').innerHTML = ordered.length ? ordered.map(k => {
    if (k.startsWith('sec:')) {
      const id = k.slice(4), t = ctx.BY_ID[id];
      return `<div class="change"><button class="link t" data-team="${esc(id)}">${esc(t.name)}</button><span class="ft">Second MA: ${esc(ctx.ORIG_SEC[id] || 'none')} → <b class="secb">${esc(secOf(id) || 'none')}</b></span><button class="btn" data-undosec="${esc(id)}">Undo</button></div>`;
    }
    const t = ctx.BY_ID[k];
    return `<div class="change"><button class="link t" data-team="${esc(k)}">${esc(t.name)}</button><span class="ft">${esc(ctx.ORIGINAL[k] || t.group)} → ${esc(owner(k) || 'Not on a roster')} · ${t.agents} agent${t.agents === 1 ? '' : 's'}</span><button class="btn" data-undo="${esc(k)}">Undo</button></div>`;
  }).join('') : '<p class="empty">Drag a team onto another person\'s card to move it. To add or change a second MA, click the team. Every change shows up here so you can undo it.</p>';
}

// ---- changes ----
function putSec(id, v) { if (v === ctx.ORIG_SEC[id]) delete draft.sec[id]; else draft.sec[id] = v; draft.order = draft.order.filter(x => x !== 'sec:' + id).concat('sec:' + id); }
function move(id, to) {
  to = to === '__pool' ? null : to;
  if (owner(id) === to) return;
  if (to === ctx.ORIGINAL[id]) delete draft.assign[id]; else draft.assign[id] = to;
  if (to && secOf(id) === to) putSec(id, ''); // the new primary can't also be the second
  draft.order = draft.order.filter(x => x !== id).concat(id);
  save(); renderAll();
  toast(`${ctx.BY_ID[id].name} moved to ${to || 'Not on a roster'}`);
}
function reset(e) {
  if (!changedIds().length && !secChangedIds().length) return toast('Nothing to reset yet.');
  if (!resetArmed) { resetArmed = true; e.target.textContent = 'Press again to reset for everyone'; setTimeout(() => { resetArmed = false; if (e.target.isConnected) e.target.textContent = 'Reset to current roster'; }, 3000); return; }
  resetArmed = false; e.target.textContent = 'Reset to current roster';
  draft.assign = {}; draft.sec = {}; draft.order = []; save(); renderAll(); toast('Draft reset to the current roster.');
}
// ---- export: every person in the directory, their old and new marketing assignment, and review notes ----
const REVIEW_LINES = r => r.freq === NEVER ? ["I've never spoken to them."] : [
  ['How often they hear from them', r.freq], ['Workload', r.load], ['Kind of work', r.work != null ? WORK[r.work] : ''],
  ['How they reach them', (r.reach || []).map(k => REACH[k]).join(', ')], ['Planning style', r.plan != null ? PLAN[r.plan] : ''],
  ['Preferred channels', (r.channels || []).join(', ')], ['Design style', r.design], ['Has a brand system', r.brand ? 'Yes' : r.brand === false ? 'No' : ''],
  ['Marketing admin / ops manager', r.ops ? r.ops + (r.ops === 'Yes' && r.opsName ? ': ' + r.opsName : '') : ''], ['Specialty', r.specialty],
  ['Recent projects', (r.projects || '').replace(/\n+/g, '; ')], ['Go-to templates', (r.links || []).filter(Boolean).join(' ')], ['Additional notes', r.note],
].filter(([, v]) => v && String(v).trim()).map(([k, v]) => `${k}: ${String(v).trim()}`);
function reviewers(t) { const o = ctx.ORIGINAL[t.id]; return o ? [o].concat(t.sec && NAMES.includes(t.sec) && t.sec !== o ? [t.sec] : []) : []; }
function teamNote(t) {
  const rs = reviewers(t);
  if (!rs.length) return '';
  return rs.map(p => { const r = ctx.RESP[p]?.[t.id]; const head = `Team review from ${p}${p === ctx.ORIGINAL[t.id] ? '' : ' (second MA)'}:`;
    return r ? [head, ...REVIEW_LINES(r)].join('\n') : `${head} no review yet.`; }).join('\n\n');
}
function personNote(t, name) {
  return reviewers(t).map(p => { const n = ctx.RESP[p]?.[t.id]?.agentNotes?.[name]; return n && n.trim() ? `Note on ${name.split(' ')[0]} from ${p}: ${n.trim()}` : ''; }).filter(Boolean).join('\n');
}
async function exportRoster(e) {
  const btn = e.target; btn.disabled = true; btn.textContent = 'Building file…';
  try {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = S.acc.name; wb.created = new Date();
    const head = (ws, cols) => { ws.columns = cols; ws.getRow(1).font = { bold: true }; ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECEEF3' } }; ws.views = [{ state: 'frozen', ySplit: 1 }]; ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } }; };

    const ws = wb.addWorksheet('Revised roster');
    head(ws, [
      { header: 'Name', key: 'name', width: 26 }, { header: 'Role', key: 'role', width: 14 }, { header: 'Agent tier', key: 'atier', width: 11 },
      { header: 'Team', key: 'team', width: 30 }, { header: 'Team tier', key: 'ttier', width: 11 }, { header: 'Office', key: 'office', width: 18 },
      { header: 'Current MA', key: 'curMA', width: 22 }, { header: 'New MA', key: 'newMA', width: 22 }, { header: 'MA changed', key: 'chg', width: 11 },
      { header: 'Current second MA', key: 'curSec', width: 20 }, { header: 'New second MA', key: 'newSec', width: 20 },
      { header: 'Notes', key: 'notes', width: 80 },
    ]);
    const sorted = ctx.ALL.slice().sort((a, b) => (owner(a.id) || a.group || '').localeCompare(owner(b.id) || b.group || '') || a.name.localeCompare(b.name));
    sorted.forEach(t => {
      const cur = ctx.ORIGINAL[t.id] || t.group || '', nw = owner(t.id) || (ctx.ORIGINAL[t.id] ? 'Not on a roster' : t.group || '');
      const tn = teamNote(t);
      t.members.forEach(m => {
        const pn = personNote(t, m[0]);
        const row = ws.addRow({ name: m[0], role: m[1], atier: m[2], team: t.name, ttier: tierShort(t.tier), office: t.office, curMA: cur, newMA: nw,
          chg: cur !== nw ? 'Yes' : '', curSec: ctx.ORIG_SEC[t.id], newSec: secOf(t.id), notes: [tn, pn].filter(Boolean).join('\n\n') });
        row.alignment = { vertical: 'top', wrapText: true };
        if (cur !== nw) row.getCell('newMA').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6ECFC' } };
        if (secOf(t.id) !== ctx.ORIG_SEC[t.id]) row.getCell('newSec').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6ECFC' } };
      });
    });

    const sum = wb.addWorksheet('Staff summary');
    head(sum, [{ header: 'Staff', key: 's', width: 22 }, { header: 'Role', key: 'r', width: 28 }, { header: 'Teams today', key: 't0', width: 12 }, { header: 'Teams proposed', key: 't1', width: 14 },
      { header: 'Agents today', key: 'a0', width: 13 }, { header: 'Agents proposed', key: 'a1', width: 15 }, { header: 'Incl. as second MA', key: 'sa', width: 17 }, { header: 'Benchmark', key: 'b', width: 12 }, { header: 'Status', key: 'st', width: 12 }]);
    NAMES.forEach(s => { const x = statsFor(s, owner), w = today(s), l = level(s); sum.addRow({ s, r: l.name, t0: w.teams, t1: x.teams, a0: w.agents, a1: x.agents, sa: x.secAgents || '', b: `${l.min}-${l.max}`, st: BENCH[benchStatus(x.agents, l)] }); });

    const chs = wb.addWorksheet('Changes');
    head(chs, [{ header: 'Team', key: 't', width: 32 }, { header: 'Change', key: 'c', width: 16 }, { header: 'From', key: 'f', width: 24 }, { header: 'To', key: 'to', width: 24 }, { header: 'Agents', key: 'a', width: 9 }]);
    changedIds().forEach(id => { const t = ctx.BY_ID[id]; chs.addRow({ t: t.name, c: 'Primary MA', f: ctx.ORIGINAL[id] || t.group, to: owner(id) || 'Not on a roster', a: t.agents }); });
    secChangedIds().forEach(id => { const t = ctx.BY_ID[id]; chs.addRow({ t: t.name, c: 'Second MA', f: ctx.ORIG_SEC[id] || 'none', to: secOf(id) || 'none', a: t.agents }); });

    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a'); a.href = url; a.download = `Revised Roster ${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Revised roster downloaded.');
  } catch (err) { toast("Couldn't build the file. " + err.message); }
  btn.disabled = false; btn.textContent = 'Export revised roster';
}
async function copyList() {
  const ids = changedIds(), sids = secChangedIds();
  if (!ids.length && !sids.length) return toast('No changes to copy yet.');
  const lines = ['Proposed roster changes', ''].concat(
    ids.map(id => { const t = ctx.BY_ID[id]; return `${t.name} (${tierShort(t.tier)}, ${t.agents} agents): ${ctx.ORIGINAL[id] || t.group} -> ${owner(id) || 'Not on a roster'}`; }),
    sids.length ? ['', 'Second MA changes'].concat(sids.map(id => `${ctx.BY_ID[id].name}: second MA ${ctx.ORIG_SEC[id] || 'none'} -> ${secOf(id) || 'none'}`)) : [],
    ['', 'Resulting load'], NAMES.map(s => { const x = statsFor(s, owner), l = level(s); return `${s}: ${x.teams} teams, ${x.agents} agents (${l.name} benchmark ${l.min}-${l.max})`; }));
  try { await navigator.clipboard.writeText(lines.join('\n')); toast('Change list copied.'); }
  catch (err) { toast('Your browser blocked copying. Select the list under Proposed changes instead.'); }
}

// ---- drag, click and keyboard (attached once, only act inside the re-org) ----
let wired = false;
function wireGlobal() {
  if (wired) return; wired = true;
  const inside = e => root && root.isConnected && e.target.closest && e.target.closest('.reorg');
  const dropTarget = el => el.closest && el.closest('.reorg [data-drop]');
  document.addEventListener('dragstart', e => { if (!inside(e)) return; const c = e.target.closest('.chip'); if (!c) return; e.dataTransfer.setData('text/plain', c.dataset.id); e.dataTransfer.effectAllowed = 'move'; c.classList.add('dragging'); });
  document.addEventListener('dragend', e => { if (e.target.classList) e.target.classList.remove('dragging'); root && root.querySelectorAll('.over').forEach(x => x.classList.remove('over')); });
  document.addEventListener('dragover', e => { if (!inside(e)) return; const t = dropTarget(e.target); if (!t) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; root.querySelectorAll('.over').forEach(x => x !== t && x.classList.remove('over')); t.classList.add('over'); });
  document.addEventListener('dragleave', e => { if (!inside(e)) return; const t = dropTarget(e.target); if (t && !t.contains(e.relatedTarget)) t.classList.remove('over'); });
  document.addEventListener('drop', e => { if (!inside(e)) return; const t = dropTarget(e.target); if (!t) return; e.preventDefault(); t.classList.remove('over'); const id = e.dataTransfer.getData('text/plain'); if (ctx.BY_ID[id]) move(id, t.dataset.drop); });
  document.addEventListener('click', e => {
    if (!inside(e)) return;
    const modalOpen = !root.querySelector('#scrim').hidden;
    if (modalOpen && !e.target.closest('#modal [data-team], #modal [data-staff]')) return;
    const u = e.target.closest('[data-undo]'); if (u) { delete draft.assign[u.dataset.undo]; save(); renderAll(); return; }
    const us = e.target.closest('[data-undosec]'); if (us) { delete draft.sec[us.dataset.undosec]; save(); renderAll(); return; }
    const c = e.target.closest('.chip, [data-team]'); if (c) { openTeam(c.dataset.id || c.dataset.team); return; }
    const s = e.target.closest('[data-staff]'); if (s) { openStaff(s.dataset.staff); return; }
  });
  document.addEventListener('keydown', e => {
    if (!root || !root.isConnected) return;
    if (e.key === 'Escape' && !root.querySelector('#scrim').hidden) return closeModal();
    const c = e.target.closest && e.target.closest('.reorg .chip');
    if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openTeam(c.dataset.id); }
  });
}

// ---- detail windows ----
let lastFocus = null;
function openModal(html) {
  const scrim = root.querySelector('#scrim'), m = root.querySelector('#modal');
  if (scrim.hidden) lastFocus = document.activeElement;
  m.innerHTML = html; scrim.hidden = false; document.body.classList.add('modal-open'); m.scrollTop = 0;
  const c = m.querySelector('.close'); c.onclick = closeModal; c.focus();
}
function closeModal() { root.querySelector('#scrim').hidden = true; document.body.classList.remove('modal-open'); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
function answersList(r) {
  if (!r) return '<p class="empty">No review yet.</p>';
  if (r.freq === NEVER) return `<p class="empty">Marked "I've never spoken to them."</p>`;
  const row = (l, v) => `<dt>${l}</dt><dd>${v || '<span class="muted">–</span>'}</dd>`;
  return `<dl>${row('How often they hear from them', esc(r.freq))}${row('Workload', esc(r.load))}${row('Kind of work', r.work != null ? WORK[r.work] : '')}
    ${row('How they reach them', (r.reach || []).map(k => esc(REACH[k]) + (k !== 'zendesk' ? ' <span class="flag w" style="font-size:10px;padding:0 5px">off-process</span>' : '')).join(', '))}
    ${row('Planning style', r.plan != null ? PLAN[r.plan] : '')}${row('Preferred channels', esc((r.channels || []).join(', ')))}
    ${row('Design style', esc(r.design))}${row('Has a brand system', r.brand ? 'Yes' : r.brand === false ? 'No' : '')}
    ${row('Marketing admin / ops manager', r.ops ? esc(r.ops) + (r.ops === 'Yes' && r.opsName ? ': ' + esc(r.opsName) : '') : '')}${row('Specialty', esc(r.specialty).replace(/\n/g, '<br>'))}
    ${row('Recent projects', esc(r.projects).replace(/\n/g, '<br>'))}
    ${row('Go-to templates', (r.links || []).filter(Boolean).map(l => safeUrl(l) ? `<a href="${esc(l)}" target="_blank" rel="noopener">${esc(l)}</a>` : esc(l)).join('<br>'))}
    ${row('Additional notes', esc(r.note).replace(/\n/g, '<br>'))}</dl>`;
}
function openTeam(id) {
  const t = ctx.BY_ID[id]; if (!t) return;
  const now = owner(id), orig = ctx.ORIGINAL[id];
  const reviewers = orig ? [orig].concat(t.sec && NAMES.includes(t.sec) && t.sec !== orig ? [t.sec] : []) : [];
  const notes = {};
  reviewers.forEach(p => Object.entries(ctx.RESP[p]?.[id]?.agentNotes || {}).forEach(([a, n]) => { if (n && n.trim()) notes[a] = (notes[a] || []).concat([[n, p]]); }));
  const where = now ? (now !== orig ? `Proposed: <b>${esc(now)}</b>. Today: ${esc(orig || t.group)}.` : `With <b>${esc(now)}</b> today.`)
    : (orig ? `Proposed: take off ${esc(orig)}'s roster.` : `Not on a staff roster today (${esc(t.group)}).`);
  openModal(`<div class="mtop"><h2 id="mTitle">${esc(t.name)}</h2><button class="close" aria-label="Close">×</button>
      <div class="meta"><span class="tier ${tierCls(t.tier)}">${esc(tierShort(t.tier))}</span><span>${esc(t.office || 'Office not listed')}</span><span>${t.agents} agents · ${t.people} people</span><span>Principal${t.principals.length > 1 ? 's' : ''}: ${esc(t.principals.join(', ') || 'none listed')}</span></div></div>
    <div class="mbody">
      <div class="callout ${now !== orig ? '' : 'plain'}">${where}</div>
      ${now ? `<div class="secctl"><label for="secsel" class="eyebrow">Second MA</label>
        <select id="secsel">${['', ...SEC_OPTIONS].filter(o => o !== now).map(o => `<option value="${esc(o)}" ${o === secOf(id) ? 'selected' : ''}>${o ? esc(o) : 'None'}</option>`).join('')}</select>
        <span class="muted">${secOf(id) !== ctx.ORIG_SEC[id] ? 'Proposed. ' : ''}Today: ${esc(ctx.ORIG_SEC[id] || 'none')}. A second MA's agents count toward their agent total.</span></div>`
        : (ctx.ORIG_SEC[id] ? `<p class="muted" style="margin:0">Second MA today: ${esc(ctx.ORIG_SEC[id])}.</p>` : '')}
      <div class="flags">${flagsFor(t).map(f => `<span class="flag ${f[0]}">${esc(f[1])}</span>`).join('')}</div>
      ${reviewers.length ? `<div class="sect"><h4>Review</h4><div class="cols">${reviewers.map(p => { const r = ctx.RESP[p]?.[id]; return `<div><p class="eyebrow" style="margin:0 0 4px">${esc(p)} · ${p === orig ? 'primary MA' : 'secondary MA'} <span class="pill s-${status(r)}">${STATUS[status(r)]}</span></p>${answersList(r)}</div>`; }).join('')}</div></div>`
        : `<div class="callout plain">No review. Only teams on a staff roster get reviewed.</div>`}
      <div class="sect"><h4>Team members <span class="muted" style="font-family:var(--ui);font-size:13px">${t.people}</span></h4>
        <div class="people">${t.members.map(m => `<div class="person"><b>${esc(m[0])}</b><span class="r">${esc(m[1])}${m[2] ? ' · ' + esc(m[2]) : ''}</span>${(notes[m[0]] || []).map(([n, p]) => `<span class="note">${esc(n)}${reviewers.length > 1 ? ` <span class="muted">(${esc(p.split(' ')[0])})</span>` : ''}</span>`).join('')}</div>`).join('')}</div></div>
    </div>`);
  const sel = root.querySelector('#secsel');
  if (sel) sel.onchange = () => { putSec(id, sel.value); save(); renderAll(); openTeam(id); toast(sel.value ? `${sel.value} set as second MA on ${t.name}` : `Second MA removed from ${t.name}`); };
}
function openStaff(s) {
  const x = statsFor(s, owner), was = today(s), l = level(s), st = benchStatus(x.agents, l);
  const all = ctx.teams.filter(t => t.ma === s || t.sec === s);
  const done = all.filter(t => status(ctx.RESP[s][t.id]) === 'done').length;
  const movedIn = x.ts.filter(t => ctx.ORIGINAL[t.id] !== s), movedOut = was.ts.filter(t => owner(t.id) !== s);
  const st2 = secTeamsFor(s);
  const rows = x.ts.map(t => { const r = primaryResp(t); return `<tr data-team="${esc(t.id)}"><td><b>${esc(t.name)}</b>${ctx.ORIGINAL[t.id] !== s ? ` <span class="muted">from ${esc(ctx.ORIGINAL[t.id] || t.group)}</span>` : ''}</td><td><span class="tier ${tierCls(t.tier)}">${esc(tierShort(t.tier))}</span></td><td class="num">${t.agents}</td><td>${esc(r?.freq === NEVER ? 'Never spoken' : r?.load || '–')}</td><td>${r?.work != null ? WORK[r.work] : '–'}</td><td>${flagsFor(t).map(f => `<span class="dot ${f[0]}" title="${esc(f[1])}"></span>`).join(' ')}</td></tr>`; }).join('');
  openModal(`<div class="mtop"><h2 id="mTitle">${esc(s)}</h2><button class="close" aria-label="Close">×</button>
      <div class="meta"><span>${esc(l.name)}</span><span class="pill p-${st}">${BENCH[st]} benchmark (${l.min}–${l.max} agents)</span><span>Reviews: ${done} of ${all.length} complete</span></div></div>
    <div class="mbody">
      <div class="stats4">
        <div class="st"><span class="eyebrow">Teams</span><span class="v num">${x.teams}${delta(x.teams, was.teams)}</span><span class="d">Today: ${was.teams}</span></div>
        <div class="st"><span class="eyebrow">Agents</span><span class="v num">${x.agents}${delta(x.agents, was.agents)}</span><span class="d">Today: ${was.agents}${x.secAgents ? ` · incl. ${x.secAgents} as 2nd MA` : ''}</span></div>
        <div class="st"><span class="eyebrow">Heavy teams</span><span class="v num">${x.heavy}</span><span class="d">From reviews</span></div>
        <div class="st"><span class="eyebrow">Work type</span><span class="v" style="font-size:19px;padding-block:5px">${x.work == null ? '–' : WORK[Math.round(x.work)]}</span><span class="d">Average across reviewed teams</span></div>
      </div>
      <div class="sect"><h4>Tier mix</h4>${tierBar(x)}${tierLegend(x)}</div>
      <div class="flags">${x.off ? `<span class="flag w">${x.off} teams go around Zendesk</span>` : ''}${x.walk ? `<span class="flag w">${x.walk} with walk-ups</span>` : ''}${x.flagged ? `<span class="flag a">${x.flagged} flagged teams</span>` : ''}${x.noReview ? `<span class="flag i">${x.noReview} teams without a review</span>` : ''}</div>
      ${st2.length ? `<div class="callout">Second MA on: ${st2.map(t => `${esc(t.name)} (primary ${esc(owner(t.id))}${secOf(t.id) !== ctx.ORIG_SEC[t.id] ? ', new' : ''})`).join(', ')}.</div>` : ''}
      ${movedIn.length || movedOut.length ? `<div class="callout">${movedIn.length ? `Coming in: ${movedIn.map(t => esc(t.name)).join(', ')}. ` : ''}${movedOut.length ? `Going out: ${movedOut.map(t => `${esc(t.name)} (to ${esc(owner(t.id) || 'no roster')})`).join(', ')}.` : ''}</div>` : ''}
      <div class="sect"><h4>Teams in this draft</h4><div class="tablebox"><table class="mini"><thead><tr><th>Team</th><th>Tier</th><th>Agents</th><th>Workload</th><th>Work type</th><th>Flags</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="muted">No teams.</td></tr>'}</tbody></table></div><p class="muted" style="margin:0;font-size:12px">Select a team to see its full review.</p></div>
    </div>`);
}
let tt;
function toast(msg) { const t = root.querySelector('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, 2200); }
