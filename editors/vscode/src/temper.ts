import { spawn } from "child_process";

export interface SearchResult {
  slug: string;
  title: string;
  description: string;
  type?: string;
  topic?: string;
  tags?: string[];
  languages: string[];
  isLocal?: boolean;
}

export interface Snippet {
  slug: string;
  title: string;
  description: string;
  language: string;
  code: string;
  type?: string;
  topic?: string;
  tags?: string[];
  parameters?: Parameter[];
  exampleOutput?: string;
  related?: string[];
  variants?: string[];
}

export interface Parameter {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
  default?: unknown;
  required?: boolean;
}

export interface RunResult {
  success: boolean;
  output: string;
  error?: string;
}

export class TemperCli {
  constructor(private cliPath: string = "temper") {}

  private exec(args: string[], stdin?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.cliPath, args, {
        shell: true,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code === 0 || stdout) {
          resolve(stdout.trim());
        } else {
          reject(new Error(stderr.trim() || `Process exited with code ${code}`));
        }
      });

      proc.on("error", (err) => {
        reject(err);
      });

      if (stdin) {
        proc.stdin.write(stdin);
        proc.stdin.end();
      }
    });
  }

  async search(query?: string, language?: string): Promise<SearchResult[]> {
    const args = ["search"];
    if (query) {
      args.push(query);
    }
    args.push("--json");
    if (language) {
      args.push("-l", language);
    }

    try {
      const output = await this.exec(args);
      const data = JSON.parse(output);
      const results = data.results || [];
      // Mark as cloud
      return results.map((r: SearchResult) => ({ ...r, isLocal: false }));
    } catch (error) {
      console.error("Search error:", error);
      return [];
    }
  }

  async list(language?: string): Promise<SearchResult[]> {
    const args = ["list", "--json"];
    if (language) {
      args.push("-l", language);
    }

    try {
      const output = await this.exec(args);
      const data = JSON.parse(output);
      const results = data.results || [];
      // Mark as local
      return results.map((r: SearchResult) => ({ ...r, isLocal: true }));
    } catch (error) {
      console.error("List error:", error);
      return [];
    }
  }

  async getAllSnippets(language?: string): Promise<SearchResult[]> {
    // Fetch local and cloud in parallel
    const [local, cloud] = await Promise.all([
      this.list(language),
      this.search(undefined, language),
    ]);

    // Merge: local first, skip cloud if slug exists locally
    const localSlugs = new Set(local.map(r => r.slug));
    const merged = [...local];
    for (const r of cloud) {
      if (!localSlugs.has(r.slug)) {
        merged.push(r);
      }
    }

    return merged;
  }

  async info(slug: string, language?: string): Promise<Snippet | null> {
    const args = ["info", slug, "--json"];
    if (language) {
      args.push("-l", language);
    }

    try {
      const output = await this.exec(args);
      return JSON.parse(output);
    } catch (error) {
      console.error("Info error:", error);
      return null;
    }
  }

  async run(slug: string, stdin?: string): Promise<RunResult> {
    const args = ["run", slug, "--json"];

    try {
      const output = await this.exec(args, stdin);
      return JSON.parse(output);
    } catch (error) {
      // Try to parse JSON error response
      const errStr = String(error);
      const match = errStr.match(/\{.*\}/s);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {
          // Fall through
        }
      }
      return {
        success: false,
        output: "",
        error: String(error),
      };
    }
  }

  async getConfig(): Promise<{ snippetsDir: string; cacheDir: string; apiBaseUrl: string } | null> {
    try {
      const output = await this.exec(["config", "--json"]);
      return JSON.parse(output);
    } catch {
      return null;
    }
  }
}
