import './style.css';
import { data, access, DEMO, DEMO_PEOPLE } from './data.js';
import { STAFF, ADMINS } from './config.js';
import { renderMine, wireMine, resetMine } from './mine.js';
import { renderAdmin, resetAdmin, adminTab } from './admin.js';
import { esc } from './questions.js';

const app = document.getElementById('app');
export const S = {
  user: null, acc: null, roster: null, rosterMeta: null,
  mine: {}, mineReady: false, all: [], allReady: false,
  tab: null, error: null,
};
let unsubs = [];
export const pending = new Set();
export function setRoster(teams, meta, unassigned) { S.roster = teams; S.rosterMeta = meta; S.unassigned = unassigned; }

export function render() {
  document.body.classList.toggle('wide', S.tab === 'admin');
  document.body.classList.toggle('xwide', S.tab === 'admin' && adminTab() === 'reorg');
  if (!S.user) return renderSignIn();
  if (!S.acc.staff && !S.acc.admin) return renderNoAccess();
  const tabs = S.acc.staff && S.acc.admin
    ? `<nav class="apptabs" aria-label="Sections">${[['mine', 'My roster'], ['admin', 'Admin']].map(([k, l]) => `<button aria-current="${S.tab === k ? 'page' : 'false'}" data-apptab="${k}">${l}</button>`).join('')}</nav>`
    : '';
  app.innerHTML = `
    <header class="top"><div class="wrap">
      <div class="brand"><h1>Roster Review</h1><span class="tag">DMV Marketing${S.tab === 'admin' && !S.acc.staff ? ' · Admin' : ''}</span></div>
      ${tabs}
      <div class="as">${esc(S.acc.name)} <button class="btn link" id="signout">Sign out</button></div>
    </div></header>
    ${DEMO ? `<div class="proof"><div class="wrap"><b>Demo mode.</b> Firebase isn't connected yet, so answers save in this browser only. Paste your Firebase config into src/firebaseConfig.js to go live.</div></div>` : ''}
    ${S.error ? `<div class="proof err"><div class="wrap">${esc(S.error)}</div></div>` : ''}
    <main class="wrap" id="main"></main>`;
  document.getElementById('signout').onclick = () => data.signOut();
  app.querySelectorAll('[data-apptab]').forEach(b => b.onclick = () => {
    S.tab = b.dataset.apptab; history.replaceState(null, '', S.tab === 'admin' ? '#admin' : '#'); render(); window.scrollTo({ top: 0 });
  });
  const main = document.getElementById('main');
  if (S.roster === null) { main.innerHTML = `<div class="empty">Loading your roster…</div>`; return; }
  if (S.tab === 'mine') {
    if (!S.roster.length) { main.innerHTML = `<div class="empty">Your roster hasn't been loaded yet. ${S.acc.admin ? 'Open Admin, then Roster data, to upload the DMV Agent Directory.' : "You'll get a note when it's ready."}</div>`; return; }
    if (!S.mineReady) { main.innerHTML = `<div class="empty">Loading your answers…</div>`; return; }
    main.innerHTML = renderMine();
    wireMine(main);
  } else {
    renderAdmin(main);
  }
}

function renderSignIn() {
  document.body.classList.remove('wide');
  app.innerHTML = `<div class="signin"><div class="signin-card">
    <span class="eyebrow">DMV Marketing</span>
    <h1>Roster Review</h1>
    <p>Review each team on your roster: how often you hear from them, the kind of work they send, and notes on the people you support.</p>
    ${DEMO
      ? `<label class="ql" for="demo-who">Demo mode: choose who to sign in as</label>
         <select id="demo-who">${DEMO_PEOPLE.map(e => `<option value="${esc(e)}">${esc(nameFor(e))}</option>`).join('')}</select>
         <button class="btn primary" id="signin">Sign in</button>`
      : `<button class="btn primary" id="signin">Sign in with Google</button><p class="small">Use your compass.com account.</p><p class="small err" id="signin-err" hidden></p>`}
  </div></div>`;
  document.getElementById('signin').onclick = async () => {
    try { await data.signIn(DEMO ? document.getElementById('demo-who').value : undefined); }
    catch (e) {
      const el = document.getElementById('signin-err');
      if (el && e.code !== 'auth/popup-closed-by-user') { el.hidden = false; el.textContent = 'Sign-in did not finish. ' + (e.code === 'auth/popup-blocked' ? 'Allow pop-ups for this site and try again.' : e.message); }
    }
  };
}
const nameFor = e => Object.entries({ ...STAFF, ...ADMINS }).find(([, v]) => v === e)?.[0] || e;
function renderNoAccess() {
  app.innerHTML = `<div class="signin"><div class="signin-card">
    <h1>No access yet</h1>
    <p>You're signed in as ${esc(S.user.email)}, which isn't on the Roster Review list. Ask Janie to add you, then sign in again.</p>
    <button class="btn" id="signout">Sign out</button></div></div>`;
  document.getElementById('signout').onclick = () => data.signOut();
}

// Start once everything above is defined.

data.onUser(async user => {
  unsubs.forEach(u => u()); unsubs = [];
  resetMine(); resetAdmin();
  Object.assign(S, { user, acc: access(user), roster: null, mine: {}, mineReady: false, all: [], allReady: false, reorg: null, reorgReady: false, error: null });
  if (!user) return render();
  if (!S.acc.staff && !S.acc.admin) return render();
  S.tab = S.acc.staff ? (location.hash === '#admin' && S.acc.admin ? 'admin' : 'mine') : 'admin';
  render();
  try {
    const r = await data.getRoster();
    S.roster = r?.teams || [];
    S.unassigned = r ? r.unassigned : null;
    S.rosterMeta = r ? { fileName: r.fileName, importedAt: r.importedAt, importedBy: r.importedBy } : null;
  } catch (e) { S.error = 'The roster could not be loaded. ' + e.message; }
  const fail = e => { S.error = 'Answers could not be loaded. ' + e.message; render(); };
  if (S.acc.staff) unsubs.push(data.watchMine(user, docs => {
    docs.forEach(d => { if (!pending.has(d.teamId)) S.mine[d.teamId] = d; });
    const first = !S.mineReady; S.mineReady = true;
    if (first || S.tab !== 'mine') render();
  }, fail));
  if (S.acc.admin) unsubs.push(data.watchAll(docs => {
    S.all = docs; S.allReady = true;
    if (S.tab !== 'admin') return;
    // On the Re-org tab, refresh the board in place so an open detail window isn't closed.
    if (adminTab() === 'reorg') import('./reorg.js').then(m => m.reorgRefresh()); else render();
  }, fail));
  if (S.acc.admin) unsubs.push(data.watchReorg(d => {
    S.reorg = d; const first = !S.reorgReady; S.reorgReady = true;
    import('./reorg.js').then(m => { m.reorgRemote(d); if (first && S.tab === 'admin' && adminTab() === 'reorg') render(); });
  }, e => { S.error = 'The re-org draft could not be loaded. ' + e.message; render(); }));
  render();
});
