// WHO CAN USE THE APP
// Names must match the "Team Marketing Advisor" column in the DMV Agent Directory exactly.
// If you change anyone here, make the same change in firestore.rules (two lists at the top).
export const STAFF = {
  'Alex Asmar': 'alex.asmar@compass.com',
  'Alexis Coballes': 'alexis.coballes@compass.com',
  'Ariel Mantilla': 'ariel.mantilla@compass.com',
  'Janie Houlgrave': 'janie.houlgrave@compass.com',
  'Jessica Tan': 'jessica.tan@compass.com',
  'Kathleen Walsh': 'kathleen.walsh@compass.com',
  'Lindsey McNerney': 'lindsey.mcnerney@compass.com',
  'Natalie Robinson': 'natalie.robinson@compass.com',
  'Skylar Herrle': 'skylar.herrle@compass.com',
  'Toria Hester': 'toria.hester@compass.com',
};

// STAND-INS: someone completing another person's roster review (for example during leave).
// Their answers are saved as that person's review. Add the stand-in's email to isStaff() in firestore.rules too.
export const DELEGATES = {
  'sarah.tareen@compass.com': 'Lindsey McNerney',
};

export const ADMINS = {
  'Janie Houlgrave': 'janie.houlgrave@compass.com',
  'Ariel Mantilla': 'ariel.mantilla@compass.com',
  'Sarah Tareen': 'sarah.tareen@compass.com',
};

// ROLES AND BENCHMARKS FOR THE RE-ORG
// Benchmarks are licensed agents per person (principals plus agents).
// The ranges are starting points; admins can change them on the Re-org tab and the change is shared.
export const ROLES = [
  { id: 'mc', name: 'Marketing Coordinator', min: 40, max: 55 },
  { id: 'ma', name: 'Marketing Advisor', min: 60, max: 75 },
  { id: 'sma', name: 'Senior Marketing Advisor', min: 75, max: 95 },
  { id: 'sml', name: 'Strategic Marketing Lead', min: 60, max: 80 },
  { id: 'amm', name: 'Associate Marketing Manager', min: 30, max: 50 },
];
export const STAFF_ROLE = {
  'Alex Asmar': 'sml', 'Janie Houlgrave': 'sml',
  'Jessica Tan': 'sma', 'Toria Hester': 'sma', 'Kathleen Walsh': 'sma',
  'Lindsey McNerney': 'ma', 'Natalie Robinson': 'ma',
  'Alexis Coballes': 'mc', 'Skylar Herrle': 'mc',
  'Ariel Mantilla': 'amm',
};
