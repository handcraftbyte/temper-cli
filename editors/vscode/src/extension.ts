import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";
import { TemperCli, SearchResult, Snippet } from "./temper";
import { getTemperLanguage } from "./language";

let cli: TemperCli;
let outputChannel: vscode.OutputChannel;
let snippetsDir: string | null = null;

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("temper");
  cli = new TemperCli(config.get("cliPath", "temper"));
  outputChannel = vscode.window.createOutputChannel("Temper");

  // Load snippets directory from config
  loadSnippetsDir();

  context.subscriptions.push(
    vscode.commands.registerCommand("temper.runCurrentSnippet", runCurrentSnippet),
    vscode.commands.registerCommand("temper.searchInsert", searchAndInsert),
    vscode.commands.registerCommand("temper.runReplace", () => runSnippet("replace")),
    vscode.commands.registerCommand("temper.runInsertBelow", () => runSnippet("insertBelow")),
    vscode.commands.registerCommand("temper.runShowOutput", () => runSnippet("showOutput")),
    vscode.commands.registerCommand("temper.refreshCache", refreshCache),
    outputChannel
  );

  // Update CLI path on config change
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("temper.cliPath")) {
      const config = vscode.workspace.getConfiguration("temper");
      cli = new TemperCli(config.get("cliPath", "temper"));
    }
  });
}

async function loadSnippetsDir() {
  try {
    const config = await cli.getConfig();
    snippetsDir = config?.snippetsDir || path.join(os.homedir(), "Snippets");
  } catch {
    snippetsDir = path.join(os.homedir(), "Snippets");
  }
}

function isSnippetFile(filePath: string): boolean {
  if (!snippetsDir || !filePath) return false;
  return filePath.startsWith(snippetsDir);
}

function getSlugFromPath(filePath: string): string | null {
  if (!filePath) return null;
  const basename = path.basename(filePath);
  // Remove extension: my-helper.js -> my-helper
  return basename.replace(/\.[^.]+$/, "");
}

