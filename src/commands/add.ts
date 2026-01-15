import { spawn } from "child_process";
import { LocalSnippets } from "../lib/local";
import { CONFIG } from "../lib/config";

interface AddOptions {
  language?: string;
  editor?: string;
}

export async function add(slug: string, options: AddOptions): Promise<void> {
  const local = new LocalSnippets();
  const language = options.language || CONFIG.defaultLanguage;

  // Create the snippet file (auto-increments slug if exists)
  const filepath = await local.create(slug, language);

  console.log(`Created: ${filepath}`);

  // Open in editor
  const editor = options.editor || CONFIG.defaultEditor;
  console.log(`Opening in ${editor}...`);

  const child = spawn(editor, [filepath], {
    stdio: "inherit",
    detached: false,
  });

  child.on("error", (err) => {
    console.error(`Failed to open editor: ${err.message}`);
    console.error(`You can manually edit: ${filepath}`);
    process.exit(1);
  });

  child.on("exit", (code) => {
    if (code === 0) {
      console.log(`\nSnippet saved at: ${filepath}`);
      console.log(`Run with: temper run ${slug}`);
    }
  });
}
