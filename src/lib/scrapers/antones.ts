import * as cheerio from 'cheerio';
import type { ScrapedShow } from './types';

const BASE_URL = 'https://antonesnightclub.com';
const MAX_PAGES = 10;

// Month name → 0-indexed number
const MONTHS: Record<string, number> = {
  January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
  July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
};

function parseAntonesDate(str: string): string | null {
  // e.g. "Saturday, June 07, 2026" or "Sunday, June 08, 2026"
  const m = str.match(/(\w+),\s+(\w+)\s+(\d+),\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[2]];
  if (month === undefined) return null;
  const day = parseInt(m[3], 10);
  const year = parseInt(m[4], 10);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseAntonesTime(str: string): string | null {
  // e.g. "8:00pm" or "9:00PM (Doors: 8:00pm)"
  const m = str.match(/(\d+):(\d{2})(am|pm)/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}`;
}

async function fetchPage(url: string): Promise<ScrapedShow[]> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Showpaper/1.0)' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Antone's fetch failed: ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const shows: ScrapedShow[] = [];

  // Each event is a .tribe-events-calendar-list__event-row or similar
  // Antone's uses The Events Calendar plugin
  $('.tribe-events-calendar-list__event-row, .tribe_events_cat, article.type-tribe_events').each((_, el) => {
    const titleEl = $(el).find('.tribe-event-url, .tribe-events-calendar-list__event-title a, h2 a, h3 a').first();
    const headliner = titleEl.text().trim();
    const ticketUrl = $(el).find('a[href*="ticket"], a[href*="seetickets"], a[href*="eventbrite"], a[href*="etix"]').first().attr('href') || null;
    const detailUrl = titleEl.attr('href') || null;
    const dateText = $(el).find('.tribe-event-date-start, .tribe-events-calendar-list__event-datetime, time').first().text().trim();
    const timeText = $(el).find('.tribe-events-start-time, .tribe-event-time').first().text().trim() || dateText;

    if (!headliner) return;
    const date = parseAntonesDate(dateText);
    if (!date) return;

    // Try to split "Artist w/ Support" or "Artist: Support"
    const supporting: string[] = [];
    const supportMatch = headliner.match(/^(.+?)\s+(?:w\/|with|feat\.?)\s+(.+)$/i);
    const mainArtist = supportMatch ? supportMatch[1].trim() : headliner;
    if (supportMatch) supporting.push(supportMatch[2].trim());

    shows.push({
      headliner: mainArtist,
      supporting,
      date,
      doorsTime: null,
      showTime: parseAntonesTime(timeText),
      venueName: "Antone's Nightclub",
      venueAddress: '305 E 5th St, Austin, TX 78701',
      priceMin: null, priceMax: null,
      ticketUrl: ticketUrl || detailUrl,
      imageUrl: $(el).find('img').first().attr('src') || null,
      sourceUrl: detailUrl || ticketUrl,
    });
  });

  return shows;
}

async function getNextPageUrl($: ReturnType<typeof cheerio.load>): Promise<string | null> {
  const next = $('a[rel="next"], .tribe-events-c-nav__next, .tribe-events-nav-next a').first().attr('href');
  return next || null;
}

export async function scrapeAntones(startUrl = `${BASE_URL}/events/`): Promise<ScrapedShow[]> {
  const allShows: ScrapedShow[] = [];
  let url: string | null = startUrl;
  let page = 0;

  while (url && page < MAX_PAGES) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Showpaper/1.0)' },
      cache: 'no-store',
    });
    if (!res.ok) break;
    const html = await res.text();
    const $ = cheerio.load(html);

    const pageShows = await fetchPage(url);
    allShows.push(...pageShows);

    url = await getNextPageUrl($);
    page++;
  }

  return allShows;
}
