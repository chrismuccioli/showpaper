import { scrapeResound } from './resound';
import { scrapeAntones } from './antones';
import { scrapeSongkickVenue, venueNameFromSlug } from './songkick';
import { scrapeThirteenthFloor } from './thirteenthfloor';
import type { ScrapedShow } from './types';

export type SourceType =
  | 'resound'
  | 'antones'
  | 'songkick-venue'
  | 'thirteenthfloor'
  | 'unknown';

export interface DetectResult {
  url: string;
  sourceType: SourceType;
  canScrape: boolean;
  venueName: string | null;
  venueAddress: string | null;
  city: string | null;
  previewCount: number;
  sampleShows: { headliner: string; date: string; venue: string }[];
  failureReason?: string;
  suggestion?: {
    platform: 'songkick';
    message: string;
    searchUrl: string;
  };
}

/** Detect the source type for a URL from its pattern alone */
export function detectSourceType(url: string): SourceType {
  const u = url.toLowerCase();
  if (u.includes('resoundpresents.com')) return 'resound';
  if (u.includes('antonesnightclub.com')) return 'antones';
  if (u.includes('songkick.com/venues')) return 'songkick-venue';
  if (u.includes('the13thflooraustin.com') || u.includes('13thflooraustin')) return 'thirteenthfloor';
  return 'unknown';
}

/** Infer a human-readable venue name + city from a URL (best-effort, no fetch) */
function guessVenueFromUrl(url: string): { name: string; city: string | null } {
  // Try to extract from domain
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    // e.g. "antonesnightclub.com" → "Antones Nightclub"
    const base = hostname.split('.')[0];
    const name = base
      .split(/[-_]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return { name, city: null };
  } catch {
    return { name: 'Unknown Venue', city: null };
  }
}

/** Check if a site is JS-rendered (Squarespace, common SPAs) */
async function isJsRendered(url: string): Promise<{ isJs: boolean; platform: string | null }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Showpaper/1.0)' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { isJs: false, platform: null };
    const html = await res.text();

    if (html.includes('squarespace.com') || html.includes('SQUARESPACE_CONTEXT')) {
      return { isJs: true, platform: 'Squarespace' };
    }
    if (html.includes('dice.fm') || html.includes('DiceEventListWidget')) {
      return { isJs: true, platform: 'Dice.fm' };
    }
    if (html.includes('ticketmaster.com') && html.includes('data-module')) {
      return { isJs: true, platform: 'Ticketmaster' };
    }
    // Check for empty event containers (loaded by JS)
    const hasEmptyEventList = /<div[^>]*(?:id="eventList"|class="[^"]*event-list[^"]*")[^>]*>\s*<\/div>/.test(html);
    if (hasEmptyEventList) return { isJs: true, platform: null };

    return { isJs: false, platform: null };
  } catch {
    return { isJs: false, platform: null };
  }
}

/** Run a test scrape and return up to 3 sample shows */
async function testScrape(url: string, sourceType: SourceType): Promise<{
  shows: ScrapedShow[];
  venueName: string | null;
  venueAddress: string | null;
  error?: string;
}> {
  try {
    if (sourceType === 'resound') {
      const { shows } = await scrapeResound();
      return { shows: shows.slice(0, 50), venueName: 'Resound Presents', venueAddress: null };
    }
    if (sourceType === 'antones') {
      const shows = await scrapeAntones(url);
      return { shows, venueName: "Antone's Nightclub", venueAddress: '305 E 5th St, Austin, TX 78701' };
    }
    if (sourceType === 'songkick-venue') {
      const { shows, venueName, venueAddress } = await scrapeSongkickVenue(url);
      return { shows, venueName, venueAddress };
    }
    if (sourceType === 'thirteenthfloor') {
      const shows = await scrapeThirteenthFloor(url);
      return { shows, venueName: 'The 13th Floor', venueAddress: null };
    }
    return { shows: [], venueName: null, venueAddress: null, error: 'Unsupported source type' };
  } catch (err) {
    return { shows: [], venueName: null, venueAddress: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Main detection entry point */
export async function detectSource(url: string): Promise<DetectResult> {
  const normalizedUrl = url.trim();
  const sourceType = detectSourceType(normalizedUrl);

  // For unknown types, check if JS-rendered before attempting scrape
  if (sourceType === 'unknown') {
    const { isJs, platform } = await isJsRendered(normalizedUrl);
    const guess = guessVenueFromUrl(normalizedUrl);

    if (isJs) {
      // Build Songkick search suggestion
      const searchQuery = encodeURIComponent(`${guess.name} Austin`);
      return {
        url: normalizedUrl,
        sourceType: 'unknown',
        canScrape: false,
        venueName: guess.name,
        venueAddress: null,
        city: null,
        previewCount: 0,
        sampleShows: [],
        failureReason: platform
          ? `This site uses ${platform} to load events — they require JavaScript and can't be scraped directly.`
          : 'Events on this site are loaded by JavaScript and aren\'t visible in the page source.',
        suggestion: {
          platform: 'songkick',
          message: `Try searching Songkick for "${guess.name}" to find a scrapeable calendar URL.`,
          searchUrl: `https://www.songkick.com/search?query=${searchQuery}`,
        },
      };
    }

    // Try a generic parse — maybe it's a format we don't know yet
    return {
      url: normalizedUrl,
      sourceType: 'unknown',
      canScrape: false,
      venueName: guess.name,
      venueAddress: null,
      city: null,
      previewCount: 0,
      sampleShows: [],
      failureReason: 'This URL doesn\'t match any supported source type. Supported: Resound Presents, Antone\'s Nightclub, Songkick venue pages, 13th Floor Austin.',
      suggestion: {
        platform: 'songkick',
        message: `Try searching Songkick for "${guess.name}" to find a supported calendar URL.`,
        searchUrl: `https://www.songkick.com/search?query=${encodeURIComponent(guess.name + ' Austin')}`,
      },
    };
  }

  // Known type — do a test scrape
  const { shows, venueName, venueAddress, error } = await testScrape(normalizedUrl, sourceType);

  if (error || shows.length === 0) {
    const guess = guessVenueFromUrl(normalizedUrl);
    return {
      url: normalizedUrl,
      sourceType,
      canScrape: false,
      venueName: venueName ?? guess.name,
      venueAddress,
      city: null,
      previewCount: 0,
      sampleShows: [],
      failureReason: error ?? 'No upcoming shows found at this URL.',
      suggestion: sourceType !== 'songkick-venue' ? {
        platform: 'songkick',
        message: `Try a Songkick venue page as a fallback source.`,
        searchUrl: `https://www.songkick.com/search?query=${encodeURIComponent((venueName ?? guess.name) + ' Austin')}`,
      } : undefined,
    };
  }

  const sampleShows = shows.slice(0, 3).map((s) => ({
    headliner: s.headliner,
    date: s.date,
    venue: s.venueName,
  }));

  return {
    url: normalizedUrl,
    sourceType,
    canScrape: true,
    venueName: venueName ?? (shows[0]?.venueName || null),
    venueAddress,
    city: 'Austin',
    previewCount: shows.length,
    sampleShows,
  };
}
