import { App, PluginSettingTab, Setting } from "obsidian";
import type TemperPlugin from "./main";

export interface TemperSettings {
  cliPath: string;
  snippetsDir: string;
}

// Obsidian subprocess doesn't inherit shell PATH, so use full path
const HOME = process.env.HOME || "";
export const DEFAULT_SETTINGS: TemperSettings = {
  cliPath: `${HOME}/.temper/bin/temper`,
  snippetsDir: `${HOME}/Snippets`,
};

export class TemperSettingsTab extends PluginSettingTab {
  plugin: TemperPlugin;

  constructor(app: App, plugin: TemperPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Temper Settings" });

    new Setting(containerEl)
      .setName("CLI Path")
      .setDesc("Path to the temper CLI executable")
      .addText((text) =>
        text
          .setPlaceholder("temper")
          .setValue(this.plugin.settings.cliPath)
          .onChange(async (value) => {
            this.plugin.settings.cliPath = value;
            this.plugin.bridge.cliPath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Snippets Directory")
      .setDesc("Path to your local snippets directory")
      .addText((text) =>
        text
          .setPlaceholder("~/Snippets")
          .setValue(this.plugin.settings.snippetsDir)
          .onChange(async (value) => {
            this.plugin.settings.snippetsDir = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
