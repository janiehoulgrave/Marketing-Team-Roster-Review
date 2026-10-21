// Data layer. Uses Firebase when firebaseConfig is filled in; otherwise a demo mode that saves in this browser.
import { firebaseConfig } from './firebaseConfig.js';
import { STAFF, ADMINS, DELEGATES } from './config.js';

export const DEMO = !firebaseConfig.apiKey || firebaseConfig.apiKey === 'PASTE_HERE';

const docId = (uid, teamId) => `${uid}__${teamId}`;
let api;

if (!DEMO) {
  const { initializeApp } = await import('firebase/app');
  const { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } = await import('firebase/auth');
  const { getFirestore, doc, getDoc, setDoc, collection, query, where, onSnapshot, serverTimestamp } = await import('firebase/firestore');
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ hd: 'compass.com', prompt: 'select_account' });
  const toUser = u => u && { uid: u.uid, email: (u.email || '').toLowerCase(), name: u.displayName || u.email };
  const toResp = d => { const v = d.data(); return { ...v, updated: v.updated?.toMillis ? v.updated.toMillis() : v.updated }; };
  api = {
    onUser: cb => onAuthStateChanged(auth, u => cb(toUser(u))),
    signIn: () => signInWithPopup(auth, provider),
    signOut: () => signOut(auth),
    async getRoster() { const s = await getDoc(doc(db, 'roster', 'current')); if (!s.exists()) return null; const v = s.data(); return { ...v, teams: JSON.parse(v.json), unassigned: v.unassignedJson ? JSON.parse(v.unassignedJson) : null }; },
    saveRoster: (r, user) => setDoc(doc(db, 'roster', 'current'), { json: JSON.stringify(r.teams), unassignedJson: JSON.stringify(r.unassigned || []), fileName: r.fileName, importedAt: Date.now(), importedBy: user.email }),
    watchMine: (user, cb, err) => onSnapshot(query(collection(db, 'responses'), where('uid', '==', user.uid)), s => cb(s.docs.map(toResp)), err),
    watchAll: (cb, err) => onSnapshot(collection(db, 'responses'), s => cb(s.docs.map(toResp)), err),
    saveResponse: (user, staff, teamId, answers) => setDoc(doc(db, 'responses', docId(user.uid, teamId)),
      { ...answers, uid: user.uid, email: user.email, staff, teamId, updated: serverTimestamp() }),
    // The shared re-org draft: one document that all admins read and write.
    watchReorg: (cb, err) => onSnapshot(doc(db, 'reorg', 'draft'), s => cb(s.exists() ? { ...s.data(), json: undefined, ...(s.data().json ? JSON.parse(s.data().json) : {}), updatedAt: s.data().updatedAt?.toMillis ? s.data().updatedAt.toMillis() : s.data().updatedAt } : null), err),
    saveReorg: (draft, user, name) => setDoc(doc(db, 'reorg', 'draft'), { json: JSON.stringify(draft), updatedBy: name || user.email, updatedEmail: user.email, updatedAt: serverTimestamp() }),
  };
} else {
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const subs = new Set();
  const all = () => Object.values(ls.get('demo-responses', {}));
  const emit = () => subs.forEach(f => f());
  let userCb = () => {};
  api = {
    onUser(cb) { userCb = cb; const e = ls.get('demo-user', null); cb(e ? { uid: 'demo-' + e, email: e, name: e } : null); return () => {}; },
    async signIn(email) { ls.set('demo-user', email); userCb({ uid: 'demo-' + email, email, name: email }); },
    async signOut() { ls.set('demo-user', null); userCb(null); },
    async getRoster() { return ls.get('demo-roster', null); },
    async saveRoster(r, user) { ls.set('demo-roster', { teams: r.teams, unassigned: r.unassigned || [], fileName: r.fileName, importedAt: Date.now(), importedBy: user.email }); },
    watchMine(user, cb) { const f = () => cb(all().filter(r => r.uid === user.uid)); subs.add(f); f(); return () => subs.delete(f); },
    watchAll(cb) { const f = () => cb(all()); subs.add(f); f(); return () => subs.delete(f); },
    watchReorg(cb) { const f = () => cb(ls.get('demo-reorg', null)); subs.add(f); f(); return () => subs.delete(f); },
    async saveReorg(draft, user, name) { ls.set('demo-reorg', { ...draft, updatedBy: name || user.email, updatedEmail: user.email, updatedAt: Date.now() }); emit(); },
    async saveResponse(user, staff, teamId, answers) {
      const m = ls.get('demo-responses', {});
      m[docId(user.uid, teamId)] = { ...answers, uid: user.uid, email: user.email, staff, teamId, updated: Date.now() };
      ls.set('demo-responses', m); emit();
    },
  };
}
export const data = api;

const lower = o => Object.fromEntries(Object.entries(o).map(([n, e]) => [e.toLowerCase(), n]));
const STAFF_BY_EMAIL = lower(STAFF), ADMIN_BY_EMAIL = lower(ADMINS);
export function access(user) {
  if (!user) return null;
  const own = STAFF_BY_EMAIL[user.email] || null;
  const admin = ADMIN_BY_EMAIL[user.email] || null;
  const standIn = !own && DELEGATES[user.email] ? DELEGATES[user.email] : null;
  // staff = whose roster this person reviews; name = who they are.
  return { staff: own || standIn, standIn, admin: !!admin, name: own || admin || user.name };
}
export const DEMO_PEOPLE = [...new Set([...Object.values(STAFF), ...Object.values(ADMINS)])];
