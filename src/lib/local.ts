import { mkdir, readFile, writeFile, readdir, unlink, stat } from "fs/promises";
import { join, basename, extname } from "path";
import { CONFIG, LANGUAGE_EXTENSIONS } from "./config";
import type { Snippet, SearchResult, Parameter } from "./types";

// Reverse mapping: extension -> language
const EXTENSION_TO_LANGUAGE: Record<string, string> = {};
for (const [lang, ext] of Object.entries(LANGUAGE_EXTENSIONS)) {
  EXTENSION_TO_LANGUAGE[ext] = lang;
}

// Frontmatter comment patterns for each language
const FRONTMATTER_PATTERNS: Record<string, { start: string; end: string; linePrefix?: string }> = {
  javascript: { start: "/*---", end: "---*/" },
  typescript: { start: "/*---", end: "---*/" },
  python: { start: '"""---', end: '---"""' },
  ruby: { start: "=begin---", end: "---=end" },
  php: { start: "/*---", end: "---*/" },
  bash: { start: "#---", end: "#---", linePrefix: "# " },
};

interface FrontmatterData {
  title?: string;
  description?: string;
  type?: string;
  topic?: string;
  tags?: string[];
  parameters?: Parameter[];
  exampleOutput?: string;
}

function parseYamlSimple(yaml: string): FrontmatterData {
  const result: FrontmatterData = {};
  const lines = yaml.split("\n");
  let currentKey: string | null = null;
  let currentArray: unknown[] | null = null;
  let inParameters = false;
  let currentParam: Partial<Parameter> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Top-level key
    const keyMatch = line.match(/^(\w+):\s*(.*)$/);
    if (keyMatch && !line.startsWith("  ")) {
      // Save previous parameter if any
      if (currentParam && currentParam.name) {
        if (!result.parameters) result.parameters = [];
        result.parameters.push(currentParam as Parameter);
      }
      currentParam = null;

      const [, key, value] = keyMatch;
      currentKey = key;

      if (key === "parameters") {
        inParameters = true;
        currentArray = [];
      } else if (key === "tags" && value.startsWith("[")) {
        // Inline array: tags: [a, b, c]
        const match = value.match(/\[(.*)\]/);
        if (match) {
          result.tags = match[1].split(",").map(s => s.trim().replace(/['"]/g, ""));
        }
        currentKey = null;
      } else if (value) {
        (result as Record<string, unknown>)[key] = value;
        currentKey = null;
      }
    } else if (inParameters && line.match(/^\s+-\s*name:\s*(.+)$/)) {
      // New parameter
      if (currentParam && currentParam.name) {
        if (!result.parameters) result.parameters = [];
        result.parameters.push(currentParam as Parameter);
      }
      const nameMatch = line.match(/^\s+-\s*name:\s*(.+)$/);
      currentParam = { name: nameMatch![1].trim(), type: "string" };
    } else if (inParameters && currentParam && line.match(/^\s+(\w+):\s*(.+)$/)) {
      // Parameter property
      const propMatch = line.match(/^\s+(\w+):\s*(.+)$/);
      if (propMatch) {
        const [, prop, val] = propMatch;
        if (prop === "required") {
          currentParam.required = val === "true";
        } else if (prop === "default") {
          try {
            currentParam.default = JSON.parse(val);
          } catch {
            currentParam.default = val;
          }
        } else {
          (currentParam as Record<string, unknown>)[prop] = val;
        }
      }
    } else if (currentKey === "tags" && line.match(/^\s+-\s*(.+)$/)) {
      // Array item for tags
      const itemMatch = line.match(/^\s+-\s*(.+)$/);
      if (itemMatch) {
        if (!result.tags) result.tags = [];
        result.tags.push(itemMatch[1].trim().replace(/['"]/g, ""));
      }
    }
  }

  // Save last parameter
  if (currentParam && currentParam.name) {
    if (!result.parameters) result.parameters = [];
    result.parameters.push(currentParam as Parameter);
  }

  return result;
}

function serializeYamlSimple(data: FrontmatterData): string {
  const lines: string[] = [];

  if (data.title) lines.push(`title: ${data.title}`);
  if (data.description) lines.push(`description: ${data.description}`);
  if (data.type) lines.push(`type: ${data.type}`);
  if (data.topic) lines.push(`topic: ${data.topic}`);
  if (data.tags?.length) {
    lines.push(`tags: [${data.tags.join(", ")}]`);
  }
  if (data.parameters?.length) {
    lines.push("parameters:");
    for (const param of data.parameters) {
      lines.push(`  - name: ${param.name}`);
      lines.push(`    type: ${param.type}`);
      if (param.required) lines.push(`    required: true`);
      if (param.default !== undefined) {
        lines.push(`    default: ${JSON.stringify(param.default)}`);
      }
      if (param.description) lines.push(`    description: ${param.description}`);
    }
  }

  return lines.join("\n");
}

export class LocalSnippets {
  private snippetsDir: string;

  constructor(dir = CONFIG.snippetsDir) {
    this.snippetsDir = dir;
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.snippetsDir, { recursive: true });
  }

  private getFilePath(slug: string, language: string): string {
    const ext = LANGUAGE_EXTENSIONS[language] || "js";
    return join(this.snippetsDir, `${slug}.${ext}`);
  }

  private parseFile(content: string, language: string): { frontmatter: FrontmatterData; code: string } | null {
    const pattern = FRONTMATTER_PATTERNS[language] || FRONTMATTER_PATTERNS.javascript;
    const startIdx = content.indexOf(pattern.start);

    if (startIdx === -1) {
      // No frontmatter, treat entire file as code
      return { frontmatter: {}, code: content.trim() };
    }

    const endIdx = content.indexOf(pattern.end, startIdx + pattern.start.length);
    if (endIdx === -1) return null;

    let yamlContent = content.slice(startIdx + pattern.start.length, endIdx);

    // Remove line prefixes for bash
    if (pattern.linePrefix) {
      yamlContent = yamlContent
        .split("\n")
        .map(line => line.startsWith(pattern.linePrefix!) ? line.slice(pattern.linePrefix!.length) : line)
        .join("\n");
    }

    const frontmatter = parseYamlSimple(yamlContent);
    const code = content.slice(endIdx + pattern.end.length).trim();

    return { frontmatter, code };
  }

  private formatFile(frontmatter: FrontmatterData, code: string, language: string): string {
    const pattern = FRONTMATTER_PATTERNS[language] || FRONTMATTER_PATTERNS.javascript;
    let yaml = serializeYamlSimple(frontmatter);

    // Add line prefixes for bash
    if (pattern.linePrefix) {
      yaml = yaml
        .split("\n")
        .map(line => pattern.linePrefix + line)
        .join("\n");
    }

    return `${pattern.start}\n${yaml}\n${pattern.end}\n${code}\n`;
  }

  async get(slug: string, language?: string): Promise<Snippet | null> {
    const files = await this.listFiles();

    // Find matching file(s)
    for (const file of files) {
      const name = basename(file, extname(file));
      const ext = extname(file).slice(1);
      const fileLang = EXTENSION_TO_LANGUAGE[ext] || "javascript";

      if (name === slug && (!language || fileLang === language)) {
        try {
          const content = await readFile(file, "utf-8");
          const parsed = this.parseFile(content, fileLang);

          if (!parsed) continue;

          return {
            slug: name,
            title: parsed.frontmatter.title || name,
            description: parsed.frontmatter.description || "",
            language: fileLang,
            code: parsed.code,
            type: parsed.frontmatter.type,
            topic: parsed.frontmatter.topic,
            tags: parsed.frontmatter.tags,
            parameters: parsed.frontmatter.parameters,
            exampleOutput: parsed.frontmatter.exampleOutput,
          };
        } catch {
          continue;
        }
      }
    }

    return null;
  }

  async list(): Promise<SearchResult[]> {
    const files = await this.listFiles();
    const snippetMap = new Map<string, SearchResult>();

    for (const file of files) {
      const name = basename(file, extname(file));
      const ext = extname(file).slice(1);
      const language = EXTENSION_TO_LANGUAGE[ext] || "javascript";

      try {
        const content = await readFile(file, "utf-8");
        const parsed = this.parseFile(content, language);

        if (!parsed) continue;

        const existing = snippetMap.get(name);
        if (existing) {
          existing.languages.push(language);
        } else {
          snippetMap.set(name, {
            slug: name,
            title: parsed.frontmatter.title || name,
            description: parsed.frontmatter.description || "",
            type: parsed.frontmatter.type,
            topic: parsed.frontmatter.topic,
            tags: parsed.frontmatter.tags,
            languages: [language],
          });
        }
      } catch {
        continue;
      }
    }

    return Array.from(snippetMap.values());
  }

  async search(query: string, language?: string): Promise<SearchResult[]> {
    const all = await this.list();
    const lowerQuery = query.toLowerCase();

    let results = all.filter(
      s =>
        s.slug.toLowerCase().includes(lowerQuery) ||
        s.title.toLowerCase().includes(lowerQuery) ||
        s.description.toLowerCase().includes(lowerQuery) ||
        s.tags?.some(t => t.toLowerCase().includes(lowerQuery))
    );

    if (language) {
      results = results.filter(s => s.languages.includes(language));
    }

    return results;
  }

  async create(slug: string, language: string): Promise<string> {
    await this.ensureDir();

    // Find unique slug
    let finalSlug = slug;
    let counter = 1;
    while (await this.exists(finalSlug, language)) {
      finalSlug = `${slug}-${counter}`;
      counter++;
    }

    const frontmatter: FrontmatterData = {
      title: finalSlug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      description: "Description of what this snippet does",
      parameters: [
        { name: "input", type: "string", required: true, description: "The input value" },
      ],
    };

    const defaultCode = this.getDefaultCode(language);
    const content = this.formatFile(frontmatter, defaultCode, language);
    const filePath = this.getFilePath(finalSlug, language);

    await writeFile(filePath, content, "utf-8");

    return filePath;
  }

  async save(snippet: Snippet): Promise<string> {
    await this.ensureDir();

    // Find unique slug
    let finalSlug = snippet.slug;
    let counter = 1;
    while (await this.exists(finalSlug, snippet.language)) {
      finalSlug = `${snippet.slug}-${counter}`;
      counter++;
    }

    const frontmatter: FrontmatterData = {
      title: snippet.title,
      description: snippet.description,
      type: snippet.type,
      topic: snippet.topic,
      tags: snippet.tags,
      parameters: snippet.parameters,
      exampleOutput: snippet.exampleOutput,
    };

    const content = this.formatFile(frontmatter, snippet.code, snippet.language);
    const filePath = this.getFilePath(finalSlug, snippet.language);

    await writeFile(filePath, content, "utf-8");

    return filePath;
  }

  async remove(slug: string, language?: string): Promise<string[]> {
    const files = await this.listFiles();
    const removed: string[] = [];

    for (const file of files) {
      const name = basename(file, extname(file));
      const ext = extname(file).slice(1);
      const fileLang = EXTENSION_TO_LANGUAGE[ext] || "javascript";

      if (name === slug && (!language || fileLang === language)) {
        await unlink(file);
        removed.push(file);
      }
    }

    return removed;
  }

  async exists(slug: string, language?: string): Promise<boolean> {
    const files = await this.listFiles();

    for (const file of files) {
      const name = basename(file, extname(file));
      const ext = extname(file).slice(1);
      const fileLang = EXTENSION_TO_LANGUAGE[ext] || "javascript";

      if (name === slug && (!language || fileLang === language)) {
        return true;
      }
    }

    return false;
  }

  async getFilePath_public(slug: string, language: string): Promise<string | null> {
    const files = await this.listFiles();

    for (const file of files) {
      const name = basename(file, extname(file));
      const ext = extname(file).slice(1);
      const fileLang = EXTENSION_TO_LANGUAGE[ext] || "javascript";

      if (name === slug && fileLang === language) {
        return file;
      }
    }

    return null;
  }

  private async listFiles(): Promise<string[]> {
    try {
      const entries = await readdir(this.snippetsDir);
      const validExtensions = Object.values(LANGUAGE_EXTENSIONS);

      return entries
        .filter(f => {
          const ext = extname(f).slice(1);
          return validExtensions.includes(ext);
        })
        .map(f => join(this.snippetsDir, f));
    } catch {
      return [];
    }
  }

  private getDefaultCode(language: string): string {
    switch (language) {
      case "python":
        return "return input";
      case "ruby":
        return "input";
      case "bash":
        return 'echo "$input"';
      case "php":
        return "return $input;";
      default:
        return "return input;";
    }
  }
}
