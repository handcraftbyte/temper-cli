#!/usr/bin/env bun

import { parseArgs } from "util";
import { run } from "../src/commands/run";
import { search, list } from "../src/commands/search";
import { info } from "../src/commands/info";
import { edit } from "../src/commands/edit";
import { open } from "../src/commands/open";
import { SnippetCache } from "../src/lib/cache";

const VERSION = "0.1.0";

const HELP = `
temper - Homebrew for code snippets

USAGE
  temper <command> [options]

COMMANDS
  run <slug>      Execute a JavaScript snippet
  search <query>  Search for snippets
  list            List all available snippets
  info <slug>     Show detailed snippet information
  edit <slug>     Download snippet and open in editor
  open <slug>     Open snippet in browser
  cache           Manage local cache

OPTIONS
  -l, --language <lang>  Language for info/edit/open (default: javascript)
  -h, --help             Show help
  -v, --version          Show version

EXAMPLES
  temper run generate-uuid
  temper run fibonacci --n=10
  echo "hello world" | temper run title-case
  temper search "sort array"
  temper info quick-sort
  temper open generate-uuid
  temper edit quick-sort -l python

ENVIRONMENT
  EDITOR              Editor for 'temper edit' (default: vim)
  TEMPER_API_URL      API base URL (default: https://tempercode.dev)
  TEMPER_CACHE_DIR    Cache directory (default: ~/.temper/cache)

Learn more: https://tempercode.dev
`;

async function readStdin(): Promise<string | undefined> {
  // Check if stdin is a TTY (interactive terminal)
  // If it's not a TTY, data is being piped in
  if (process.stdin.isTTY) {
    return undefined;
  }

  // Use Bun's native file API for stdin
  const text = await Bun.stdin.text();
  return text.trim() || undefined;
}

function parseParams(args: string[]): Record<string, string> {
  const params: Record<string, string> = {};

  for (const arg of args) {
    if (arg.startsWith("--") && arg.includes("=")) {
      const [key, ...valueParts] = arg.slice(2).split("=");
      params[key] = valueParts.join("=");
    }
  }

  return params;
}

async function main() {
  const args = process.argv.slice(2);

  // Handle empty args
  if (args.length === 0) {
    console.log(HELP);
    process.exit(0);
  }

  // Parse args
  const { values, positionals } = parseArgs({
    args,
    options: {
      language: { type: "string", short: "l" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      editor: { type: "string", short: "e" },
      type: { type: "string", short: "t" },
      limit: { type: "string" },
      clear: { type: "boolean" },
    },
    allowPositionals: true,
    strict: false, // Allow unknown options (for snippet params like --n=10)
  });

  // Handle global flags
  if (values.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (values.version) {
    console.log(`temper ${VERSION}`);
    process.exit(0);
  }

  const [command, ...rest] = positionals;
  const slug = rest[0];

  // Extract custom params (--key=value) from remaining args
  const customParams = parseParams(args);

  switch (command) {
    case "run": {
      if (!slug) {
        console.error("Usage: temper run <slug> [--param=value...]");
        console.error("Example: temper run fibonacci --n=10");
        process.exit(1);
      }

      // Read stdin if available
      const stdin = await readStdin();

      await run(slug, {
        params: customParams,
        stdin,
      });
      break;
    }

    case "search": {
      const query = rest.join(" ");
      if (!query) {
        console.error("Usage: temper search <query>");
        console.error("Example: temper search 'sort array'");
        process.exit(1);
      }

      await search(query, {
        language: values.language,
        type: values.type,
        limit: values.limit ? parseInt(values.limit, 10) : undefined,
      });
      break;
    }

    case "list": {
      await list({
        language: values.language,
        type: values.type,
        limit: values.limit ? parseInt(values.limit, 10) : undefined,
      });
      break;
    }

    case "info": {
      if (!slug) {
        console.error("Usage: temper info <slug>");
        console.error("Example: temper info fibonacci");
        process.exit(1);
      }

      await info(slug, {
        language: values.language,
      });
      break;
    }

    case "edit": {
      if (!slug) {
        console.error("Usage: temper edit <slug> [-l language]");
        console.error("Example: temper edit sort-array -l ruby");
        process.exit(1);
      }

      await edit(slug, {
        language: values.language,
        editor: values.editor,
      });
      break;
    }

    case "open": {
      if (!slug) {
        console.error("Usage: temper open <slug> [-l language]");
        console.error("Example: temper open generate-uuid");
        process.exit(1);
      }

      await open(slug, { language: values.language });
      break;
    }

    case "cache": {
      const cache = new SnippetCache();
      const subcommand = rest[0];

      if (subcommand === "clear" || values.clear) {
        await cache.clear();
        console.log("Cache cleared.");
      } else if (subcommand === "list") {
        const cached = await cache.listCached();
        if (cached.length === 0) {
          console.log("Cache is empty.");
        } else {
          console.log(`Cached snippets (${cached.length}):`);
          cached.forEach(s => console.log(`  ${s}`));
        }
      } else {
        console.log("Usage: temper cache <list|clear>");
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
