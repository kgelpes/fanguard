import { z } from "zod";

/**
 * Thin client over Polymarket's public Gamma API (`gamma-api.polymarket.com`).
 *
 * Gamma is keyless and read-only, so this is safe to call from a server route.
 * The quirky bits (JSON-encoded array fields, the "more-markets" sibling event
 * layout) are handled here so the rest of the package works with clean types.
 */

export const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";

/**
 * Several Gamma fields (`outcomes`, `outcomePrices`, `clobTokenIds`) arrive as
 * JSON-encoded strings rather than real arrays, e.g. `'["Yes", "No"]'`. This
 * coerces either shape into a `string[]`.
 */
const jsonStringArray = z.preprocess((value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}, z.array(z.string()));

export const GammaMarketSchema = z.object({
  id: z.string().optional(),
  slug: z.string().optional().default(""),
  question: z.string().optional().default(""),
  outcomes: jsonStringArray.default([]),
  outcomePrices: jsonStringArray.default([]),
  clobTokenIds: jsonStringArray.default([]),
  line: z.coerce.number().nullish(),
  closed: z.boolean().optional(),
  active: z.boolean().optional(),
});
export type GammaMarket = z.infer<typeof GammaMarketSchema>;

export const GammaSportsSchema = z
  .object({
    gameId: z.coerce.number().nullish(),
    homeTeamName: z.string().nullish(),
    awayTeamName: z.string().nullish(),
    spreadsMainLine: z.coerce.number().nullish(),
  })
  .nullish();

export const GammaEventSchema = z.object({
  id: z.string().optional(),
  slug: z.string(),
  title: z.string().optional().default(""),
  startDate: z.string().nullish(),
  closed: z.boolean().optional(),
  active: z.boolean().optional(),
  sports: GammaSportsSchema,
  markets: z.array(GammaMarketSchema).optional().default([]),
});
export type GammaEvent = z.infer<typeof GammaEventSchema>;

export class GammaApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GammaApiError";
  }
}

export interface GammaClientOptions {
  /** Override the base URL (useful for tests/mocks). */
  baseUrl?: string;
  /** Custom fetch implementation; defaults to global `fetch`. */
  fetch?: typeof fetch;
  /** Per-request timeout in ms. Defaults to 8000. */
  timeoutMs?: number;
}

export class GammaClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: GammaClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? GAMMA_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 8000;
    if (!this.fetchImpl) {
      throw new GammaApiError("No fetch implementation available; pass one via options.fetch");
    }
  }

  private async getJson(path: string, params: Record<string, string | number | boolean>) {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new GammaApiError(`Gamma request timed out: ${path}`);
      }
      throw new GammaApiError(
        `Gamma request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new GammaApiError(`Gamma returned ${response.status} for ${path}`, response.status);
    }
    return response.json();
  }

  /** Search events by (near-literal) title substring. */
  async searchEventsByTitle(
    query: string,
    options: { limit?: number; closed?: boolean } = {},
  ): Promise<GammaEvent[]> {
    const raw = await this.getJson("/events", {
      title_search: query,
      limit: options.limit ?? 20,
      closed: options.closed ?? false,
    });
    return z.array(GammaEventSchema).catch([]).parse(raw);
  }

  /** Fetch a single event by its exact slug, or `null` if it does not exist. */
  async getEventBySlug(slug: string): Promise<GammaEvent | null> {
    const raw = await this.getJson("/events", { slug });
    const events = z.array(GammaEventSchema).catch([]).parse(raw);
    return events[0] ?? null;
  }
}
