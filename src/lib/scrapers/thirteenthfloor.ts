import * as cheerio from 'cheerio';
import type { ScrapedShow } from './types';

const MONTHS_ABBR: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  January: 0, February: 1, March: 2, April: 3, June: 5,
  July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
};

function parse13thDate(str: string): string | null {
  // Try ISO first (datetime attrs)
  const iso = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // "Fri Jun 13, 2026" or "Friday, June 13"
  const m = str.match(/(\w{3,})\s+(\d{1,2})(?:,\s*(\d{4}))?/);
  if (!m) return null;
  const month = MONTHS_ABBR[m[1]];
  if (month === undefined) return null;
  const day = parseInt(m[2], 10);
  const year = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parse13thTime(str: string): string | null {
  const m = str.match(/(\d+):(\d{2})\s*(am|pm|AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}`;
}

function parsePrice(str: string): { priceMin: number | null; priceMax: number | null } {
  const range = str.match(/\$(\d+(?:\.\d+)?)\s*[-–]\s*\$(\d+(?:\.\d+)?)/);
  if (range) return { priceMin: parseFloat(range[1]), priceMax: parseFloat(range[2]) };
  const single = str.match(/\$(\d+(?:\.\d+)?)/);
  if (single) { const v = parseFloat(single[1]); return { priceMin: v, priceMax: v }; }
  if (/free/i.test(str)) return { priceMin: 0, priceMax: 0 };
  return { priceMin: null, priceMax: null };
}

export async function scrapeThirteenthFloor(url = 'https://the13thflooraustin.com/'): Promise<ScrapedShow[]> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Showpaper/1.0)' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`13th Floor fetch failed: ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const shows: ScrapedShow[] = [];
  const today = new Date().toISOString().split('T')[0];

  $('.show-wrapper').each((_, el) => {
    // Artist name is in h2 directly inside .show-wrapper
    const headliner = $(el).find('h2').first().text().trim();
    if (!headliner) return;

    // Date/time info often in a <p> or .show-date element
    const dateText = $(el).find('.show-date, .event-date, time, p').first().text().trim();
    const priceText = $(el).find('.show-price').text().trim();
    const ticketUrl = $(el).find('a.show-button, a[href*="seetickets"], a[href*="eventim"], a[href*="ticket"]').first().attr('href') || null;
    const imageUrl = $(el).find('img').first().attr('src') || null;

    const date = parse13thDate(dateText) || today; // fallback to today if can't parse

    // Try to split "Artist / Support" pattern common at 13th Floor
    const supporting: string[] = [];
    const slashMatch = headliner.match(/^(.+?)\s*[\/&]\s*(.+)$/);
    const mainArtist = slashMatch ? slashMatch[1].trim() : headliner;
    if (slashMatch) {
      slashMatch[2].split(/[\/&]/).forEach((s) => {
        const name = s.trim();
        if (name) supporting.push(name);
      });
    }

    const { priceMin, priceMax } = parsePrice(priceText);

    shows.push({
      headliner: mainArtist,
      supporting,
      date,
      doorsTime: null,
      showTime: parse13thTime(dateText),
      venueName: 'The 13th Floor',
      venueAddress: null, // Address not easily available on homepage
      priceMin,
      priceMax,
      ticketUrl,
      imageUrl,
      sourceUrl: ticketUrl || url,
    });
  });

  // Deduplicate by headliner+date (show-wrapper may appear twice)
  const seen = new Set<string>();
  return shows.filter((s) => {
    const key = `${s.headliner}|${s.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
