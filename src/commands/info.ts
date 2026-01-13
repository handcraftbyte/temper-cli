import { TemperApi } from "../lib/api";
import { CONFIG } from "../lib/config";

interface InfoOptions {
  language?: string;
}

export async function info(slug: string, options: InfoOptions): Promise<void> {
  const api = new TemperApi();

  const snippet = await api.getSnippet(slug, options.language || CONFIG.defaultLanguage);

  if (!snippet) {
    console.error(`Snippet not found: ${slug}`);
    console.error("Try 'temper search <query>' to find available snippets.");
    process.exit(1);
  }

  // Header
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${snippet.title}`);
  console.log(`${"=".repeat(60)}\n`);

  // Metadata
  console.log(`  Slug:      ${snippet.slug}`);
  console.log(`  Language:  ${snippet.language}`);
  if (snippet.type) console.log(`  Type:      ${snippet.type}`);
  if (snippet.topic) console.log(`  Topic:     ${snippet.topic}`);
  if (snippet.tags?.length) console.log(`  Tags:      ${snippet.tags.join(", ")}`);

  // Description
  console.log(`\n  DESCRIPTION`);
  console.log(`  ${"-".repeat(40)}`);
  console.log(`  ${snippet.description}`);

  // Parameters
  if (snippet.parameters?.length) {
    console.log(`\n  PARAMETERS`);
    console.log(`  ${"-".repeat(40)}`);
    for (const param of snippet.parameters) {
      const required = param.required ? " (required)" : "";
      const defaultVal = param.default !== undefined ? ` [default: ${JSON.stringify(param.default)}]` : "";
      console.log(`  --${param.name} <${param.type}>${required}${defaultVal}`);
      if (param.description) {
        console.log(`      ${param.description}`);
      }
    }
  }

  // Code
  console.log(`\n  CODE`);
  console.log(`  ${"-".repeat(40)}`);
  const codeLines = snippet.code.split("\n");
  for (const line of codeLines) {
    console.log(`  ${line}`);
  }

  // Example output
  if (snippet.exampleOutput) {
    console.log(`\n  EXAMPLE OUTPUT`);
    console.log(`  ${"-".repeat(40)}`);
    const outputLines = snippet.exampleOutput.split("\n");
    for (const line of outputLines) {
      console.log(`  ${line}`);
    }
  }

  // Language variants
  if (snippet.variants?.length) {
    console.log(`\n  AVAILABLE IN`);
    console.log(`  ${"-".repeat(40)}`);
    console.log(`  ${snippet.variants.join(", ")}`);
  }

  // Usage examples - use base slug without language suffix
  const baseSlug = snippet.slug.replace(/-(javascript|python|ruby|php|bash)$/, "");

  console.log(`\n  USAGE`);
  console.log(`  ${"-".repeat(40)}`);
  console.log(`  temper run ${baseSlug}`);

  if (snippet.parameters?.length) {
    const exampleParams = snippet.parameters
      .map(p => `--${p.name}=${p.default !== undefined ? JSON.stringify(p.default) : `<${p.type}>`}`)
      .join(" ");
    console.log(`  temper run ${baseSlug} ${exampleParams}`);
  }

  // Stdin example if applicable
  console.log(`  echo "input" | temper run ${baseSlug}`);

  console.log();
}
