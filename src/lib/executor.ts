import type { Snippet, Parameter, ExecutionResult } from "./types";
import { CONFIG } from "./config";

function formatValue(value: unknown): string {
  if (value === undefined) {
    return "";
  } else if (value === null) {
    return "null";
  } else if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  } else if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  } else {
    return String(value);
  }
}

// Detect if code needs async execution
function needsAsync(code: string): boolean {
  if (/\bawait\b/.test(code)) return true;
  if (/\bfetch\s*\(/.test(code)) return true;
  if (/\.then\s*\(/.test(code)) return true;
  return false;
}

/**
 * Check if code is a one-liner expression (auto-add return)
 */
function isOneLiner(code: string): boolean {
  const trimmed = code.trim();
  // Must be single line
  if (trimmed.includes("\n")) return false;
  // Already has return
  if (trimmed.startsWith("return ")) return false;
  // Skip statements that shouldn't have return
  if (/^(if|for|while|switch|try|const|let|var|function|class)\b/.test(trimmed)) return false;
  return true;
}

function parseStdin(stdin: string): { value: unknown; type: string } {
  const trimmed = stdin.trim();

  // Try parsing as JSON first
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return { value: parsed, type: "array" };
    } else if (typeof parsed === "object" && parsed !== null) {
      return { value: parsed, type: "object" };
    } else if (typeof parsed === "number") {
      return { value: parsed, type: "number" };
    } else if (typeof parsed === "boolean") {
      return { value: parsed, type: "boolean" };
    } else if (typeof parsed === "string") {
      return { value: parsed, type: "string" };
    }
  } catch {
    // Not valid JSON
  }

  // Check if it looks like a number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return { value: Number(trimmed), type: "number" };
  }

  // Check for boolean
  if (trimmed === "true") return { value: true, type: "boolean" };
  if (trimmed === "false") return { value: false, type: "boolean" };

  // Default to string
  return { value: stdin, type: "string" };
}

export async function executeSnippet(
  snippet: Snippet,
  params: Record<string, unknown> = {},
  stdin?: string
): Promise<ExecutionResult> {
  // Build params with defaults
  const allParams = { ...params };

  // If stdin is provided, intelligently map to first matching unset parameter
  if (stdin !== undefined) {
    const { value: stdinValue, type: stdinType } = parseStdin(stdin);

    // Find first parameter that matches the stdin type and wasn't explicitly set
    const matchingParam = snippet.parameters?.find(
      p => p.type === stdinType && !(p.name in params)
    );

    if (matchingParam) {
      allParams[matchingParam.name] = stdinValue;
    } else {
      // Fall back to first unset parameter of any type
      const firstUnsetParam = snippet.parameters?.find(p => !(p.name in params));
      if (firstUnsetParam) {
        // Coerce to expected type if possible
        if (firstUnsetParam.type === "string") {
          allParams[firstUnsetParam.name] = String(stdin);
        } else if (firstUnsetParam.type === "number" && typeof stdinValue === "number") {
          allParams[firstUnsetParam.name] = stdinValue;
        } else if (firstUnsetParam.type === "array" && Array.isArray(stdinValue)) {
          allParams[firstUnsetParam.name] = stdinValue;
        } else if (firstUnsetParam.type === "object" && typeof stdinValue === "object") {
          allParams[firstUnsetParam.name] = stdinValue;
        } else if (firstUnsetParam.type === "boolean" && typeof stdinValue === "boolean") {
          allParams[firstUnsetParam.name] = stdinValue;
        } else {
          // Last resort - use string representation
          allParams[firstUnsetParam.name] = stdin;
        }
      }
    }

    // Also provide raw stdin for snippets that explicitly use it
    allParams.stdin = stdin;
    allParams.input = stdinValue;
  }

  // Add defaults for missing optional parameters
  for (const param of snippet.parameters || []) {
    if (!(param.name in allParams) && param.default !== undefined) {
      allParams[param.name] = param.default;
    }
  }

  // JavaScript execution
  const startTime = performance.now();
  const logs: string[] = [];

  // Capture console output
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
  };

  const captureLog = (prefix: string) => (...args: unknown[]) => {
    const formatted = args.map(arg => formatValue(arg)).join(" ");
    logs.push(prefix ? `[${prefix}] ${formatted}` : formatted);
  };

  console.log = captureLog("");
  console.warn = captureLog("warn");
  console.error = captureLog("error");
  console.info = captureLog("info");
  console.debug = captureLog("debug");

  try {
    // Create parameter declarations
    const paramDeclarations = Object.entries(allParams)
      .map(([key, value]) => `const ${key} = ${JSON.stringify(value)};`)
      .join("\n");

    const code = snippet.code;
    const isAsync = needsAsync(code);

    // Auto-add return for one-liner expressions
    const processedCode = isOneLiner(code) ? `return ${code.trim()}` : code;

    const fullCode = `
      ${paramDeclarations}
      ${processedCode}
    `;

    let result: unknown;
    if (isAsync) {
      const fn = new Function(`return (async () => { ${fullCode} })();`);
      let timeoutId: Timer;
      result = await Promise.race([
        fn(),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("Execution timeout")), CONFIG.executionTimeout);
        }),
      ]).finally(() => clearTimeout(timeoutId));
    } else {
      const fn = new Function(fullCode);
      result = fn();
    }

    const duration = performance.now() - startTime;

    // Combine console output with return value
    const returnOutput = formatValue(result);
    const consoleOutput = logs.join("\n");
    const output = [consoleOutput, returnOutput].filter(Boolean).join("\n");

    return {
      success: true,
      output: output.slice(0, CONFIG.maxOutputLength),
      duration,
    };
  } catch (err) {
    const duration = performance.now() - startTime;
    const consoleOutput = logs.join("\n");
    return {
      success: false,
      output: consoleOutput,
      error: err instanceof Error ? err.message : String(err),
      duration,
    };
  } finally {
    // Restore original console methods
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
  }
}

export function validateParams(
  params: Record<string, unknown>,
  schema: Parameter[] = []
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const param of schema) {
    const value = params[param.name];

    if (param.required && value === undefined) {
      errors.push(`Missing required parameter: ${param.name}`);
      continue;
    }

    if (value === undefined) continue;

    // Type checking
    const actualType = Array.isArray(value) ? "array" : typeof value;
    if (actualType !== param.type) {
      errors.push(
        `Parameter '${param.name}' should be ${param.type}, got ${actualType}`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
