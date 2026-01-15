import { spawn } from "child_process";

export interface Snippet {
  slug: string;
  title: string;
  description: string;
  language: string;
  code?: string;
  local?: boolean;
  parameters?: Parameter[];
}

export interface Parameter {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
  default?: unknown;
}

export interface TemperConfig {
  snippetsDir: string;
  apiBaseUrl: string;
}

export class TemperBridge {
  constructor(public cliPath: string = "temper") {}

  async exec(
    args: string[],
    stdin?: string,
    json: boolean = true
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const finalArgs = json ? [...args, "--json"] : args;
      const proc = spawn(this.cliPath, finalArgs, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => (stdout += data));
      proc.stderr.on("data", (data) => (stderr += data));

      proc.on("error", (err) => {
        reject(new Error(`Failed to spawn temper: ${err.message}`));
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `Exit code ${code}`));
        }
      });

      if (stdin) {
        proc.stdin.write(stdin);
      }
      proc.stdin.end();
    });
  }

  async list(language?: string): Promise<Snippet[]> {
    const args = ["list"];
    if (language) args.push("--language", language);
    const result = await this.exec(args);
    const parsed = JSON.parse(result);
    return parsed.results ?? parsed;
  }

  async search(query?: string): Promise<Snippet[]> {
    const args = ["search"];
    if (query) args.push(query);
    const result = await this.exec(args);
    const parsed = JSON.parse(result);
    return parsed.results ?? parsed;
  }

  async getAllSnippets(language?: string): Promise<Snippet[]> {
    // Fetch local and cloud in parallel
    const [local, cloud] = await Promise.all([
      this.list(language),
      this.search(),
    ]);

    // Mark sources
    const localWithFlag = local.map(s => ({ ...s, local: true }));
    const cloudWithFlag = cloud.map(s => ({ ...s, local: false }));

    // Merge: local first, skip cloud if slug exists locally
    const localSlugs = new Set(local.map(s => s.slug));
    const merged = [...localWithFlag];
    for (const s of cloudWithFlag) {
      if (!localSlugs.has(s.slug)) {
        merged.push(s);
      }
    }

    return merged;
  }

  async info(slug: string, language?: string): Promise<Snippet> {
    const args = ["info", slug];
    if (language) args.push("--language", language);
    const result = await this.exec(args);
    return JSON.parse(result);
  }

  async run(
    slug: string,
    stdin?: string,
    params?: Record<string, unknown>
  ): Promise<string> {
    const args = ["run", slug];

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        args.push(`--${key}=${value}`);
      }
    }

    // Run without --json flag since output is plain text
    const result = await this.exec(args, stdin, false);
    return result.trim();
  }

  async getConfig(): Promise<TemperConfig> {
    const result = await this.exec(["config"]);
    return JSON.parse(result);
  }

  async getSnippetPath(slug: string, language: string = "js"): Promise<string> {
    const config = await this.getConfig();
    const ext = language === "javascript" ? "js" : language;
    return `${config.snippetsDir}/${slug}.${ext}`;
  }
}
