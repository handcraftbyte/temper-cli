import { LocalSnippets } from "../lib/local";

interface RemoveOptions {
  language?: string;
  force?: boolean;
}

export async function remove(slug: string, options: RemoveOptions): Promise<void> {
  const local = new LocalSnippets();

  // Check if snippet exists
  const exists = await local.exists(slug, options.language);

  if (!exists) {
    console.error(`Local snippet not found: ${slug}`);
    console.error("Use 'temper list --local' to see your local snippets.");
    process.exit(1);
  }

  // Remove the snippet(s)
  const removed = await local.remove(slug, options.language);

  if (removed.length === 0) {
    console.error(`No files removed for: ${slug}`);
    process.exit(1);
  }

  for (const file of removed) {
    console.log(`Removed: ${file}`);
  }
}
