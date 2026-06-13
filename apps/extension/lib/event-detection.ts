import { parseFixture } from "@fanguard/polymarket";

/**
 * FAN-6 — the wedge.
 *
 * Reliably answer "what game is the user looking at, and how much is the
 * ticket?" from a StubHub page. StubHub server-renders a JSON-LD `SportsEvent`
 * block into the event-page HTML (the field it maintains for Google), which is
 * far more stable than scraping rendered DOM. We read that first and fall back
 * to the page `<title>` / `<meta name="description">` only when it's absent
 * (e.g. the checkout host, which carries no JSON-LD).
 */

export type DetectionSource = "json-ld" | "title" | "meta";

export interface DetectedEvent {
  /** Full event name, e.g. "France vs Senegal - World Cup - Group I (Match 17)". */
  name: string;
  /** Parsed teams, when the name looks like a head-to-head fixture. */
  teamA: string | null;
  teamB: string | null;
  /** ISO 8601 kickoff, e.g. "2026-06-16T15:00:00". */
  startDate: string | null;
  /** Venue name, e.g. "MetLife Stadium". */
  venue: string | null;
  /** StubHub numeric event id parsed from the event URL, e.g. "153022598". */
  eventId: string | null;
  /** Canonical event URL when present in the structured data. */
  url: string | null;
  /** Ticket price in USD (cheapest offer from JSON-LD, or a checkout total). */
  priceUsd: number | null;
  /** Where the data came from, for confidence/debugging. */
  source: DetectionSource;
  /** `high` for JSON-LD with a real fixture name; `low` for string-parsed fallbacks. */
  confidence: "high" | "low";
}

type JsonObject = Record<string, unknown>;

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

/** Flatten JSON-LD blocks, expanding `@graph` containers, into a node list. */
export function collectJsonLdNodes(blocks: unknown[]): JsonObject[] {
  const nodes: JsonObject[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (isObject(value)) {
      nodes.push(value);
      if (Array.isArray(value["@graph"])) value["@graph"].forEach(visit);
    }
  };
  blocks.forEach(visit);
  return nodes;
}

function hasType(node: JsonObject, predicate: (type: string) => boolean): boolean {
  return asArray(node["@type"]).some((t) => typeof t === "string" && predicate(t));
}

/** Prefer a `SportsEvent`, then any `*Event` that actually carries name + date. */
function pickEventNode(nodes: JsonObject[]): JsonObject | null {
  return (
    nodes.find((n) => hasType(n, (t) => t === "SportsEvent")) ??
    nodes.find(
      (n) => hasType(n, (t) => /Event$/.test(t)) && typeof n.name === "string" && !!n.startDate,
    ) ??
    null
  );
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Cheapest offer price from a node's `offers` (object, array, or AggregateOffer). */
function extractOfferPrice(node: JsonObject): number | null {
  const prices: number[] = [];
  for (const offer of asArray(node.offers)) {
    if (!isObject(offer)) continue;
    const candidate = offer.lowPrice ?? offer.price;
    const n = toNumber(candidate);
    if (n != null) prices.push(n);
  }
  return prices.length > 0 ? Math.min(...prices) : null;
}

function extractVenue(node: JsonObject): string | null {
  for (const loc of asArray(node.location)) {
    if (typeof loc === "string") return loc;
    if (isObject(loc) && typeof loc.name === "string") return loc.name;
  }
  return null;
}

/** Parse the StubHub numeric event id from a `/event/{id}/` URL. */
export function extractEventId(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/event\/(\d+)/);
  return match?.[1] ?? null;
}

function splitTeams(name: string): { teamA: string | null; teamB: string | null } {
  try {
    const parsed = parseFixture(name);
    return { teamA: parsed.teamA, teamB: parsed.teamB };
  } catch {
    return { teamA: null, teamB: null };
  }
}

/** Build a {@link DetectedEvent} from already-parsed JSON-LD blocks. */
export function parseEventFromJsonLd(blocks: unknown[]): DetectedEvent | null {
  const node = pickEventNode(collectJsonLdNodes(blocks));
  if (!node || typeof node.name !== "string" || !node.name.trim()) return null;

  const name = node.name.trim();
  const url = typeof node.url === "string" ? node.url : null;
  return {
    name,
    ...splitTeams(name),
    startDate: typeof node.startDate === "string" ? node.startDate : null,
    venue: extractVenue(node),
    eventId: extractEventId(url),
    url,
    priceUsd: extractOfferPrice(node),
    source: "json-ld",
    confidence: "high",
  };
}

/**
 * Last-resort parse of the page `<title>`. StubHub titles look like:
 *   "France vs Senegal - World Cup - Group I (Match 17) East Rutherford Tickets | June 16, 2026 | StubHub"
 *   "00:00 left to complete purchase | France vs Senegal - World Cup ... | StubHub"  (checkout)
 */
