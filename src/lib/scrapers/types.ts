export interface ScrapedShow {
  headliner: string;
  supporting: string[];
  date: string;           // YYYY-MM-DD
  doorsTime: string | null; // HH:MM (24h)
  showTime: string | null;
  venueName: string;
  venueAddress: string | null;
  priceMin: number | null;
  priceMax: number | null;
  ticketUrl: string | null;
  imageUrl: string | null; // show poster, used as artist photo fallback
  sourceUrl: string | null;
}

export interface IngestResult {
  source: string;
  inserted: number;
  skipped: number;
  venuesCreated: number;
  artistsEnriched: number;
  errors: string[];
  durationMs: number;
}

// Registry entry for a scrape source
export interface ScrapeSource {
  id: string;
  name: string;
  url: string;
  scrape: () => Promise<ScrapedShow[]>;
}
