// The review questions. Change labels or options here and both tabs pick it up.
export const Q = {
  freq:   { label: 'How often do you hear from them?', opts: ['Weekly or more', 'Every couple weeks', 'Monthly', 'Rarely', "I've never spoken to them"] },
  load:   { label: 'How much work do they give you?', opts: ['Light', 'Moderate', 'Heavy'], hint: 'Light is a couple hours a month. Heavy is 10+ hours a month.' },
  work:   { label: 'What kind of work is it?', ends: ['Templated content', 'Strategic resources'], stops: ['All templated', 'Mostly templated', 'Even mix', 'Mostly strategic', 'All strategic'] },
  reach:  { label: 'How do they reach you?', hint: 'Pick all that apply.', opts: [
            ['zendesk', 'marketing@compass.com (Zendesk)'], ['email', 'Direct email to me'], ['text', 'Text'], ['call', 'Phone call'], ['walkup', 'Walks up in office']] },
  plan:   { label: 'How do they plan their marketing?', ends: ['Reactive', 'Proactive'], stops: ['Very reactive', 'Mostly reactive', 'Mixed', 'Mostly proactive', 'Very proactive'] },
  channels:{ label: 'Which marketing channels do they prefer?', hint: 'Pick all that apply.', opts: ['Print', 'Social', 'Email', 'Video', 'Digital ads', 'Signage', 'Events', 'Other'] },
  design: { label: 'What is their design style?', opts: ['Modern', 'Traditional', 'Blend'] },
  brand:  { label: 'Has a brand system' },
  ops:    { label: 'Do they have a marketing admin or operations manager?', opts: ['Yes', 'No', 'Not sure'] },
  opsName:{ label: 'What is their name?' },
  specialty:{ label: 'What do they specialize in?', hint: 'Niche markets, neighborhoods, types of clients.' },
  projects:{ label: 'A few projects you worked on together in the last year' },
  links:  { label: 'Go-to templates or designs', hint: 'Paste a link to each one.' },
  note:   { label: 'Additional notes', hint: 'Optional.' },
};
export const NEVER = "I've never spoken to them";
export const OFF = ['email', 'text', 'call', 'walkup'];
export const REACH_SHORT = { zendesk: 'Zendesk', email: 'Direct email', text: 'Text', call: 'Call', walkup: 'Walk-ups' };
export const isOff = r => (r.reach || []).some(k => OFF.includes(k));
export function status(r) {
  if (!r) return 'todo';
  if (r.freq === NEVER) return 'done';
  const req = [r.freq, r.load, r.work != null ? 1 : null, (r.reach || []).length ? 1 : null, r.plan != null ? 1 : null, (r.channels || []).length ? 1 : null, r.design];
  const filled = req.filter(Boolean).length;
  const any = filled || r.projects || r.note || r.ops || r.specialty || (r.links || []).some(Boolean) || Object.values(r.agentNotes || {}).some(Boolean);
  if (filled === req.length) return 'done';
  return any ? 'prog' : 'todo';
}
export const STATUS_LABEL = { todo: 'Not started', prog: 'In progress', done: 'Complete' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const tierCls = t => /^Tier \d/.test(t) ? '' : 't0';
export const safeUrl = u => /^https?:\/\//i.test(u || '') ? u : '';
// Only the answer fields get saved, so nothing else can sneak into a review.
export const ANSWER_KEYS = ['freq', 'load', 'work', 'reach', 'plan', 'channels', 'design', 'brand', 'ops', 'opsName', 'specialty', 'projects', 'links', 'note', 'agentNotes'];
export const pickAnswers = r => Object.fromEntries(ANSWER_KEYS.filter(k => r[k] !== undefined).map(k => [k, r[k]]));