export function parseTitle(title: string): { name: string; startDate: string | null } | null {
  const segments = title
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    // Drop boilerplate + checkout countdown noise.
    .filter((s) => !/^stubhub$/i.test(s) && !/left to complete purchase/i.test(s));
  if (segments.length === 0) return null;

  // Only treat the title as an event when a segment looks like a "X vs Y"
  // fixture — otherwise a generic page ("Buy & Sell Tickets | StubHub") would
  // yield a bogus name. Strip the trailing "<City> Tickets" marketing suffix.
  const nameSegment = segments.find((s) => /\bvs\.?\b/i.test(s));
  if (!nameSegment) return null;
  const name = nameSegment.replace(/\s+[\w.\s]*\bTickets\b.*$/i, "").trim();
  if (!name) return null;

  const dateSegment = segments.find((s) => /\b\d{4}\b/.test(s) && /[A-Za-z]/.test(s));
  let startDate: string | null = null;
  if (dateSegment) {
    const parsed = Date.parse(dateSegment);
    if (!Number.isNaN(parsed)) startDate = new Date(parsed).toISOString();
  }
  return { name, startDate };
}

interface DetectElement {
  getAttribute(name: string): string | null;
  textContent: string | null;
}

interface DetectDocument {
  querySelectorAll(selectors: string): ArrayLike<{ textContent: string | null }>;
  querySelector(selectors: string): DetectElement | null;
  title: string;
  body?: { textContent: string | null } | null;
}

/**
 * The checkout order summary has no structured price, so read the "Total price"
 * label off the rendered text. Anchoring to that label (rather than the largest
 * dollar amount) avoids the struck-through pre-discount price and per-ticket
 * line items.
 */
export function detectCheckoutPrice(doc: DetectDocument): number | null {
  const text = doc.body?.textContent ?? "";
  const match = text.match(/total\s*price[\s\S]{0,40}?\$\s*([\d,]+(?:\.\d{2})?)/i);
  if (!match?.[1]) return null;
  const value = Number.parseFloat(match[1].replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * The overlay is a checkout-time upsell — "insure your night" only makes sense
 * once the fan is buying a ticket. Event/listing pages carry the same JSON-LD we
 * detect from, so without this gate the card pops up while someone is merely
 * browsing. StubHub's purchase flow lives under a `checkout` host or path
 * segment; match either so we stay out of the way everywhere else.
 */
export function isCheckoutUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    return /(^|\.)checkout\./i.test(hostname) || /(^|\/)checkout(\/|$)/i.test(pathname);
  } catch {
    return false;
  }
}

/** Read and JSON-parse every `application/ld+json` block, skipping malformed ones. */
export function readJsonLdBlocks(doc: DetectDocument): unknown[] {
  const blocks: unknown[] = [];
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    const text = scripts[i]?.textContent;
    if (!text) continue;
    try {
      blocks.push(JSON.parse(text));
    } catch {
      // Ignore malformed JSON-LD rather than failing detection.
    }
  }
  return blocks;
}

/**
 * The checkout host carries no JSON-LD and its `<title>` may lag behind the SPA,
 * but the header keeps the event title as a link to `/event/{id}/`. Read the
 * matchup straight off that anchor.
 */
function detectFromEventLink(doc: DetectDocument): DetectedEvent | null {
  const anchor = doc.querySelector('a[href*="/event/"]');
  if (!anchor) return null;
  const text = (anchor.textContent ?? "").trim();
  if (!text || !/\bvs\.?\b/i.test(text)) return null;
  const href = anchor.getAttribute("href");
  return {
    name: text,
    ...splitTeams(text),
    startDate: null,
    venue: null,
    eventId: extractEventId(href),
    url: href,
    priceUsd: detectCheckoutPrice(doc),
    source: "title",
    confidence: "low",
  };
}

/**
 * Detect the event a StubHub page is showing. Tries JSON-LD first (event pages),
 * then the `<title>` (enriched with the `<meta name="description">` date), and
 * finally the `/event/{id}/` header link (checkout pages, which lack JSON-LD).
 */
export function detectEvent(doc: DetectDocument): DetectedEvent | null {
  const fromJsonLd = parseEventFromJsonLd(readJsonLdBlocks(doc));
  if (fromJsonLd) return fromJsonLd;

  const fromTitle = parseTitle(doc.title);
  if (!fromTitle) return detectFromEventLink(doc);

  let startDate = fromTitle.startDate;
  let source: DetectionSource = "title";
  if (!startDate) {
    const description = doc.querySelector('meta[name="description"]')?.getAttribute("content");
    const match = description?.match(
      /on ([A-Z][a-z]+ \d{1,2}, \d{4}(?:, at \d{1,2}:\d{2} ?[AP]M)?)/,
    );
    if (match?.[1]) {
      const parsed = Date.parse(match[1].replace(", at", ""));
      if (!Number.isNaN(parsed)) {
        startDate = new Date(parsed).toISOString();
        source = "meta";
      }
    }
  }

  const eventHref = doc.querySelector('a[href*="/event/"]')?.getAttribute("href") ?? null;
  return {
    name: fromTitle.name,
    ...splitTeams(fromTitle.name),
    startDate,
    venue: null,
    eventId: extractEventId(eventHref),
    url: null,
    priceUsd: detectCheckoutPrice(doc),
    source,
    confidence: "low",
  };
}
