import { Plugin, TFile, WorkspaceLeaf, Notice } from 'obsidian';
import { MindmapView, VIEW_TYPE_MINDMAP } from './src/mindmap-view';
import { MindmapSettingTab, MindmapSettings, DEFAULT_SETTINGS } from './src/settings';

export default class MindmapPlugin extends Plugin {
	settings: MindmapSettings;

	async onload() {
		console.log('加载思维导图插件');

		// 加载设置
		await this.loadSettings();

		// 注册设置选项卡
		this.addSettingTab(new MindmapSettingTab(this.app, this));

		// 注册思维导图视图
		this.registerView(
			VIEW_TYPE_MINDMAP,
			(leaf) => new MindmapView(leaf, this)
		);

		// 添加功能区图标
		this.addRibbonIcon('brain', '创建思维导图', async (evt: MouseEvent) => {
			await this.createNewMindmap();
		});

		// 添加命令
		this.addCommand({
			id: 'create-mindmap',
			name: '创建新的思维导图',
			callback: async () => {
				await this.createNewMindmap();
			}
		});

		// 添加命令：在当前文件中打开思维导图视图
		this.addCommand({
			id: 'open-mindmap-view',
			name: '在思维导图视图中打开当前文件',
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && activeFile.extension === 'md') {
					if (!checking) {
						this.openFileInMindmapView(activeFile);
					}
					return true;
				}
				return false;
			}
		});

		// 添加命令：切换MD和思维导图模式 (Ctrl+M)
		this.addCommand({
			id: 'toggle-mindmap-mode',
			name: '切换MD和思维导图模式',
			hotkeys: [{ modifiers: ['Ctrl'], key: 'm' }],
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && activeFile.extension === 'md') {
					if (!checking) {
						this.toggleMindmapMode();
					}
					return true;
				}
				return false;
			}
		});

		// 注册文件菜单项
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && file.extension === 'md') {
					menu.addItem((item) => {
						item
							.setTitle('在思维导图中打开')
							.setIcon('brain')
							.onClick(async () => {
								await this.openFileInMindmapView(file);
							});
					});
				}
			})
		);
	}

	onunload() {
		console.log('卸载思维导图插件');
	}

	async createNewMindmap() {
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const fileName = `思维导图-${timestamp}.md`;
		
		// 创建新的思维导图模板
		const template = `# 中心主题

## 主要分支1
- 子节点1-1
- 子节点1-2
	- 子子节点1-2-1

## 主要分支2
- 子节点2-1
- 子节点2-2

## 主要分支3
- 子节点3-1
`;

		try {
			const file = await this.app.vault.create(fileName, template);
			new Notice(`已创建思维导图: ${fileName}`);
			
			// 在思维导图视图中打开新文件
			await this.openFileInMindmapView(file);
		} catch (error) {
			new Notice('创建思维导图失败');
			console.error('Error creating mindmap:', error);
		}
	}

	async openFileInMindmapView(file: TFile) {
		const { workspace } = this.app;

		// 查找现有的思维导图视图
		const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_MINDMAP);
		let leaf: WorkspaceLeaf;

		if (existingLeaves.length > 0) {
			leaf = existingLeaves[0];
		} else {
			// 在主工作区创建新的思维导图视图
			leaf = workspace.getLeaf('tab');
		}

		await leaf.setViewState({ 
			type: VIEW_TYPE_MINDMAP, 
			active: true,
			state: { file: file.path }
		});

		// 显示视图
		workspace.revealLeaf(leaf);
	}

	async toggleMindmapMode() {
		console.log('toggleMindmapMode called');
		
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'md') {
			console.log('No active markdown file');
			new Notice('只能在Markdown文件中使用此功能');
			return;
		}

		console.log('Active file:', activeFile.path);
		const { workspace } = this.app;
		const activeLeaf = workspace.getActiveViewOfType(MindmapView);
		
		console.log('Current active leaf is MindmapView:', !!activeLeaf);
		console.log('Current workspace active leaf type:', workspace.activeLeaf?.view?.getViewType());
		
		if (activeLeaf) {
			// 当前是思维导图模式，切换到MD编辑器
			console.log('Switching from mindmap to markdown editor');
			const currentLeaf = workspace.activeLeaf;
			if (currentLeaf) {
				// 直接在当前叶子节点中打开文件，这将替换思维导图视图为Markdown编辑器
				await currentLeaf.openFile(activeFile);
				new Notice('已切换到Markdown编辑模式');
			}
		} else {
			// 当前是MD编辑器，切换到思维导图模式
			console.log('Switching from markdown editor to mindmap');
			const currentLeaf = workspace.activeLeaf;
			if (currentLeaf) {
				// 检查文件内容，如果为空则先添加基本结构
				const content = await this.app.vault.read(activeFile);
				console.log('File content length:', content.length);
				
				if (!content.trim()) {
					console.log('File is empty, will create default structure in mindmap view');
				}
				
				await currentLeaf.setViewState({ 
					type: VIEW_TYPE_MINDMAP, 
					active: true,
					state: { file: activeFile.path }
				});
				new Notice('已切换到思维导图模式');
				console.log('Switched to mindmap mode');
			}
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	updateGridDisplay() {
		// 通知所有打开的思维导图视图更新网格显示
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP);
		leaves.forEach(leaf => {
			const view = leaf.view as MindmapView;
			view.updateGridDisplay(this.settings.showGrid);
		});
	}
}
