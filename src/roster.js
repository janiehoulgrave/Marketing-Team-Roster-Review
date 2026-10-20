// Turns the DMV Agent Directory export (.xlsx) into teams grouped by Team Marketing Advisor.
import * as XLSX from 'xlsx';
import { STAFF } from './config.js';

const SECTIONS = ['Principals', 'Agents', 'Unlicensed Team Members', 'Referral Directors'];
const ROLE = { 'Unlicensed Team Member': 'Unlicensed' };
const ORDER = { Principal: 0, Agent: 1, 'Unlicensed Team Member': 2, 'Referral Director': 3 };
export const NO_TEAM = 'No team listed';

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
    if (!section || !col || !r || !r[0]) continue;
    const g = h => (col[h] == null ? null : r[col[h]]);
    people.push({
      name: String(r[0]).trim(), section, role: g('Agent Primary Role') || (section === 'Referral Directors' ? 'Referral Director' : null), team: g('Team Name'),
      ma: g('Team Marketing Advisor'), sec: g('Secondary MA'), tier: g('Agent MKTG Tier (DMV SET)'), office: g('Team Office'),
    });
  }
  if (!people.length || !col || col['Team Marketing Advisor'] == null) {
    throw new Error("This doesn't look like the DMV Agent Directory export. It needs the Principals and Agents sections and a Team Marketing Advisor column.");
  }
  // Referral Directors are never put on a staff roster; everyone else is grouped by team.
  const byTeam = new Map();
  people.forEach(p => {
    const key = (p.section === 'Referral Directors' ? 'RD|' : 'T|') + (p.team || NO_TEAM);
    if (!byTeam.has(key)) byTeam.set(key, []); byTeam.get(key).push(p);
  });
  const teams = [], unassigned = [], otherMAs = new Map();
  for (const [key, ps] of byTeam) {
    const name = key.slice(key.indexOf('|') + 1), rd = key.startsWith('RD|');
    const ma = top(ps.map(p => p.ma)) || null;
    const princ = ps.filter(p => p.role === 'Principal');
    const tiers = [...new Set(princ.map(p => p.tier).filter(Boolean))].sort();
    const offices = (princ.length ? princ : ps).map(p => officeShort(p.office)).filter(Boolean);
    const secs = ps.map(p => p.sec).filter(Boolean);
    const team = {
      id: (rd ? 'rd-' : '') + slug(name), name: String(name), ma,
      office: top(offices) || '',
      tier: tiers.length ? tiers.join(' / ') : 'No principal tier',
      principals: princ.map(p => p.name),
      sec: secs.length ? top(secs) : null,
      members: ps.slice().sort((a, b) => (ORDER[a.role] ?? 4) - (ORDER[b.role] ?? 4) || a.name.localeCompare(b.name))
        .map(p => [p.name, ROLE[p.role] || p.role || '', p.tier || '']),
    };
    if (STAFF[ma] && !rd && name !== NO_TEAM) { teams.push(team); continue; }
    team.group = rd ? 'Referral Directors' : name === NO_TEAM ? NO_TEAM : (ma || 'No MA listed');
    unassigned.push(team);
    otherMAs.set(team.group, (otherMAs.get(team.group) || 0) + 1);
  }
  const byName = (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  teams.sort(byName); unassigned.sort(byName);
  return { teams, unassigned, otherMAs: Object.fromEntries(otherMAs) };
}
