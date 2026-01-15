import { spawn } from "child_process";
import { LocalSnippets } from "../lib/local";
import { CONFIG } from "../lib/config";

interface EditOptions {
  language?: string;
  editor?: string;
}

// Edit a local snippet or open snippets directory
export async function edit(slug: string | undefined, options: EditOptions): Promise<void> {
  // If no slug provided, open the snippets directory
  if (!slug) {
    const snippetsDir = CONFIG.snippetsDir.replace(/^~/, process.env.HOME || "");
    console.log(`Opening snippets directory: ${snippetsDir}`);
    openInEditor(snippetsDir, options.editor);
    return;
  }

  const local = new LocalSnippets();
  const language = options.language || CONFIG.defaultLanguage;

  // Check if local snippet exists
  const localPath = await local.getFilePath_public(slug, language);

  if (!localPath) {
    console.error(`Local snippet not found: ${slug} (${language})`);
    console.error("\nTo edit a public snippet, first clone it locally:");
    console.error(`  temper clone ${slug}`);
    console.error(`  temper edit ${slug}`);
    process.exit(1);
  }

  // Open existing local snippet
  console.log(`Opening: ${localPath}`);
  openInEditor(localPath, options.editor);
}

function openInEditor(filepath: string, editorOverride?: string): void {
  const editor = editorOverride || CONFIG.defaultEditor;
  console.log(`Opening in ${editor}...`);

  const child = spawn(editor, [filepath], {
    stdio: "inherit",
    detached: false,
  });

  child.on("error", (err) => {
    console.error(`Failed to open editor: ${err.message}`);
    console.error(`You can manually open: ${filepath}`);
    process.exit(1);
  });

  child.on("exit", (code) => {
    if (code === 0) {
      console.log(`\nFile saved at: ${filepath}`);
      console.log(`Run with: temper run ${filepath.split("/").pop()?.replace(/\.\w+$/, "")}`);
    }
  });
}
