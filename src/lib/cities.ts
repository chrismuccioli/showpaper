// Supported cities: slug → metadata
export interface CityMeta {
  slug: string;
  name: string;            // display name / DB value
  shortName: string;       // abbreviation for breadcrumbs
  state: string;
  description: string;     // used in SEO descriptions
  coordinates: string;     // lat,lng for structured data
}

export const CITIES: Record<string, CityMeta> = {
  austin: {
    slug: 'austin',
    name: 'Austin',
    shortName: 'ATX',
    state: 'TX',
    description: 'Live music listings for Austin, TX — upcoming shows, tickets, and artist previews.',
    coordinates: '30.2672,-97.7431',
  },
  'new-york': {
    slug: 'new-york',
    name: 'New York',
    shortName: 'NYC',
    state: 'NY',
    description: 'Live music listings for New York City — upcoming shows, tickets, and artist previews.',
    coordinates: '40.7128,-74.0060',
  },
  'los-angeles': {
    slug: 'los-angeles',
    name: 'Los Angeles',
    shortName: 'LA',
    state: 'CA',
    description: 'Live music listings for Los Angeles, CA — upcoming shows, tickets, and artist previews.',
    coordinates: '34.0522,-118.2437',
  },
  chicago: {
    slug: 'chicago',
    name: 'Chicago',
    shortName: 'CHI',
    state: 'IL',
    description: 'Live music listings for Chicago, IL — upcoming shows, tickets, and artist previews.',
    coordinates: '41.8781,-87.6298',
  },
  'san-francisco': {
    slug: 'san-francisco',
    name: 'San Francisco',
    shortName: 'SF',
    state: 'CA',
    description: 'Live music listings for San Francisco, CA — upcoming shows, tickets, and artist previews.',
    coordinates: '37.7749,-122.4194',
  },
  nashville: {
    slug: 'nashville',
    name: 'Nashville',
    shortName: 'NSH',
    state: 'TN',
    description: 'Live music listings for Nashville, TN — upcoming shows, tickets, and artist previews.',
    coordinates: '36.1627,-86.7816',
  },
};

export function getCityMeta(slug: string): CityMeta | null {
  return CITIES[slug] ?? null;
}

/** All valid city slugs — used for static params generation */
export function getAllCitySlugs(): string[] {
  return Object.keys(CITIES);
}

/** Format a date string YYYY-MM-DD → "Wed Jun 10, 2026" */
export function fmtDateLong(d: string): string {
  const [y, mo, day] = d.split('-').map(Number);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const date = new Date(y, mo - 1, day);
  return `${weekdays[date.getDay()]}, ${months[mo - 1]} ${day}, ${y}`;
}

export function fmtDateShort(d: string): string {
  const [y, mo, day] = d.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const date = new Date(y, mo - 1, day);
  return `${weekdays[date.getDay()]} ${months[mo - 1]} ${day}`;
}

export function fmtDateGrid(d: string): { day: string; mmdd: string } {
  const [y, mo, day] = d.split('-').map(Number);
  const date = new Date(y, mo - 1, day);
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return {
    day: days[date.getDay()],
    mmdd: `${String(mo).padStart(2,'0')}/${String(day).padStart(2,'0')}`,
  };
}

export function fmt12(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${ampm}`;
}

export function formatPrice(min: number | null, max: number | null): string {
  if (min === null) return '';  // unknown price — don't display
  if (min === 0) return 'free'; // explicitly free
  if (max && max !== min) return `$${min}–$${max}`;
  return `$${min}`;
}

// ── Date range helpers ───────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

export type Period = 'today' | 'weekend' | 'week' | 'next-week' | 'month' | 'all';

export function computeDateRange(period: Period | null, month: string | null): { from: string; to: string } | null {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (month) {
    // month = "YYYY-MM"
    const [y, m] = month.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0); // last day of month
    return { from: fmtDate(first), to: fmtDate(last) };
  }

  switch (period) {
    case 'today':
      return { from: fmtDate(now), to: fmtDate(now) };
    case 'weekend': {
      const day = now.getDay(); // 0=Sun … 6=Sat
      const daysToFri = day <= 5 ? 5 - day : 6;
      const fri = new Date(now); fri.setDate(now.getDate() + (daysToFri === 0 && day === 5 ? 0 : daysToFri));
      const sun = new Date(fri); sun.setDate(fri.getDate() + 2);
      return { from: fmtDate(fri), to: fmtDate(sun) };
    }
    case 'week': {
      const end = new Date(now); end.setDate(now.getDate() + 6);
      return { from: fmtDate(now), to: fmtDate(end) };
    }
    case 'next-week': {
      const start = new Date(now); start.setDate(now.getDate() + 7);
      const end = new Date(now); end.setDate(now.getDate() + 13);
      return { from: fmtDate(start), to: fmtDate(end) };
    }
    case 'month': {
      const end = new Date(now); end.setDate(now.getDate() + 30);
      return { from: fmtDate(now), to: fmtDate(end) };
    }
    default:
      return null; // all upcoming
  }
}

/** YYYY-MM-DD → "Jun 2026" */
export function fmtMonthLabel(d: string): string {
  const [y, m] = d.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m - 1]} ${y}`;
}

/** YYYY-MM → prev/next month as "YYYY-MM" */
export function prevMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
export function nextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** Get the current month as "YYYY-MM" */
export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────

/** Convert any string to a URL-safe slug */
export function toSlug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')                // decompose accented chars
    .replace(/[\u0300-\u036f]/g, '') // strip accent marks
    .replace(/[^a-z0-9\s-]/g, '')   // remove non-alphanumeric
    .trim()
    .replace(/\s+/g, '-')           // spaces → hyphens
    .replace(/-+/g, '-');            // collapse runs
}

/** URL helpers — use clean slugs with numeric ID fallback */
export function showUrl(slug: string | null, id: number, artists: { name: string }[], venueName: string): string {
  if (slug) return `/shows/${slug}`;
  // Fallback: compute on-the-fly from data
  const artistSlug = artists[0] ? toSlug(artists[0].name) : 'show';
  return `/shows/${toSlug(artistSlug)}-at-${toSlug(venueName)}-${id}`;
}

export function artistUrl(slug: string | null, id: number, name: string): string {
  return slug ? `/artists/${slug}` : `/artists/${id}`;
}

export function venueUrl(slug: string | null, id: number, name: string): string {
  return slug ? `/venues/${slug}` : `/venues/${id}`;
}
