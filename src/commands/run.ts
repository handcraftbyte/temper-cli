import { TemperApi } from "../lib/api";
import { executeSnippet, validateParams } from "../lib/executor";
import { CONFIG } from "../lib/config";
import type { Parameter } from "../lib/types";

interface RunOptions {
  params?: Record<string, string>;
  stdin?: string;
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
  const api = new TemperApi();

  // JavaScript only
  const snippet = await api.getSnippet(slug, CONFIG.defaultLanguage);

  if (!snippet) {
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

  // Validate parameters
  const validation = validateParams(params, snippet.parameters);
  if (!validation.valid) {
    console.error("Parameter errors:");
    validation.errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }

  // Execute
  const result = await executeSnippet(snippet, params, options.stdin);

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
