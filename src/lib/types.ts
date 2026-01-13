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
  variants?: string[]; // other language variants available
}

export interface Parameter {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
  default?: unknown;
  required?: boolean;
}

export interface SearchResult {
  slug: string;
  title: string;
  description: string;
  type?: string;
  topic?: string;
  tags?: string[];
  languages: string[]; // Available language implementations
}

export interface CachedSnippet {
  snippet: Snippet;
  cachedAt: number;
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  duration?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
