#!/usr/bin/env bun

import { parseArgs } from "util";
import { run } from "../src/commands/run";
import { search, list } from "../src/commands/search";
import { info } from "../src/commands/info";
import { edit } from "../src/commands/edit";
import { clone } from "../src/commands/clone";
import { open } from "../src/commands/open";
import { add } from "../src/commands/add";
import { remove } from "../src/commands/remove";
import { showConfig } from "../src/commands/config";
import { mcp } from "../src/commands/mcp";
import { SnippetCache } from "../src/lib/cache";

const VERSION = "0.2.0";

const HELP = `
temper - Homebrew for code snippets

USAGE
  temper <command> [options]

COMMANDS
  search [query]  Search public gallery (or list all)
  list            List local snippets
  run <slug>      Execute a snippet (local first, then public)
  info <slug>     Show snippet details (local first, then public)
  clone <slug>    Copy public snippet to local library
  edit [slug]     Edit local snippet (or open snippets directory)
  add <slug>      Create new local snippet
  remove <slug>   Remove local snippet
  open <slug>     Open public snippet in browser
  cache           Manage local cache
  config          Show current configuration
  mcp             Start MCP server for AI agents

OPTIONS
  -l, --language <lang>  Language variant (default: javascript)
  -f, --force            Force overwrite for clone
  -h, --help             Show help
  -v, --version          Show version

EXAMPLES
  temper search "sort array"
  temper clone quick-sort
  temper edit quick-sort
  temper run quick-sort
  temper run fibonacci --n=10
  echo "hello world" | temper run title-case
  temper list
  temper add my-helper

CONFIGURATION
  ~/.temper/config.json (or TEMPER_CONFIG)

  {
    "snippetsDir": "~/Snippets",
    "cacheDir": "~/.temper/cache",
    "apiBaseUrl": "https://tempercode.dev"
  }

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
      json: { type: "boolean" },
      force: { type: "boolean", short: "f" },
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
        json: values.json,
      });
      break;
    }

    case "search": {
      const query = rest.join(" ") || undefined;

      await search(query, {
        language: values.language,
        type: values.type,
        limit: values.limit ? parseInt(values.limit, 10) : undefined,
        json: values.json,
      });
      break;
    }

    case "list": {
      await list({
        language: values.language,
        type: values.type,
        limit: values.limit ? parseInt(values.limit, 10) : undefined,
        json: values.json,
      });
      break;
    }

    case "clone": {
      if (!slug) {
        console.error("Usage: temper clone <slug> [-l language]");
        console.error("Example: temper clone quick-sort");
        process.exit(1);
      }

      await clone(slug, {
        language: values.language,
        force: values.force,
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
        json: values.json,
      });
      break;
    }

    case "edit": {
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

    case "add": {
      if (!slug) {
        console.error("Usage: temper add <slug> [-l language]");
        console.error("Example: temper add my-helper");
        process.exit(1);
      }

      await add(slug, {
        language: values.language,
        editor: values.editor,
      });
      break;
    }

    case "remove": {
      if (!slug) {
        console.error("Usage: temper remove <slug> [-l language]");
        console.error("Example: temper remove my-helper");
        process.exit(1);
      }

      await remove(slug, {
        language: values.language,
        force: values.force,
      });
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

    case "config": {
      await showConfig({ json: values.json });
      break;
    }

    case "mcp": {
      await mcp();
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
