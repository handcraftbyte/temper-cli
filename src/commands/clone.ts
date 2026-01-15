import { TemperApi } from "../lib/api";
import { LocalSnippets } from "../lib/local";
import { CONFIG } from "../lib/config";

interface CloneOptions {
  language?: string;
  force?: boolean;
}

// Clone a public snippet to local library
export async function clone(slug: string, options: CloneOptions): Promise<void> {
  const api = new TemperApi();
  const local = new LocalSnippets();
  const language = options.language || CONFIG.defaultLanguage;

  // Check if local snippet already exists
  const localPath = await local.getFilePath_public(slug, language);

  if (localPath && !options.force) {
    console.error(`Local snippet already exists: ${localPath}`);
    console.error("Use --force to overwrite or 'temper edit' to modify it.");
    process.exit(1);
  }

  // Fetch from API
  const snippet = await api.getSnippet(slug, language);

  if (!snippet) {
    console.error(`Snippet not found in public gallery: ${slug} (${language})`);
    console.error("Try 'temper search <query>' to find available snippets.");
    process.exit(1);
  }

  // Save to local snippets
  const filepath = await local.save(snippet);

  console.log(`Cloned to: ${filepath}`);
  console.log(`\nRun 'temper edit ${slug}' to customize or 'temper run ${slug}' to execute.`);
}
