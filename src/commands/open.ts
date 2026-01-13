import { CONFIG } from "../lib/config";

interface OpenOptions {
  language?: string;
}

export async function open(slug: string, options: OpenOptions = {}): Promise<void> {
  const language = options.language || CONFIG.defaultLanguage;

  // Append language if not already present
  let fullSlug = slug;
  if (!slug.match(/-(javascript|python|ruby|php|bash)$/)) {
    fullSlug = `${slug}-${language}`;
  }

  const url = `${CONFIG.apiBaseUrl}/snippets/${fullSlug}`;

  // Use platform-specific command to open browser
  const platform = process.platform;
  let command: string;
  let args: string[];

  if (platform === "darwin") {
    command = "open";
    args = [url];
  } else if (platform === "win32") {
    command = "cmd";
    args = ["/c", "start", url];
  } else {
    // Linux and others
    command = "xdg-open";
    args = [url];
  }

  const proc = Bun.spawn([command, ...args], {
    stdout: "ignore",
    stderr: "ignore",
  });

  await proc.exited;

  console.log(`Opening ${url}`);
}
