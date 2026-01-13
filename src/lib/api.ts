import { CONFIG } from "./config";
import { SnippetCache } from "./cache";
import type { Snippet, SearchResult, ApiResponse } from "./types";

export class TemperApi {
  private baseUrl: string;
  private cache: SnippetCache;

  constructor(baseUrl = CONFIG.apiBaseUrl, cache = new SnippetCache()) {
    this.baseUrl = baseUrl;
    this.cache = cache;
  }

  private async fetch<T>(path: string): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": "temper-cli/0.1.0",
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Network error",
      };
    }
  }

  async getSnippet(slug: string, language = "javascript"): Promise<Snippet | null> {
    // Try cache first
    const cached = await this.cache.get(slug, language);

    // Try to fetch fresh data
    const response = await this.fetch<Snippet>(
      `/api/snippets/${slug}?language=${language}`
    );

    if (response.success && response.data) {
      // Update cache with fresh data
      await this.cache.set(response.data);
      return response.data;
    }

    // If fetch failed but we have cached data, use it (offline mode)
    if (cached) {
      return cached;
    }

    return null;
  }

  async search(query: string, language?: string): Promise<SearchResult[]> {
    // Build query params
    const params = new URLSearchParams({ q: query });
    if (language) params.set("language", language);

    // Try to fetch fresh search results
    const response = await this.fetch<SearchResult[]>(
      `/api/snippets/search?${params.toString()}`
    );

    if (response.success && response.data) {
      return response.data;
    }

    // Fall back to cached search index for offline search
    const cachedIndex = await this.cache.getSearchIndex();
    if (cachedIndex) {
      const lowerQuery = query.toLowerCase();
      let results = cachedIndex.filter(
        s =>
          s.title.toLowerCase().includes(lowerQuery) ||
          s.description.toLowerCase().includes(lowerQuery) ||
          s.slug.toLowerCase().includes(lowerQuery) ||
          s.tags?.some(t => t.toLowerCase().includes(lowerQuery))
      );

      // Filter by language if specified
      if (language) {
        results = results.filter(s => s.languages.includes(language));
      }

      return results;
    }

    return [];
  }

  async list(options?: { language?: string; type?: string }): Promise<SearchResult[]> {
    const params = new URLSearchParams();
    if (options?.language) params.set("language", options.language);
    if (options?.type) params.set("type", options.type);

    const queryString = params.toString();
    const path = `/api/snippets${queryString ? `?${queryString}` : ""}`;

    const response = await this.fetch<SearchResult[]>(path);

    if (response.success && response.data) {
      // Update search index cache
      await this.cache.setSearchIndex(response.data);
      return response.data;
    }

    // Fall back to cached index
    const cached = await this.cache.getSearchIndex();
    return cached || [];
  }

  async syncCache(): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;

    const list = await this.list();
    if (list.length === 0) {
      return { synced: 0, errors: ["Failed to fetch snippet list"] };
    }

    for (const item of list) {
      const snippet = await this.getSnippet(item.slug, item.language);
      if (snippet) {
        synced++;
      } else {
        errors.push(`Failed to sync: ${item.slug}`);
      }
    }

    return { synced, errors };
  }
}
