import { CONFIG } from "../lib/config";
import { existsSync } from "fs";

interface ConfigOptions {
  json?: boolean;
}

export async function showConfig(options: ConfigOptions): Promise<void> {
  const configExists = existsSync(CONFIG.configFile);

  if (options.json) {
    console.log(JSON.stringify({
      configFile: CONFIG.configFile,
      snippetsDir: CONFIG.snippetsDir,
      cacheDir: CONFIG.cacheDir,
      apiBaseUrl: CONFIG.apiBaseUrl,
    }));
    return;
  }

  console.log(`
Config:      ${CONFIG.configFile}${configExists ? "" : " (not created)"}
Snippets:    ${CONFIG.snippetsDir}
Cache:       ${CONFIG.cacheDir}
API:         ${CONFIG.apiBaseUrl}
`);
}
