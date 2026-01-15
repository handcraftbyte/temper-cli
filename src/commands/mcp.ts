/**
 * MCP (Model Context Protocol) server for Temper snippets
 *
 * Exposes snippet search, retrieval, and execution to AI agents.
 * Run with: temper mcp
 */

import { TemperApi, executeSnippet, validateParams } from "../lib";
import { LocalSnippets } from "../lib/local";
import type { Snippet, SearchResult, Parameter } from "../lib/types";

// MCP Protocol types
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

// Tool definitions
const TOOLS = [
  {
    name: "search_snippets",
    description:
      "Search for code snippets by query. Returns matching snippets with title, description, and available languages.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query (matches title, description, slug, tags)",
        },
        language: {
          type: "string",
          description: "Filter by language (javascript, python, ruby, php, bash)",
          enum: ["javascript", "python", "ruby", "php", "bash"],
        },
        type: {
          type: "string",
          description: "Filter by snippet type",
          enum: ["general", "utility", "algorithm", "boilerplate"],
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 20)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_snippet",
    description:
      "Get a snippet's full code and metadata by slug. Use this after searching to retrieve the actual implementation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        slug: {
          type: "string",
          description: "The snippet slug (e.g., 'array-unique', 'title-case')",
        },
        language: {
          type: "string",
          description: "Preferred language variant (default: javascript)",
          enum: ["javascript", "python", "ruby", "php", "bash"],
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "run_snippet",
    description:
      "Execute a JavaScript snippet with the given parameters. Returns the output or error.",
    inputSchema: {
      type: "object" as const,
      properties: {
        slug: {
          type: "string",
          description: "The snippet slug to execute",
        },
        params: {
          type: "object",
          description: "Parameters to pass to the snippet",
          additionalProperties: true,
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "list_snippets",
    description:
      "List all available snippets, optionally filtered by language or type. Good for browsing what's available.",
    inputSchema: {
      type: "object" as const,
      properties: {
        language: {
          type: "string",
          description: "Filter by language",
          enum: ["javascript", "python", "ruby", "php", "bash"],
        },
        type: {
          type: "string",
          description: "Filter by type",
          enum: ["general", "utility", "algorithm", "boilerplate"],
        },
        limit: {
          type: "number",
          description: "Maximum results (default: 50)",
        },
      },
    },
  },
  {
    name: "list_local_snippets",
    description:
      "List the user's custom local snippets stored in ~/Snippets directory.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
];

// Server info
const SERVER_INFO = {
  name: "temper-snippets",
  version: "0.1.0",
};

const CAPABILITIES = {
  tools: {},
};

class McpServer {
  private api: TemperApi;
  private local: LocalSnippets;
  private buffer: string = "";

  constructor() {
    this.api = new TemperApi();
    this.local = new LocalSnippets();
  }

  async start(): Promise<void> {
    // Read from stdin line by line
    process.stdin.setEncoding("utf-8");

    for await (const chunk of process.stdin) {
      this.buffer += chunk;
      await this.processBuffer();
    }
  }

  private async processBuffer(): Promise<void> {
    // Process complete lines
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || ""; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);
        await this.handleMessage(message);
      } catch (err) {
        // Invalid JSON, ignore
        this.sendError(null, -32700, "Parse error");
      }
    }
  }

  private async handleMessage(message: JsonRpcRequest): Promise<void> {
    const { id, method, params } = message;

    try {
      switch (method) {
        case "initialize":
          this.sendResult(id, {
            protocolVersion: "2024-11-05",
            serverInfo: SERVER_INFO,
            capabilities: CAPABILITIES,
          });
          break;

        case "initialized":
          // Notification, no response needed
          break;

        case "tools/list":
          this.sendResult(id, { tools: TOOLS });
          break;

        case "tools/call":
          await this.handleToolCall(id, params as { name: string; arguments?: Record<string, unknown> });
          break;

        case "ping":
          this.sendResult(id, {});
          break;

        default:
          this.sendError(id, -32601, `Method not found: ${method}`);
      }
    } catch (err) {
      this.sendError(
        id,
        -32603,
        err instanceof Error ? err.message : "Internal error"
      );
    }
  }

  private async handleToolCall(
    id: string | number,
    params: { name: string; arguments?: Record<string, unknown> }
  ): Promise<void> {
    const { name, arguments: args = {} } = params;

    try {
      let result: unknown;

      switch (name) {
        case "search_snippets":
          result = await this.searchSnippets(args);
          break;

        case "get_snippet":
          result = await this.getSnippet(args);
          break;

        case "run_snippet":
          result = await this.runSnippet(args);
          break;

        case "list_snippets":
          result = await this.listSnippets(args);
          break;

        case "list_local_snippets":
          result = await this.listLocalSnippets();
          break;

        default:
          this.sendError(id, -32602, `Unknown tool: ${name}`);
          return;
      }

      this.sendResult(id, {
        content: [
          {
            type: "text",
            text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
          },
        ],
      });
    } catch (err) {
      this.sendResult(id, {
        content: [
          {
            type: "text",
            text: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
          },
        ],
        isError: true,
      });
    }
  }

  private async searchSnippets(args: Record<string, unknown>): Promise<SearchResult[]> {
    const query = args.query as string;
    const language = args.language as string | undefined;
    const limit = (args.limit as number) || 20;

    // Search both API and local
    const [apiResults, localResults] = await Promise.all([
      this.api.search(query, language),
      this.local.search(query, language),
    ]);

    // Merge and dedupe (local takes priority)
    const localSlugs = new Set(localResults.map(r => r.slug));
    const merged = [
      ...localResults.map(r => ({ ...r, source: "local" })),
      ...apiResults.filter(r => !localSlugs.has(r.slug)),
    ];

    return merged.slice(0, limit);
  }

  private async getSnippet(args: Record<string, unknown>): Promise<Snippet | { error: string }> {
    const slug = args.slug as string;
    const language = (args.language as string) || "javascript";

    // Try local first
    const localSnippet = await this.local.get(slug, language);
    if (localSnippet) {
      return { ...localSnippet, source: "local" } as Snippet & { source: string };
    }

    // Fall back to API
    const snippet = await this.api.getSnippet(slug, language);
    if (!snippet) {
      return { error: `Snippet not found: ${slug}` };
    }

    return snippet;
  }

  private async runSnippet(args: Record<string, unknown>): Promise<{
    success: boolean;
    output?: string;
    error?: string;
    duration?: number;
  }> {
    const slug = args.slug as string;
    const params = (args.params as Record<string, unknown>) || {};

    // Get snippet (try local first)
    let snippet = await this.local.get(slug, "javascript");
    if (!snippet) {
      snippet = await this.api.getSnippet(slug, "javascript");
    }

    if (!snippet) {
      return { success: false, error: `Snippet not found: ${slug}` };
    }

    if (snippet.language !== "javascript") {
      return {
        success: false,
        error: `Only JavaScript snippets can be executed via MCP. This snippet is ${snippet.language}.`,
      };
    }

    // Validate params
    if (snippet.parameters) {
      const validation = validateParams(params, snippet.parameters);
      if (!validation.valid) {
        return { success: false, error: validation.errors.join(", ") };
      }
    }

    // Execute
    const result = await executeSnippet(snippet, params);
    return result;
  }

  private async listSnippets(args: Record<string, unknown>): Promise<SearchResult[]> {
    const language = args.language as string | undefined;
    const type = args.type as string | undefined;
    const limit = (args.limit as number) || 50;

    const results = await this.api.list({ language, type });
    return results.slice(0, limit);
  }

  private async listLocalSnippets(): Promise<SearchResult[]> {
    return this.local.list();
  }

  private sendResult(id: string | number | null, result: unknown): void {
    const response: JsonRpcResponse = {
      jsonrpc: "2.0",
      id,
      result,
    };
    console.log(JSON.stringify(response));
  }

  private sendError(
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown
  ): void {
    const response: JsonRpcResponse = {
      jsonrpc: "2.0",
      id,
      error: { code, message, data },
    };
    console.log(JSON.stringify(response));
  }
}

export async function mcp(): Promise<void> {
  const server = new McpServer();
  await server.start();
}
