import { homedir } from "os";
import { join } from "path";

export const CONFIG = {
  // API
  apiBaseUrl: process.env.TEMPER_API_URL || "https://tempercode.dev",

  // Cache
  cacheDir: process.env.TEMPER_CACHE_DIR || join(homedir(), ".temper", "cache"),
  cacheMaxAge: 24 * 60 * 60 * 1000, // 24 hours in ms

  // Execution - JavaScript only (bash has portability issues across platforms)
  defaultLanguage: "javascript",
  executionTimeout: 5000, // 5 seconds
  maxOutputLength: 10000, // 10KB

  // Editor
  defaultEditor: process.env.EDITOR || process.env.VISUAL || "vim",
  editDir: process.env.TEMPER_EDIT_DIR || join(homedir(), ".temper", "edit"),
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
