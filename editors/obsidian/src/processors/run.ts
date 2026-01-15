import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import type TemperPlugin from "../main";

export class TemperRunProcessor extends MarkdownRenderChild {
  private slug: string = "";
  private params: Record<string, unknown> = {};
  private stdin: string = "";
  private output: string | null = null;
  private isRunning = false;

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
    // ```temper-run
    // slug-name
    // [yaml params]
    // [---]
    // [stdin content]
    // ```

    const lines = this.source.split("\n");
    if (lines.length === 0) return;

    // First line is always the slug
    this.slug = lines[0].trim();

    if (lines.length === 1) return;

    // Rest is params and/or stdin
    const rest = lines.slice(1).join("\n");
    const parts = rest.split("\n---\n");

    if (parts.length === 2) {
      this.params = this.parseYaml(parts[0]);
      this.stdin = parts[1];
    } else if (parts.length === 1 && rest.trim()) {
      if (this.looksLikeYaml(parts[0])) {
        this.params = this.parseYaml(parts[0]);
      } else {
        this.stdin = parts[0];
      }
    }
  }

  private parseYaml(text: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const line of text.split("\n")) {
      const match = line.trim().match(/^(\w+):\s*(.+)$/);
      if (match) {
        const value = match[2].trim();
        // Try to parse as number or boolean
        if (value === "true") result[match[1]] = true;
        else if (value === "false") result[match[1]] = false;
        else if (/^\d+$/.test(value)) result[match[1]] = parseInt(value);
        else if (/^\d+\.\d+$/.test(value)) result[match[1]] = parseFloat(value);
        else result[match[1]] = value;
      }
    }
    return result;
  }

  private looksLikeYaml(text: string): boolean {
    const lines = text.split("\n").filter((l) => l.trim());
    return lines.length > 0 && lines.every((line) => /^\w+:\s*.+$/.test(line.trim()));
  }

  onload(): void {
    this.render();
  }

  private render(): void {
    this.containerEl.empty();
    this.containerEl.addClass("temper-block", "temper-run-block");

    // Header with slug and run button
    const header = this.containerEl.createDiv({ cls: "temper-header" });

    const titleEl = header.createSpan({ cls: "temper-title" });
    titleEl.setText(`▶ ${this.slug || "snippet"}`);

    const actions = header.createDiv({ cls: "temper-actions" });

    const runBtn = actions.createEl("button", {
      cls: "temper-btn temper-run-btn",
      attr: { "aria-label": "Run snippet" },
    });
    runBtn.setText("Run");
    runBtn.onclick = () => this.execute();

    // Input section
    if (this.stdin || Object.keys(this.params).length > 0) {
      const inputSection = this.containerEl.createDiv({ cls: "temper-input" });

      if (Object.keys(this.params).length > 0) {
        const paramsEl = inputSection.createDiv({ cls: "temper-params" });
        for (const [key, value] of Object.entries(this.params)) {
          paramsEl.createDiv({ text: `${key}: ${value}` });
        }
      }

      if (this.stdin) {
        const stdinEl = inputSection.createDiv({ cls: "temper-stdin" });
        stdinEl.setText(this.stdin);
      }
    }

    // Output section
    const outputSection = this.containerEl.createDiv({ cls: "temper-output" });
    if (this.output) {
      outputSection.setText(this.output);
    } else {
      outputSection.addClass("temper-output-empty");
      outputSection.setText("Click Run to execute");
    }
  }

  private async execute(): Promise<void> {
    if (this.isRunning || !this.slug) return;

    this.isRunning = true;
    const outputEl = this.containerEl.querySelector(".temper-output");

    if (outputEl) {
      outputEl.removeClass("temper-output-empty", "temper-output-error");
      outputEl.addClass("temper-output-loading");
      outputEl.setText("Running...");
    }

    try {
      this.output = await this.plugin.bridge.run(
        this.slug,
        this.stdin || undefined,
        Object.keys(this.params).length > 0 ? this.params : undefined
      );

      if (outputEl) {
        outputEl.removeClass("temper-output-loading");
        outputEl.setText(this.output);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (outputEl) {
        outputEl.removeClass("temper-output-loading");
        outputEl.addClass("temper-output-error");
        outputEl.setText(`Error: ${message}`);
      }
    } finally {
      this.isRunning = false;
    }
  }
}
