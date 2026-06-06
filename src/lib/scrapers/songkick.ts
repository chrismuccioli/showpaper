import * as cheerio from 'cheerio';
import type { ScrapedShow } from './types';

const MAX_PAGES = 10;

function parseIsoDate(str: string): string | null {
  // ISO datetime or date string from datetime attribute
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseIsoTime(str: string): string | null {
  // e.g. "2026-06-10T20:00:00"
  const m = str.match(/T(\d{2}):(\d{2})/);
  if (!m) return null;
  return `${m[1]}:${m[2]}`;
}

/** Extract venue name from a Songkick URL slug like "1449-antones-nightclub" */
export function venueNameFromSlug(url: string): string {
  const m = url.match(/\/venues\/\d+-(.+?)(?:\/|$)/);
  if (!m) return 'Unknown Venue';
  return m[1]
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export async function scrapeSongkickVenue(calendarUrl: string): Promise<{ shows: ScrapedShow[]; venueName: string; venueAddress: string | null }> {
  // Normalize URL
  const url = calendarUrl.includes('songkick.com')
    ? calendarUrl
    : `https://www.songkick.com${calendarUrl}`;

  let pageUrl: string | null = url;
  let page = 0;
  let venueName = venueNameFromSlug(url);
  let venueAddress: string | null = null;
  const allShows: ScrapedShow[] = [];

  while (pageUrl && page < MAX_PAGES) {
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Showpaper/1.0)' },
      cache: 'no-store',
    });
    if (!res.ok) break;

    const html = await res.text();
    const $ = cheerio.load(html);

    // Extract venue name and address from first page
    if (page === 0) {
      const nameEl = $('h1.venue-header, h1.profile-header, h1[itemprop="name"]').first().text().trim();
      if (nameEl) venueName = nameEl;
      venueAddress = $('[itemprop="streetAddress"], .venue-address').first().text().trim() || null;
    }

    // Events are in <li class="event-listings-element"> or similar
    $('li.event-listings-element, li.concert, article.event-listing').each((_, el) => {
      const titleEl = $(el).find('.event-details a, h3.event-name a, a.event-link').first();
      const headliner = titleEl.text().trim();
      if (!headliner) return;

      // Date from datetime attribute
      const dateAttr = $(el).find('time[datetime]').first().attr('datetime') || '';
      const date = parseIsoDate(dateAttr);
      if (!date) return;

      const showTime = parseIsoTime(dateAttr);
      const ticketUrl = $(el).find('a[href*="ticket"], a.buy-tickets').first().attr('href') || null;
      const detailUrl = titleEl.attr('href') || null;
      const fullDetailUrl = detailUrl ? (detailUrl.startsWith('http') ? detailUrl : `https://www.songkick.com${detailUrl}`) : null;

      // Supporting acts from "with X, Y" text
      const supporting: string[] = [];
      const supportText = $(el).find('.support-acts, .line-up, .supporting-acts').text().trim();
      if (supportText) {
        supportText.split(',').forEach((s) => {
          const name = s.replace(/^with\s+/i, '').trim();
          if (name && name !== headliner) supporting.push(name);
        });
      }

      allShows.push({
        headliner,
        supporting,
        date,
        doorsTime: null,
        showTime,
        venueName,
        venueAddress,
        priceMin: null,
        priceMax: null,
        ticketUrl: ticketUrl || fullDetailUrl,
        imageUrl: $(el).find('img').first().attr('src') || null,
        sourceUrl: fullDetailUrl,
      });
    });

    // Next page
    const nextHref = $('a[rel="next"], .pagination .next a').first().attr('href');
    pageUrl = nextHref ? (nextHref.startsWith('http') ? nextHref : `https://www.songkick.com${nextHref}`) : null;
    page++;
  }

  return { shows: allShows, venueName, venueAddress };
}
