import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { TemperApi } from "../lib/api";
import { CONFIG, LANGUAGE_EXTENSIONS } from "../lib/config";

interface EditOptions {
  language?: string;
  editor?: string;
}

export async function edit(slug: string, options: EditOptions): Promise<void> {
  const api = new TemperApi();
  const language = options.language || CONFIG.defaultLanguage;

  // Fetch snippet
  const snippet = await api.getSnippet(slug, language);

  if (!snippet) {
    console.error(`Snippet not found: ${slug} (${language})`);
    console.error("Try 'temper search <query>' to find available snippets.");
    process.exit(1);
  }

  // Ensure edit directory exists
  await mkdir(CONFIG.editDir, { recursive: true });

  // Determine file extension
  const ext = LANGUAGE_EXTENSIONS[snippet.language] || "txt";
  const filename = `${slug}.${ext}`;
  const filepath = join(CONFIG.editDir, filename);

  // Build file content with header comment
  const commentStyle = getCommentStyle(snippet.language);
  const header = [
    `${commentStyle.start}`,
    `${commentStyle.line} Temper Snippet: ${snippet.title}`,
    `${commentStyle.line} Slug: ${snippet.slug}`,
    `${commentStyle.line} Language: ${snippet.language}`,
    `${commentStyle.line}`,
    `${commentStyle.line} ${snippet.description}`,
    `${commentStyle.line}`,
    `${commentStyle.line} Source: https://tempercode.dev/snippets/${snippet.slug}`,
    `${commentStyle.end}`,
    "",
  ].join("\n");

  const content = header + snippet.code;

  // Write file
  await writeFile(filepath, content);
  console.log(`Snippet saved to: ${filepath}`);

  // Open in editor
  const editor = options.editor || CONFIG.defaultEditor;
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
      console.log(`Run with: bun ${filepath}`);
    }
  });
}

interface CommentStyle {
  start: string;
  line: string;
  end: string;
}

function getCommentStyle(language: string): CommentStyle {
  switch (language) {
    case "python":
    case "ruby":
    case "bash":
      return { start: "#", line: "#", end: "#" };
    case "php":
      return { start: "<?php\n/*", line: " *", end: " */" };
    default:
      return { start: "/*", line: " *", end: " */" };
  }
}
