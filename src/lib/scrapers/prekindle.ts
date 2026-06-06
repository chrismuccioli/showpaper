/**
 * Prekindle scraper
 * Prekindle embeds Schema.org Event JSON-LD directly in the page HTML —
 * no HTML scraping needed, just parse the structured data.
 * URL pattern: https://www.prekindle.com/events/{organizer-slug}
 */
import type { ScrapedShow } from './types';

interface SchemaOffer {
  price?: string;
  lowPrice?: string;
  highPrice?: string;
  priceCurrency?: string;
  url?: string;
}

interface SchemaPerformer {
  name: string;
  '@type'?: string;
}

interface SchemaEvent {
  '@type'?: string;
  name?: string;
  startDate?: string;
  image?: string;
  url?: string;
  description?: string;
  performer?: SchemaPerformer | SchemaPerformer[] | null;
  offers?: SchemaOffer;
  location?: {
    name?: string;
    address?: {
      streetAddress?: string;
      addressLocality?: string;
      addressRegion?: string;
      postalCode?: string;
    };
  };
  eventStatus?: string;
}

function parsePrice(offer: SchemaOffer | undefined): { priceMin: number | null; priceMax: number | null } {
  if (!offer) return { priceMin: null, priceMax: null };
  const low = offer.lowPrice ?? offer.price;
  const high = offer.highPrice ?? offer.price;
  const min = low ? parseFloat(low) : null;
  const max = high ? parseFloat(high) : null;
  return { priceMin: min, priceMax: max };
}

function parseArtistsFromTitle(title: string): { headliner: string; supporting: string[] } {
  // Common separators in Prekindle event titles: ", ", " & ", " with ", " / "
  // Usually: "Headliner, Support1, Support2" or "Headliner with Support"
  const withMatch = title.match(/^(.+?)\s+(?:with|w\/)\s+(.+)$/i);
  if (withMatch) {
    const supporting = withMatch[2].split(/,\s*/).map((s) => s.trim()).filter(Boolean);
    return { headliner: withMatch[1].trim(), supporting };
  }
  const parts = title.split(/,\s+/);
  if (parts.length > 1) {
    return { headliner: parts[0].trim(), supporting: parts.slice(1).map((s) => s.trim()) };
  }
  return { headliner: title.trim(), supporting: [] };
}

export async function scrapePrekindle(url: string): Promise<ScrapedShow[]> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Showpaper/1.0)' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Prekindle fetch failed: ${res.status}`);

  const html = await res.text();

  // Extract JSON-LD — Prekindle puts all events in a single array
  const ldMatch = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]+?)<\/script>/);
  if (!ldMatch) throw new Error('No JSON-LD found on Prekindle page');

  let events: SchemaEvent[];
  try {
    const parsed = JSON.parse(ldMatch[1]);
    events = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    throw new Error('Failed to parse Prekindle JSON-LD');
  }

  const today = new Date().toISOString().split('T')[0];
  const shows: ScrapedShow[] = [];

  for (const event of events) {
    if (!event.name || !event.startDate) continue;
    // Skip cancelled or past events
    if (event.eventStatus?.includes('EventCancelled')) continue;
    if (event.startDate < today) continue;

    // Determine headliner and supporting from performer array or title
    let headliner: string;
    let supporting: string[] = [];

    const performers = event.performer
      ? Array.isArray(event.performer) ? event.performer : [event.performer]
      : [];

    if (performers.length > 0) {
      headliner = performers[0].name;
      supporting = performers.slice(1).map((p) => p.name).filter(Boolean);
    } else {
      // Fall back to parsing the title
      const parsed = parseArtistsFromTitle(event.name);
      headliner = parsed.headliner;
      supporting = parsed.supporting;
    }

    const { priceMin, priceMax } = parsePrice(event.offers);
    const venueName = event.location?.name ?? 'Hole in the Wall';
    const addr = event.location?.address;
    const venueAddress = addr
      ? `${addr.streetAddress ?? ''}, ${addr.addressLocality ?? ''}, ${addr.addressRegion ?? ''} ${addr.postalCode ?? ''}`.trim().replace(/^,\s*/, '')
      : null;

    shows.push({
      headliner,
      supporting,
      date: event.startDate,
      doorsTime: null,
      showTime: null, // Prekindle doesn't include time in JSON-LD startDate
      venueName,
      venueAddress,
      priceMin,
      priceMax,
      ticketUrl: event.offers?.url ?? event.url ?? null,
      imageUrl: event.image ?? null,
      sourceUrl: event.url ?? url,
    });
  }

  return shows;
}
