import { Editor, Notice, Plugin, SuggestModal } from "obsidian";
import { TemperBridge, type Snippet } from "./bridge";
import { SnippetPickerModal } from "./modals/snippet-picker";
import { TemperRunProcessor } from "./processors/run";
import { TemperEmbedProcessor } from "./processors/embed";
import {
  TemperSettings,
  TemperSettingsTab,
  DEFAULT_SETTINGS,
} from "./settings";

export default class TemperPlugin extends Plugin {
  settings: TemperSettings = DEFAULT_SETTINGS;
  bridge: TemperBridge = new TemperBridge();

  async onload(): Promise<void> {
    await this.loadSettings();

    // Initialize CLI bridge with configured path
    this.bridge = new TemperBridge(this.settings.cliPath);

    // Register code block processors
    this.registerMarkdownCodeBlockProcessor(
      "temper-run",
      (source, el, ctx) => {
        const processor = new TemperRunProcessor(this, source, el, ctx);
        ctx.addChild(processor);
      }
    );

    this.registerMarkdownCodeBlockProcessor(
      "temper-embed",
      (source, el, ctx) => {
        const processor = new TemperEmbedProcessor(this, source, el, ctx);
        ctx.addChild(processor);
      }
    );

    // Command: Run snippet on selection (replace)
    this.addCommand({
      id: "run-on-selection-replace",
      name: "Run snippet on selection (replace)",
      editorCallback: (editor) => this.runOnSelection(editor, "replace"),
    });

    // Command: Run snippet on selection (insert below)
    this.addCommand({
      id: "run-on-selection-insert",
      name: "Run snippet on selection (insert below)",
      editorCallback: (editor) => this.runOnSelection(editor, "insert"),
    });

    // Command: Insert snippet code
    this.addCommand({
      id: "insert-snippet-code",
      name: "Insert snippet code",
      editorCallback: (editor) => this.insertSnippetCode(editor),
    });

    // Command: Edit snippet
    this.addCommand({
      id: "edit-snippet",
      name: "Edit snippet",
      callback: () => this.editSnippet(),
    });

    // Command: Insert run block
    this.addCommand({
      id: "insert-run-block",
      name: "Insert run block",
      editorCallback: (editor) => this.insertRunBlock(editor),
    });

    // Command: Insert embed block
    this.addCommand({
      id: "insert-embed-block",
      name: "Insert embed block",
      editorCallback: (editor) => this.insertEmbedBlock(editor),
    });

    // Command: Quick run by slug (replace)
    this.addCommand({
      id: "quick-run-replace",
      name: "Quick run by slug (replace)",
      editorCallback: (editor) => this.quickRunBySlug(editor, "replace"),
    });

    // Command: Quick run by slug (insert below)
    this.addCommand({
      id: "quick-run-insert",
      name: "Quick run by slug (insert below)",
      editorCallback: (editor) => this.quickRunBySlug(editor, "insert"),
    });

    // Settings tab
    this.addSettingTab(new TemperSettingsTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async runOnSelection(
    editor: Editor,
    mode: "replace" | "insert"
  ): Promise<void> {
    new SlugSearchModal(this.app, this.bridge, async (slug) => {
      const selection = editor.getSelection();

      try {
        const result = await this.bridge.run(slug, selection);

        if (mode === "replace") {
          editor.replaceSelection(result);
        } else {
          const cursor = editor.getCursor("to");
          editor.replaceRange("\n" + result, cursor);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        new Notice(`Temper error: ${message}`);
      }
    }).open();
  }

  private async insertSnippetCode(editor: Editor): Promise<void> {
    try {
      const snippets = await this.bridge.getAllSnippets();

      new SnippetPickerModal(this.app, snippets, async (snippet) => {
        try {
          const info = await this.bridge.info(snippet.slug);
          if (info.code) {
            editor.replaceSelection(info.code);
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          new Notice(`Temper error: ${message}`);
        }
      }).open();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Failed to load snippets: ${message}`);
    }
  }

  private async editSnippet(): Promise<void> {
    try {
      const snippets = await this.bridge.list();

      // Filter to only local snippets that can be edited
      const localSnippets = snippets.filter((s) => s.local);

      if (localSnippets.length === 0) {
        new Notice("No local snippets found to edit");
        return;
      }

      new SnippetPickerModal(this.app, localSnippets, async (snippet) => {
        try {
          const path = await this.bridge.getSnippetPath(
            snippet.slug,
            snippet.language
          );
          const expandedPath = path.replace(
            /^~/,
            process.env.HOME || ""
          );

          // Try to open in Obsidian first
          const file = this.app.vault.getAbstractFileByPath(expandedPath);
          if (file) {
            await this.app.workspace.openLinkText(expandedPath, "", false);
          } else {
            // Fall back to system editor
            const { shell } = require("electron");
            shell.openPath(expandedPath);
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          new Notice(`Failed to open snippet: ${message}`);
        }
      }).open();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Failed to load snippets: ${message}`);
    }
  }

  private async insertRunBlock(editor: Editor): Promise<void> {
    try {
      const snippets = await this.bridge.getAllSnippets();

      new SnippetPickerModal(this.app, snippets, (snippet) => {
        const block = `\`\`\`temper-run\n${snippet.slug}\n\n\`\`\``;
        editor.replaceSelection(block);

        // Move cursor inside the block (on the empty line for input)
        const cursor = editor.getCursor();
        editor.setCursor({ line: cursor.line - 1, ch: 0 });
      }).open();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Failed to load snippets: ${message}`);
    }
  }

  private async insertEmbedBlock(editor: Editor): Promise<void> {
    try {
      const snippets = await this.bridge.getAllSnippets();

      new SnippetPickerModal(this.app, snippets, (snippet) => {
        const block = `\`\`\`temper-embed\n${snippet.slug}\n\`\`\``;
        editor.replaceSelection(block);
      }).open();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Failed to load snippets: ${message}`);
    }
  }

  private async quickRunBySlug(
    editor: Editor,
    mode: "replace" | "insert"
  ): Promise<void> {
    new SlugSearchModal(this.app, this.bridge, async (slug) => {
      const selection = editor.getSelection();

      try {
        const result = await this.bridge.run(slug, selection);

        if (mode === "replace") {
          editor.replaceSelection(result);
        } else {
          const cursor = editor.getCursor("to");
          editor.replaceRange("\n" + result, cursor);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        new Notice(`Temper error: ${message}`);
      }
    }).open();
  }
}

class SlugSearchModal extends SuggestModal<Snippet> {
  private bridge: TemperBridge;
  private onChoose: (slug: string) => void;
  private localSnippets: Snippet[] = [];

  constructor(
    app: InstanceType<typeof Plugin>["app"],
    bridge: TemperBridge,
    onChoose: (slug: string) => void
  ) {
    super(app);
    this.bridge = bridge;
    this.onChoose = onChoose;
    this.setPlaceholder("Search snippets...");

    // Load all snippets (local + cloud)
    this.bridge.getAllSnippets().then((snippets) => {
      this.localSnippets = snippets;
    }).catch(() => {
      // CLI not available
      this.localSnippets = [];
    });
  }

  async getSuggestions(query: string): Promise<Snippet[]> {
    const lower = query.toLowerCase().trim();

    // Filter local snippets
    const localMatches = lower
      ? this.localSnippets.filter(
          (s) =>
            s.slug.toLowerCase().includes(lower) ||
            s.title.toLowerCase().includes(lower) ||
            s.description?.toLowerCase().includes(lower)
        )
      : this.localSnippets;

    // Search remote gallery if query has 2+ chars
    let remoteResults: Snippet[] = [];
    if (lower.length >= 2) {
      try {
        remoteResults = await this.bridge.search(query);
      } catch {
        remoteResults = [];
      }
    }

    // Combine: local first, then remote (deduplicated)
    const seen = new Set(localMatches.map((s) => s.slug));
    const combined = [...localMatches];
    for (const s of remoteResults) {
      if (!seen.has(s.slug)) {
        combined.push(s);
      }
    }

    return combined;
  }

  renderSuggestion(snippet: Snippet, el: HTMLElement): void {
    const container = el.createDiv({ cls: "temper-suggestion" });
    const titleLine = container.createDiv({ cls: "temper-suggestion-title" });
    titleLine.createSpan({ text: snippet.slug, cls: "temper-suggestion-slug" });
    if (snippet.local) {
      titleLine.createSpan({ text: " [local]", cls: "temper-suggestion-local" });
    }
    if (snippet.description) {
      container.createDiv({
        text: snippet.description,
        cls: "temper-suggestion-desc",
      });
    }
  }

  onChooseSuggestion(snippet: Snippet): void {
    this.onChoose(snippet.slug);
  }
}
