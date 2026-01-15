import { App, FuzzySuggestModal } from "obsidian";
import type { Snippet } from "../bridge";

export class SnippetPickerModal extends FuzzySuggestModal<Snippet> {
  private snippets: Snippet[];
  private onChoose: (snippet: Snippet) => void;

  constructor(
    app: App,
    snippets: Snippet[],
    onChoose: (snippet: Snippet) => void
  ) {
    super(app);
    this.snippets = snippets;
    this.onChoose = onChoose;
    this.setPlaceholder("Search snippets...");
  }

  getItems(): Snippet[] {
    return this.snippets;
  }

  getItemText(snippet: Snippet): string {
    return `${snippet.slug} - ${snippet.title}`;
  }

  onChooseItem(snippet: Snippet): void {
    this.onChoose(snippet);
  }

  renderSuggestion(snippet: { item: Snippet }, el: HTMLElement): void {
    const container = el.createDiv({ cls: "temper-suggestion" });

    const titleLine = container.createDiv({ cls: "temper-suggestion-title" });
    titleLine.createSpan({ text: snippet.item.slug, cls: "temper-suggestion-slug" });
    if (snippet.item.local) {
      titleLine.createSpan({ text: "[local]", cls: "temper-suggestion-local" });
    }

    if (snippet.item.description) {
      container.createDiv({
        text: snippet.item.description,
        cls: "temper-suggestion-desc",
      });
    }
  }
}
