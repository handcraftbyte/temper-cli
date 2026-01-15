import { TemperApi } from "../lib/api";
import { LocalSnippets } from "../lib/local";
import type { SearchResult } from "../lib/types";

interface SearchOptions {
  language?: string;
  type?: string;
  limit?: number;
  json?: boolean;
}

interface ListOptions {
  language?: string;
  type?: string;
  limit?: number;
  json?: boolean;
}

function formatResult(result: SearchResult, isLocal: boolean = false): string {
  const tag = isLocal ? "[local] " : "";
  const slug = result.slug.padEnd(isLocal ? 27 : 35);
  return `  ${slug} ${tag}${result.description}`;
}

// Search public gallery (cloud only)
// If no query provided, lists all public snippets
export async function search(query: string | undefined, options: SearchOptions): Promise<void> {
  const api = new TemperApi();

  let results = query
    ? await api.search(query, options.language)
    : await api.list({ language: options.language, type: options.type });

  // Filter by type if specified
  if (options.type) {
    results = results.filter(r => r.type === options.type);
  }

  // Limit results
  if (options.limit && options.limit > 0) {
    results = results.slice(0, options.limit);
  }

  if (options.json) {
    console.log(JSON.stringify({ results }));
    return;
  }

  if (results.length === 0) {
    if (query) {
      console.log(`No snippets found for: "${query}"`);
      console.log("\nTry a different search term or run 'temper list' to see your local snippets.");
    } else {
      console.log("No public snippets available.");
    }
    return;
  }

  const label = query
    ? `Found ${results.length} snippet(s) for "${query}":`
    : `Public gallery (${results.length} snippets):`;
  console.log(`${label}\n`);

  for (const result of results) {
    console.log(formatResult(result));
  }

  console.log(`\nRun 'temper info <slug>' for details or 'temper clone <slug>' to copy locally.`);
}

// List local library (local only)
export async function list(options: ListOptions): Promise<void> {
  const local = new LocalSnippets();

  let results = await local.list();

  // Filter by language if specified
  if (options.language) {
    results = results.filter(r => r.languages.includes(options.language!));
  }

  // Filter by type if specified
  if (options.type) {
    results = results.filter(r => r.type === options.type);
  }

  // Limit results
  if (options.limit && options.limit > 0) {
    results = results.slice(0, options.limit);
  }

  if (options.json) {
    console.log(JSON.stringify({ results }));
    return;
  }

  if (results.length === 0) {
    console.log("No local snippets found.");
    console.log("\nRun 'temper add <slug>' to create one or 'temper search <query>' to find public snippets.");
    return;
  }

  console.log(`Local snippets (${results.length}):\n`);

  for (const result of results) {
    console.log(formatResult(result, true));
  }

  console.log(`\nRun 'temper run <slug>' to execute or 'temper edit <slug>' to modify.`);
}
