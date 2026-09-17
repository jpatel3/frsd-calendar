// schools.js — the only file another FRSD parent (or another Apptegy district) needs to edit.
export const API_BASE = 'https://thrillshare-cmsv2.services.thrillshare.com/api/v4/o';
export const SITE_BASE = 'https://www.frsd.us/o';
export const PDF_URL = 'https://files-backend.assets.thrillshare.com/documents/asset/uploaded_file/5380/Fr/4e4d5051-45e3-48c5-b450-da0e963cc770/2026-2027-District-Calendar-FINAL.pdf?disposition=inline';
export const REPO_URL = 'https://github.com/jpatel3/frsd-calendar';

export const SCHOOLS = [
  { key: 'frsd', name: 'District', short: 'FRSD', grades: '', org: 27053, section: 457011, slug: 'frs', color: '#4b5563', always: true },
  { key: 'bs',   name: 'Barley Sheaf School', short: 'BS', grades: 'PreK-4', org: 27224, section: 460560, slug: 'bs', color: '#b45309' },
  { key: 'ch',   name: 'Copper Hill School', short: 'CH', grades: 'PreK-4', org: 27225, section: 460569, slug: 'ch', color: '#1d4ed8' },
  { key: 'fad',  name: 'Francis A. Desmares School', short: 'FAD', grades: 'PreK-4', org: 27226, section: 460578, slug: 'fad', color: '#15803d' },
  { key: 'rh',   name: 'Robert Hunter School', short: 'RH', grades: 'PreK-4', org: 27229, section: 460606, slug: 'rh', color: '#7e22ce' },
  { key: 'rfis', name: 'Reading-Fleming Intermediate School', short: 'RFIS', grades: '5-6', org: 27228, section: 460597, slug: 'rfis', color: '#b91c1c' },
  { key: 'jpc',  name: 'J.P. Case Middle School', short: 'JPC', grades: '7-8', org: 27227, section: 460587, slug: 'jpc', color: '#0e7490' },
];

export const SELECTABLE_KEYS = SCHOOLS.filter(s => !s.always).map(s => s.key);
