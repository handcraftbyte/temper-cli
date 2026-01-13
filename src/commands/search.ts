import { TemperApi } from "../lib/api";

interface SearchOptions {
  language?: string;
  type?: string;
  limit?: number;
}

export async function search(query: string, options: SearchOptions): Promise<void> {
  const api = new TemperApi();

  // Pass language filter to API only if explicitly specified
  let results = await api.search(query, options.language);

  // Filter by type if specified
  if (options.type) {
    results = results.filter(r => r.type === options.type);
  }

  // Limit results
  if (options.limit && options.limit > 0) {
    results = results.slice(0, options.limit);
  }

  if (results.length === 0) {
    console.log(`No snippets found for: "${query}"`);
    console.log("\nTry a different search term or run 'temper list' to see all snippets.");
    return;
  }

  console.log(`Found ${results.length} snippet(s):\n`);

  for (const result of results) {
    console.log(`  ${result.slug.padEnd(35)} ${result.description}`);
  }

  console.log(`\nRun 'temper info <slug>' for details or 'temper run <slug>' to execute.`);
}

export async function list(options: SearchOptions): Promise<void> {
  const api = new TemperApi();

  // List all snippets, optionally filtered by language
  let results = await api.list({
    language: options.language,
    type: options.type,
  });

  // Limit results
  if (options.limit && options.limit > 0) {
    results = results.slice(0, options.limit);
  }

  if (results.length === 0) {
    console.log("No snippets found.");
    return;
  }

  console.log(`Available snippets (${results.length}):\n`);

  for (const result of results) {
    console.log(`  ${result.slug.padEnd(35)} ${result.description}`);
  }

  console.log(`\nRun 'temper info <slug>' for details or 'temper run <slug>' to execute.`);
}
