// Turns the DMV Agent Directory export (.xlsx) into teams grouped by Team Marketing Advisor.
import * as XLSX from 'xlsx';
import { STAFF } from './config.js';

const SECTIONS = ['Principals', 'Agents', 'Unlicensed Team Members', 'Referral Directors'];
const KEEP = ['Principals', 'Agents', 'Unlicensed Team Members'];
const ROLE = { 'Unlicensed Team Member': 'Unlicensed' };
const ORDER = { Principal: 0, Agent: 1, 'Unlicensed Team Member': 2 };

const officeShort = o => {
  if (!o) return '';
  const p = String(o).split(' - ').map(s => s.trim());
  return p.length >= 3 ? `${p[2]}, ${p[0]}` : String(o);
};
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const top = arr => {
  const c = new Map();
  arr.forEach(v => c.set(v, (c.get(v) || 0) + 1));
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

export function parseDirectory(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, blankrows: true });
  let section = null, col = null;
  const people = [];
  for (const r of rows) {
    const vals = (r || []).filter(v => v !== null && v !== '');
    if (vals.length === 1 && SECTIONS.includes(String(vals[0]).trim())) { section = String(vals[0]).trim(); continue; }
    if (r && r[0] === 'Name') {
      col = Object.fromEntries(r.map((h, i) => [String(h ?? '').trim(), i]));
      continue;
    }
    if (!section || !col || !KEEP.includes(section) || !r || !r[0]) continue;
    const g = h => (col[h] == null ? null : r[col[h]]);
    people.push({
      name: String(r[0]).trim(), role: g('Agent Primary Role'), team: g('Team Name'),
      ma: g('Team Marketing Advisor'), sec: g('Secondary MA'), tier: g('Agent MKTG Tier (DMV SET)'), office: g('Team Office'),
    });
  }
  if (!people.length || !col || col['Team Marketing Advisor'] == null) {
    throw new Error("This doesn't look like the DMV Agent Directory export. It needs the Principals and Agents sections and a Team Marketing Advisor column.");
  }
  const byTeam = new Map();
  people.filter(p => p.team).forEach(p => { if (!byTeam.has(p.team)) byTeam.set(p.team, []); byTeam.get(p.team).push(p); });
  const teams = [], otherMAs = new Map();
  for (const [name, ps] of byTeam) {
    const ma = top(ps.map(p => p.ma));
    if (!STAFF[ma]) { otherMAs.set(ma || 'No MA listed', (otherMAs.get(ma || 'No MA listed') || 0) + 1); continue; }
    const princ = ps.filter(p => p.role === 'Principal');
    const tiers = [...new Set(princ.map(p => p.tier).filter(Boolean))].sort();
    const offices = (princ.length ? princ : ps).map(p => officeShort(p.office)).filter(Boolean);
    const secs = ps.map(p => p.sec).filter(Boolean);
    teams.push({
      id: slug(name), name: String(name), ma,
      office: top(offices) || '',
      tier: tiers.length ? tiers.join(' / ') : 'No principal tier',
      principals: princ.map(p => p.name),
      sec: secs.length ? top(secs) : null,
      members: ps.slice().sort((a, b) => (ORDER[a.role] ?? 3) - (ORDER[b.role] ?? 3) || a.name.localeCompare(b.name))
        .map(p => [p.name, ROLE[p.role] || p.role || '', p.tier || '']),
    });
  }
  teams.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  return { teams, otherMAs: Object.fromEntries(otherMAs) };
}
