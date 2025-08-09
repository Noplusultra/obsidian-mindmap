import { App, PluginSettingTab, Setting } from 'obsidian';
import MindmapPlugin from '../main';

export interface MindmapSettings {
	deleteKey: string;
	addChildKey: string;
	editKey: string;
	cancelKey: string;
	toggleModeKey: string;
	autoSave: boolean;
	showGrid: boolean;
}

export const DEFAULT_SETTINGS: MindmapSettings = {
	deleteKey: 'Delete',
	addChildKey: 'Tab',
	editKey: 'Enter',
	cancelKey: 'Escape',
	toggleModeKey: 'Ctrl+M',
	autoSave: true,
	showGrid: true
};

export class MindmapSettingTab extends PluginSettingTab {
	plugin: MindmapPlugin;

	constructor(app: App, plugin: MindmapPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.createEl('h2', { text: '思维导图插件设置' });

		// 快捷键设置
		containerEl.createEl('h3', { text: '快捷键设置' });

		new Setting(containerEl)
			.setName('删除节点')
			.setDesc('删除选中节点的快捷键')
			.addDropdown(dropdown => {
				dropdown
					.addOption('Delete', 'Delete')
					.addOption('Backspace', 'Backspace')
					.setValue(this.plugin.settings.deleteKey)
					.onChange(async (value) => {
						this.plugin.settings.deleteKey = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('添加子节点')
			.setDesc('在选中节点下添加子节点的快捷键')
			.addDropdown(dropdown => {
				dropdown
					.addOption('Tab', 'Tab')
					.addOption('Insert', 'Insert')
					.addOption('Space', 'Space')
					.setValue(this.plugin.settings.addChildKey)
					.onChange(async (value) => {
						this.plugin.settings.addChildKey = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('编辑节点')
			.setDesc('开始编辑选中节点的快捷键（也可以使用i键）')
			.addDropdown(dropdown => {
				dropdown
					.addOption('Enter', 'Enter')
					.addOption('F2', 'F2')
					.addOption('Space', 'Space')
					.setValue(this.plugin.settings.editKey)
					.onChange(async (value) => {
						this.plugin.settings.editKey = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('取消编辑')
			.setDesc('取消编辑节点的快捷键')
			.addDropdown(dropdown => {
				dropdown
					.addOption('Escape', 'Escape')
					.addOption('Ctrl+Z', 'Ctrl+Z')
					.setValue(this.plugin.settings.cancelKey)
					.onChange(async (value) => {
						this.plugin.settings.cancelKey = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('切换模式')
			.setDesc('在Markdown编辑器和思维导图之间切换')
			.addText(text => {
				text
					.setValue(this.plugin.settings.toggleModeKey)
					.onChange(async (value) => {
						this.plugin.settings.toggleModeKey = value;
						await this.plugin.saveSettings();
					});
			});

		// 导航说明
		containerEl.createEl('h3', { text: '导航说明' });
		
		const navigationInfo = containerEl.createDiv('setting-item-description');
		navigationInfo.innerHTML = `
			<strong>额外快捷键：</strong><br>
			• <code>i</code> - 编辑选中的节点<br>
			• <code>↑↓←→</code> - 使用方向键在节点间导航<br>
			• <code>Delete</code> 或 <code>Backspace</code> - 删除选中的节点<br>
			• <code>Tab</code> - 在选中节点下添加子节点<br>
			• <code>Esc</code> - 取消选择或取消编辑
		`;
		navigationInfo.style.marginBottom = '20px';
		navigationInfo.style.padding = '10px';
		navigationInfo.style.backgroundColor = 'var(--background-secondary)';
		navigationInfo.style.borderRadius = '4px';

		// 功能设置
		containerEl.createEl('h3', { text: '功能设置' });

		new Setting(containerEl)
			.setName('自动保存')
			.setDesc('编辑节点时自动保存到文件')
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.autoSave)
					.onChange(async (value) => {
						this.plugin.settings.autoSave = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('显示网格')
			.setDesc('在思维导图画布上显示网格线')
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.showGrid)
					.onChange(async (value) => {
						this.plugin.settings.showGrid = value;
						await this.plugin.saveSettings();
						// 通知所有打开的思维导图视图更新网格显示
						this.plugin.updateGridDisplay();
					});
			});

		// 重置设置按钮
		new Setting(containerEl)
			.setName('重置设置')
			.setDesc('将所有设置重置为默认值')
			.addButton(button => {
				button
					.setButtonText('重置')
					.setWarning()
					.onClick(async () => {
						this.plugin.settings = { ...DEFAULT_SETTINGS };
						await this.plugin.saveSettings();
						this.display(); // 重新显示设置页面
					});
			});
	}
}