async function runCurrentSnippet() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor");
    return;
  }

  const filePath = editor.document.uri.fsPath;
  const slug = getSlugFromPath(filePath);

  if (!slug) {
    vscode.window.showErrorMessage("Could not determine snippet slug");
    return;
  }

  // Check if file is in snippets directory
  if (!isSnippetFile(filePath)) {
    const proceed = await vscode.window.showWarningMessage(
      `This file is not in your snippets directory (${snippetsDir}). Run anyway?`,
      "Run",
      "Cancel"
    );
    if (proceed !== "Run") return;
  }

  // Get selected text as stdin (if any)
  const selection = editor.selection;
  const selectedText = selection.isEmpty ? undefined : editor.document.getText(selection);

  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Running ${slug}...`,
        cancellable: false,
      },
      async () => cli.run(slug, selectedText)
    );

    if (!result.success) {
      vscode.window.showErrorMessage(`Error: ${result.error}`);
      outputChannel.clear();
      outputChannel.appendLine(`Snippet: ${slug}`);
      outputChannel.appendLine("---");
      outputChannel.appendLine(`Error: ${result.error}`);
      outputChannel.show();
      return;
    }

    // Show output in panel
    outputChannel.clear();
    outputChannel.appendLine(`Snippet: ${slug}`);
    outputChannel.appendLine("---");
    outputChannel.appendLine(result.output);
    outputChannel.show();
  } catch (error) {
    vscode.window.showErrorMessage(`Temper error: ${error}`);
  }
}

async function searchAndInsert() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor");
    return;
  }

  const language = getTemperLanguage(editor.document.languageId);

  try {
    // Show loading indicator while fetching local + cloud snippets
    const results = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Temper: Loading snippets...",
        cancellable: false,
      },
      async () => {
        return await cli.getAllSnippets(language);
      }
    );

    if (results.length === 0) {
      // Fall back to all snippets if none match language
      const allResults = await cli.getAllSnippets();
      if (allResults.length === 0) {
        vscode.window.showInformationMessage("No snippets available");
        return;
      }
      return showSnippetPicker(allResults, language, editor);
    }

    await showSnippetPicker(results, language, editor);
  } catch (error) {
    vscode.window.showErrorMessage(`Temper error: ${error}`);
  }
}

async function showSnippetPicker(
  results: SearchResult[],
  language: string | undefined,
  editor: vscode.TextEditor
) {
  // Show quick pick with all snippets
  const items = results.map((r) => ({
    label: r.isLocal ? `${r.title || r.slug}  [local]` : r.title || r.slug,
    description: r.slug,
    detail: r.description,
    result: r,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Select a snippet to insert (type to filter)",
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!selected) {
    return;
  }

  // Get snippet info - try current language first, fall back to JavaScript
  let snippet = await cli.info(selected.result.slug, language);

  if (!snippet && language && language !== "javascript") {
    snippet = await cli.info(selected.result.slug, "javascript");
  }

  if (!snippet) {
    vscode.window.showErrorMessage(`Failed to fetch snippet: ${selected.result.slug}`);
    return;
  }

  // Insert code
  await editor.edit((editBuilder) => {
    editBuilder.insert(editor.selection.active, snippet!.code);
  });

  vscode.window.showInformationMessage(`Inserted: ${selected.result.slug}`);
}

async function runSnippet(mode: "replace" | "insertBelow" | "showOutput") {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor");
    return;
  }

  const selection = editor.selection;
  const selectedText = editor.document.getText(selection);

  if (!selectedText && mode !== "showOutput") {
    vscode.window.showErrorMessage("No text selected");
    return;
  }

  try {
    // Show loading indicator while fetching local + cloud snippets
    const results = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Temper: Loading snippets...",
        cancellable: false,
      },
      async () => {
        return await cli.getAllSnippets();
      }
    );

    if (results.length === 0) {
      vscode.window.showInformationMessage("No snippets available");
      return;
    }

    // Show quick pick with all snippets
    const items = results.map((r) => ({
      label: r.isLocal ? `${r.title || r.slug}  [local]` : r.title || r.slug,
      description: r.slug,
      detail: r.description,
      result: r,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a snippet to run (type to filter)",
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (!selected) {
      return;
    }

    // Run snippet with selected text as stdin
    const result = await cli.run(selected.result.slug, selectedText || undefined);

    if (!result.success) {
      vscode.window.showErrorMessage(`Error: ${result.error}`);
      return;
    }

    switch (mode) {
      case "replace":
        await editor.edit((editBuilder) => {
          editBuilder.replace(selection, result.output);
        });
        vscode.window.showInformationMessage(`Replaced with ${selected.result.slug} output`);
        break;

      case "insertBelow":
        const endLine = selection.end.line;
        const position = new vscode.Position(endLine + 1, 0);
        await editor.edit((editBuilder) => {
          editBuilder.insert(position, result.output + "\n");
        });
        vscode.window.showInformationMessage(`Inserted ${selected.result.slug} output below`);
        break;

      case "showOutput":
        outputChannel.clear();
        outputChannel.appendLine(`Snippet: ${selected.result.slug}`);
        outputChannel.appendLine("---");
        outputChannel.appendLine(result.output);
        outputChannel.show();
        break;
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Temper error: ${error}`);
  }
}

async function refreshCache() {
  try {
    const [local, cloud] = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Temper: Refreshing snippets...",
        cancellable: false,
      },
      async () => {
        return Promise.all([cli.list(), cli.search()]);
      }
    );
    vscode.window.showInformationMessage(`Temper: Loaded ${local.length} local + ${cloud.length} cloud snippets`);
  } catch (error) {
    vscode.window.showErrorMessage(`Temper error: ${error}`);
  }
}

export function deactivate() {}
