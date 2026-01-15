import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync } from "fs";

// Config file location (only env var we support)
const CONFIG_FILE = process.env.TEMPER_CONFIG || join(homedir(), ".temper", "config.json");

// Helper to resolve ~ in paths
function resolvePath(path: string): string {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

// Load user config file if it exists
function loadUserConfig(): Record<string, string> {
  try {
    if (existsSync(CONFIG_FILE)) {
      const content = readFileSync(CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(content);
      // Resolve all path values
      for (const key of Object.keys(parsed)) {
        if (typeof parsed[key] === "string") {
          parsed[key] = resolvePath(parsed[key]);
        }
      }
      return parsed;
    }
  } catch {
    // Ignore parse errors, use defaults
  }
  return {};
}

const userConfig = loadUserConfig();

export const CONFIG = {
  // Config file path
  configFile: CONFIG_FILE,

  // API
  apiBaseUrl: userConfig.apiBaseUrl || "https://tempercode.dev",

  // Local snippets - default to ~/Snippets for visibility
  snippetsDir: userConfig.snippetsDir || join(homedir(), "Snippets"),

  // Cache
  cacheDir: userConfig.cacheDir || join(homedir(), ".temper", "cache"),
  cacheMaxAge: 24 * 60 * 60 * 1000, // 24 hours in ms

  // Execution - JavaScript only
  defaultLanguage: "javascript",
  executionTimeout: 5000,
  maxOutputLength: 10000,

  // Editor - standard UNIX $EDITOR
  defaultEditor: process.env.EDITOR || process.env.VISUAL || "vim",
};

// For edit command - viewing code in different languages
export const LANGUAGE_EXTENSIONS: Record<string, string> = {
  javascript: "js",
  typescript: "ts",
  python: "py",
  ruby: "rb",
  php: "php",
  bash: "sh",
};
