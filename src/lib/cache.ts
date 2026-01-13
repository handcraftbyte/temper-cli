import { mkdir, readFile, writeFile, readdir, unlink } from "fs/promises";
import { join } from "path";
import { CONFIG } from "./config";
import type { Snippet, CachedSnippet, SearchResult } from "./types";

export class SnippetCache {
  private cacheDir: string;
  private searchCacheFile: string;

  constructor(cacheDir = CONFIG.cacheDir) {
    this.cacheDir = cacheDir;
    this.searchCacheFile = join(cacheDir, "_search_index.json");
  }

  private async ensureCacheDir(): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
  }

  private snippetPath(slug: string, language: string): string {
    return join(this.cacheDir, `${slug}--${language}.json`);
  }

  async get(slug: string, language: string): Promise<Snippet | null> {
    try {
      const path = this.snippetPath(slug, language);
      const data = await readFile(path, "utf-8");
      const cached: CachedSnippet = JSON.parse(data);

      // Check if cache is still valid
      if (Date.now() - cached.cachedAt < CONFIG.cacheMaxAge) {
        return cached.snippet;
      }

      // Cache expired, but return it anyway for offline use
      // The API client will try to refresh it
      return cached.snippet;
    } catch {
      return null;
    }
  }

  async set(snippet: Snippet): Promise<void> {
    await this.ensureCacheDir();
    const cached: CachedSnippet = {
      snippet,
      cachedAt: Date.now(),
    };
    const path = this.snippetPath(snippet.slug, snippet.language);
    await writeFile(path, JSON.stringify(cached, null, 2));
  }

  async getSearchIndex(): Promise<SearchResult[] | null> {
    try {
      const data = await readFile(this.searchCacheFile, "utf-8");
      const cached = JSON.parse(data);

      if (Date.now() - cached.cachedAt < CONFIG.cacheMaxAge) {
        return cached.results;
      }

      // Return stale data for offline use
      return cached.results;
    } catch {
      return null;
    }
  }

  async setSearchIndex(results: SearchResult[]): Promise<void> {
    await this.ensureCacheDir();
    const cached = {
      results,
      cachedAt: Date.now(),
    };
    await writeFile(this.searchCacheFile, JSON.stringify(cached, null, 2));
  }

  async listCached(): Promise<string[]> {
    try {
      const files = await readdir(this.cacheDir);
      return files
        .filter(f => f.endsWith(".json") && !f.startsWith("_"))
        .map(f => f.replace(".json", "").replace("--", " (") + ")");
    } catch {
      return [];
    }
  }

  async clear(): Promise<void> {
    try {
      const files = await readdir(this.cacheDir);
      await Promise.all(
        files.map(f => unlink(join(this.cacheDir, f)))
      );
    } catch {
      // Cache dir doesn't exist, nothing to clear
    }
  }
}
