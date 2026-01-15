import { TemperApi } from "../lib/api";
import { LocalSnippets } from "../lib/local";
import { executeSnippet, validateParams, mapStdinToParams } from "../lib/executor";
import { CONFIG } from "../lib/config";
import type { Parameter } from "../lib/types";

interface RunOptions {
  params?: Record<string, string>;
  stdin?: string;
  json?: boolean;
}

function parseParamValue(value: string, type: Parameter["type"]): unknown {
  switch (type) {
    case "number":
      return Number(value);
    case "boolean":
      return value === "true" || value === "1";
    case "array":
    case "object":
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    default:
      return value;
  }
}

export async function run(slug: string, options: RunOptions): Promise<void> {
  const local = new LocalSnippets();
  const api = new TemperApi();

  // Check local first, then API (JavaScript only for execution)
  let snippet = await local.get(slug, CONFIG.defaultLanguage);

  if (!snippet) {
    snippet = await api.getSnippet(slug, CONFIG.defaultLanguage);
  }

  if (!snippet) {
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: `Snippet not found: ${slug}` }));
      process.exit(1);
    }
    console.error(`Snippet not found: ${slug}`);
    console.error("Try 'temper search <query>' to find available snippets.");
    process.exit(1);
  }

  // Parse and validate parameters
  const params: Record<string, unknown> = {};

  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      // Find param schema to determine type
      const paramSchema = snippet.parameters?.find(p => p.name === key);
      params[key] = parseParamValue(value, paramSchema?.type || "string");
    }
  }

  // Map stdin to first unset parameter BEFORE validation
  const paramsWithStdin = mapStdinToParams(params, snippet.parameters, options.stdin);

  // Validate parameters (with stdin already mapped)
  const validation = validateParams(paramsWithStdin, snippet.parameters);
  if (!validation.valid) {
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: validation.errors.join("; ") }));
      process.exit(1);
    }
    console.error("Parameter errors:");
    validation.errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }

  // Execute
  const result = await executeSnippet(snippet, params, options.stdin);

  if (options.json) {
    // Silence console to prevent fire-and-forget promises from corrupting JSON output
    const noop = () => {};
    console.log = noop;
    console.warn = noop;
    console.error = noop;
    console.info = noop;
    console.debug = noop;

    // Use stdout directly to bypass silenced console
    process.stdout.write(JSON.stringify({
      success: result.success,
      output: result.output || "",
      ...(result.error && { error: result.error }),
    }) + "\n");

    if (!result.success) {
      process.exit(1);
    }
    return;
  }

  if (result.success) {
    // Output only the result for pipe-friendliness
    if (result.output) {
      console.log(result.output);
    }
  } else {
    console.error(`Error: ${result.error}`);
    if (result.output) {
      console.error(result.output);
    }
    process.exit(1);
  }
}
