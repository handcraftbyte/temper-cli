// Map VSCode language IDs to temper language names
const LANGUAGE_MAP: Record<string, string> = {
  javascript: "javascript",
  javascriptreact: "javascript",
  typescript: "typescript",
  typescriptreact: "typescript",
  python: "python",
  ruby: "ruby",
  php: "php",
  shellscript: "bash",
  bash: "bash",
  sh: "bash",
};

export function getTemperLanguage(vscodeLanguageId: string): string | undefined {
  return LANGUAGE_MAP[vscodeLanguageId];
}

export function getSupportedLanguages(): string[] {
  return [...new Set(Object.values(LANGUAGE_MAP))];
}
