import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import type TemperPlugin from "../main";

export class TemperEmbedProcessor extends MarkdownRenderChild {
  private slug: string = "";
  private code: string | null = null;
  private isLocal: boolean = false;
  private isLoading = false;
  private error: string | null = null;

  constructor(
    private plugin: TemperPlugin,
    private source: string,
    containerEl: HTMLElement,
    private ctx: MarkdownPostProcessorContext
  ) {
    super(containerEl);
    this.parseSource();
  }

  private parseSource(): void {
    // Syntax:
    // ```temper-embed
    // slug-name
    // ```
    this.slug = this.source.trim().split("\n")[0].trim();
  }

  onload(): void {
    this.render();
    this.loadSnippet();
  }

  private render(): void {
    this.containerEl.empty();
    this.containerEl.addClass("temper-block", "temper-embed-block");

    // Header with slug and actions
    const header = this.containerEl.createDiv({ cls: "temper-header" });

    const titleEl = header.createSpan({ cls: "temper-title" });
    titleEl.setText(this.slug || "snippet");

    const actions = header.createDiv({ cls: "temper-actions" });

    // Edit button (opens in Obsidian if local)
    const editBtn = actions.createEl("button", {
      cls: "temper-btn",
      attr: { "aria-label": "Edit snippet" },
    });
    editBtn.setText("Edit");
    editBtn.onclick = () => this.openInEditor();

    // External link (opens on tempercode.dev if remote)
    if (!this.isLocal) {
      const linkBtn = actions.createEl("button", {
        cls: "temper-btn",
        attr: { "aria-label": "Open in browser" },
      });
      linkBtn.setText("↗");
      linkBtn.onclick = () => this.openInBrowser();
    }

    // Refresh button
    const refreshBtn = actions.createEl("button", {
      cls: "temper-btn",
      attr: { "aria-label": "Refresh" },
    });
    refreshBtn.setText("↻");
    refreshBtn.onclick = () => this.loadSnippet();

    // Code section
    const codeSection = this.containerEl.createDiv({ cls: "temper-code" });

    if (this.isLoading) {
      codeSection.addClass("temper-code-loading");
      codeSection.setText("Loading...");
    } else if (this.error) {
      codeSection.addClass("temper-code-error");
      codeSection.setText(`Error: ${this.error}`);
    } else if (this.code) {
      const pre = codeSection.createEl("pre");
      const codeEl = pre.createEl("code");
      codeEl.setText(this.code);
    } else {
      codeSection.addClass("temper-code-empty");
      codeSection.setText("No code loaded");
    }
  }

  private async loadSnippet(): Promise<void> {
    if (!this.slug) return;

    this.isLoading = true;
    this.error = null;
    this.render();

    try {
      const snippet = await this.plugin.bridge.info(this.slug);
      this.code = snippet.code || null;
      this.isLocal = snippet.local || false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.error = message;
      this.code = null;
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  private async openInEditor(): Promise<void> {
    if (!this.slug) return;

    try {
      // Get the snippet path from the CLI
      const path = await this.plugin.bridge.getSnippetPath(this.slug);

      // Expand ~ to home directory
      const expandedPath = path.replace(/^~/, process.env.HOME || "");

      // Open the file in Obsidian
      // Note: This will only work if the snippets dir is within the vault
      // or if the user has configured it to be accessible
      const file = this.plugin.app.vault.getAbstractFileByPath(expandedPath);
      if (file) {
        await this.plugin.app.workspace.openLinkText(expandedPath, "", false);
      } else {
        // Fall back to using the system to open the file
        // This will use the default editor
        const { shell } = require("electron");
        shell.openPath(expandedPath);
      }
    } catch (error) {
      console.error("Failed to open snippet:", error);
    }
  }

  private openInBrowser(): void {
    if (!this.slug) return;

    const url = `https://tempercode.dev/snippets/${this.slug}`;
    const { shell } = require("electron");
    shell.openExternal(url);
  }
}
