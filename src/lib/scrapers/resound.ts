import * as cheerio from 'cheerio';
import type { ScrapedShow } from './types';

// Known Austin venues — add new ones here as Resound expands
export const AUSTIN_VENUES: Record<string, string> = {
  'Mohawk':                  '912 Red River St, Austin, TX 78701',
  '29th Street Ballroom':    '3005 S Lamar Blvd, Austin, TX 78704',
  'Hotel Vegas':             '1502 E 6th St, Austin, TX 78702',
  'Central Machine Works':   '4824 E Cesar Chavez St, Austin, TX 78702',
  'RADIO/EAST':              '4701 E 5th St, Austin, TX 78702',
  'Kingdom':                 '2710 E 2nd St, Austin, TX 78702',
  'Brushy Street Commons':   '1645 E 6th St, Austin, TX 78702',
  "Hole in the Wall":        '2538 Guadalupe St, Austin, TX 78705',
  "Parish":                  '214 E 6th St, Austin, TX 78701',
  "Stubb's":                 '801 Red River St, Austin, TX 78701',
  "State Theatre":           '719 Congress Ave, Austin, TX 78701',
  "Emo's":                   '2015 E Riverside Dr, Austin, TX 78741',
  "Emo's Austin":            '2015 E Riverside Dr, Austin, TX 78741',
  "Antone's":                '305 E 5th St, Austin, TX 78701',
  "Antone's Nightclub":      '305 E 5th St, Austin, TX 78701',
  'AM/FM':                   '300 W 6th St, Austin, TX 78701',
  "Austin City Limits Live at the Moody Center": '2001 Robert Dedman Dr, Austin, TX 78712',
};

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function parseDate(str: string): string | null {
  const parts = str.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const monthIdx = MONTHS[parts[1]];
  const day = parseInt(parts[2], 10);
  if (monthIdx === undefined || isNaN(day)) return null;

  const now = new Date();
  let year = now.getFullYear();
  const candidate = new Date(year, monthIdx, day);
  if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    year += 1;
  }
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseTime(str: string): string | null {
  if (!str) return null;
  const m = str.match(/^(\d+):(\d{2})(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}`;
}

function parsePrice(str: string): { priceMin: number | null; priceMax: number | null } {
  if (!str) return { priceMin: null, priceMax: null };
  const cleaned = str.replace(/^\d+\+,?\s*/i, '').trim();
  const range = cleaned.match(/\$(\d+(?:\.\d+)?)-\$(\d+(?:\.\d+)?)/);
  if (range) return { priceMin: parseFloat(range[1]), priceMax: parseFloat(range[2]) };
  const single = cleaned.match(/\$(\d+(?:\.\d+)?)/);
  if (single) { const v = parseFloat(single[1]); return { priceMin: v, priceMax: v }; }
  return { priceMin: null, priceMax: null };
}

export async function scrapeResound(): Promise<{ shows: ScrapedShow[]; skippedVenues: string[] }> {
  const res = await fetch('https://resoundpresents.com/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Showpaper/1.0)' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Resound fetch failed: ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  const allShows: ScrapedShow[] = [];

  $('.seetickets-list-event-container').each((_, el) => {
    const headliner = $(el).find('.event-title a').first().text().trim();
    const supportingRaw = $(el).find('.supporting-talent').text().trim();
    const supporting = supportingRaw
      ? supportingRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const dateStr = $(el).find('.event-date').text().trim();
    const doorsRaw = $(el).find('.see-doortime').text().trim();
    const showRaw = $(el).find('.see-showtime').text().trim();
    const venueRaw = $(el).find('.venue').text().trim();
    const venueName = venueRaw.replace(/^at\s+/i, '').trim();
    const priceRaw = $(el).find('.price').text().trim();
    const ticketUrl = $(el).find('a.seetickets-buy-btn').attr('href') || null;
    const imageUrl = $(el).find('.seetickets-list-view-event-image').attr('src') || null;

    if (!headliner || !dateStr || !venueName) return;
    const date = parseDate(dateStr);
    if (!date) return;

    allShows.push({
      headliner,
      supporting,
      date,
      doorsTime: parseTime(doorsRaw),
      showTime: parseTime(showRaw),
      venueName,
      venueAddress: AUSTIN_VENUES[venueName] ?? null,
      ...parsePrice(priceRaw),
      ticketUrl: ticketUrl || null,
      imageUrl: imageUrl || null,
      sourceUrl: ticketUrl || null,
    });
  });

  const austinShows = allShows.filter((s) => AUSTIN_VENUES[s.venueName] !== undefined);
  const skippedVenues = [
    ...new Set(allShows.filter((s) => !AUSTIN_VENUES[s.venueName]).map((s) => s.venueName)),
  ];

  return { shows: austinShows, skippedVenues };
}
