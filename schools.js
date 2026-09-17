// schools.js — the only file another FRSD parent (or another Apptegy district) needs to edit.
export const API_BASE = 'https://thrillshare-cmsv2.services.thrillshare.com/api/v4/o';
export const SITE_BASE = 'https://www.frsd.us/o';
export const PDF_URL = 'https://files-backend.assets.thrillshare.com/documents/asset/uploaded_file/5380/Fr/4e4d5051-45e3-48c5-b450-da0e963cc770/2026-2027-District-Calendar-FINAL.pdf?disposition=inline';
export const REPO_URL = 'https://github.com/jpatel3/frsd-calendar';
export const SITE_URL = 'https://jpatel3.github.io/frsd-calendar/';

// Used for the weather strip (Open-Meteo, no key). Set to your town.
export const WEATHER = { lat: 40.5123, lon: -74.8594, label: 'Flemington, NJ' };

// org/section: from each school's Events page source, search "cms/events?section_ids=".
// feed: same page, search "live_feeds?section_ids=" (school announcements).
export const SCHOOLS = [
  { key: 'frsd', name: 'District', short: 'FRSD', grades: '', org: 27053, section: 457011, feed: 457009, slug: 'frs', color: '#4b5563', always: true },
  { key: 'bs',   name: 'Barley Sheaf School', short: 'BS', grades: 'PreK-4', org: 27224, section: 460560, feed: 460558, slug: 'bs', color: '#b45309' },
  { key: 'ch',   name: 'Copper Hill School', short: 'CH', grades: 'PreK-4', org: 27225, section: 460569, feed: 460567, slug: 'ch', color: '#1d4ed8' },
  { key: 'fad',  name: 'Francis A. Desmares School', short: 'FAD', grades: 'PreK-4', org: 27226, section: 460578, feed: 460576, slug: 'fad', color: '#15803d' },
  { key: 'rh',   name: 'Robert Hunter School', short: 'RH', grades: 'PreK-4', org: 27229, section: 460606, feed: 460604, slug: 'rh', color: '#7e22ce' },
  { key: 'rfis', name: 'Reading-Fleming Intermediate School', short: 'RFIS', grades: '5-6', org: 27228, section: 460597, feed: 460595, slug: 'rfis', color: '#b91c1c' },
  { key: 'jpc',  name: 'J.P. Case Middle School', short: 'JPC', grades: '7-8', org: 27227, section: 460587, feed: 460585, slug: 'jpc', color: '#0e7490' },
];

export const SELECTABLE_KEYS = SCHOOLS.filter(s => !s.always).map(s => s.key);

export const icalUrl = (s, scheme = 'https') =>
  `${scheme}://thrillshare-cmsv2.services.thrillshare.com/api/v4/o/${s.org}/cms/events/generate_ical?section_ids=${s.section}`;
