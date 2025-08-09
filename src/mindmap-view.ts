import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import { MindmapCanvas } from './mindmap-canvas';
import { MarkdownParser, MindmapNodeData } from './markdown-parser';
import MindmapPlugin from '../main';

export const VIEW_TYPE_MINDMAP = 'mindmap-view';

export class MindmapView extends ItemView {
	private mindmapCanvas: MindmapCanvas;
	private plugin: MindmapPlugin;
	private currentFile: TFile | null = null;
	private mindmapData: MindmapNodeData | null = null;
	private history: MindmapNodeData[] = [];
	private historyIndex = -1;

	constructor(leaf: WorkspaceLeaf, plugin: MindmapPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.mindmapCanvas = new MindmapCanvas(this.containerEl, this);
	}

	getViewType() {
		return VIEW_TYPE_MINDMAP;
	}

	getDisplayText() {
		if (this.currentFile) {
			return `思维导图: ${this.currentFile.basename}`;
		}
		return '思维导图';
	}

	getIcon() {
		return 'brain';
	}

	async setState(state: any, result: any) {
		if (state && state.file) {
			const file = this.app.vault.getAbstractFileByPath(state.file);
			if (file instanceof TFile) {
				await this.loadFile(file);
			}
		}
		return super.setState(state, result);
	}

	getState() {
		return {
			file: this.currentFile?.path
		};
	}

	async loadFile(file: TFile) {
		if (this.currentFile === file) return;
		
		this.currentFile = file;
		
		try {
			const content = await this.app.vault.read(file);
			this.mindmapData = MarkdownParser.parseMarkdown(content);
			MarkdownParser.calculateNodePositions(this.mindmapData);
			
			// 刷新显示
			await this.refresh();
			
		} catch (error) {
			new Notice('无法读取文件内容');
			console.error('Error loading file:', error);
		}
	}

	async refresh() {
		const container = this.containerEl.children[1];
		container.empty();
		await this.renderView();
	}

	async onOpen() {
		await this.renderView();
		this.setupKeyboardListeners();
	}

	private async renderView() {
		const container = this.containerEl.children[1];
		container.empty();
		
		// 创建思维导图容器
		const mindmapContainer = container.createDiv('mindmap-container');
		
		// 创建工具栏
		const toolbar = mindmapContainer.createDiv('mindmap-toolbar');
		
		// 文件信息显示
		if (this.currentFile) {
			const fileInfo = toolbar.createDiv('file-info');
			fileInfo.textContent = `当前文件: ${this.currentFile.basename}`;
		}

		// 添加节点按钮
		const addNodeBtn = toolbar.createEl('button', {
			text: '添加节点',
			cls: 'mindmap-btn'
		});
		addNodeBtn.addEventListener('click', () => {
			this.addNode();
		});

		// 删除节点按钮
		const deleteNodeBtn = toolbar.createEl('button', {
			text: '删除节点',
			cls: 'mindmap-btn'
		});
		deleteNodeBtn.addEventListener('click', () => {
			this.deleteSelectedNode();
		});

		// 设置按钮
		const settingsBtn = toolbar.createEl('button', {
			text: '设置',
			cls: 'mindmap-btn'
		});
		settingsBtn.addEventListener('click', () => {
			this.openSettings();
		});

		// 重置视图按钮
		const resetBtn = toolbar.createEl('button', {
			text: '重置视图',
			cls: 'mindmap-btn'
		});
		resetBtn.addEventListener('click', () => {
			this.resetView();
		});

		// 在Markdown编辑器中打开
		const openInEditorBtn = toolbar.createEl('button', {
			text: '在编辑器中打开',
			cls: 'mindmap-btn'
		});
		openInEditorBtn.addEventListener('click', () => {
			this.openInEditor();
		});

		// 创建画布容器
		const canvasContainer = mindmapContainer.createDiv('mindmap-canvas-container');
		
		// 初始化画布
		this.mindmapCanvas.initialize(canvasContainer);
		
		// 设置网格显示状态
		this.mindmapCanvas.setGridVisible(this.plugin.settings.showGrid);
		
		// 如果有数据，渲染思维导图
		if (this.mindmapData) {
			this.mindmapCanvas.renderMindmap(this.mindmapData);
			// 自动选中中心节点
			const centerNode = this.findCenterNode(this.mindmapData);
			if (centerNode) {
				this.mindmapCanvas.selectNode(centerNode.id);
			}
		}
	}

	addNode() {
		if (!this.currentFile || !this.mindmapData) {
			new Notice('请先加载一个文件');
			return;
		}
		
		const selectedNode = this.mindmapCanvas.getSelectedNode();
		if (!selectedNode) {
			new Notice('请先选择一个父节点');
			return;
		}

		// 创建新节点
		const newNode: MindmapNodeData = {
			id: `node-${Date.now()}`,
			text: '新节点',
			level: selectedNode.level + 1,
			type: selectedNode.type === 'header' && selectedNode.level < 6 ? 'header' : 'list',
			children: [],
			parent: selectedNode,
			lineNumber: -1,
			originalText: '',
			hasWikilink: false,
			wikilinks: []
		};

		selectedNode.children.push(newNode);
		MarkdownParser.calculateNodePositions(this.mindmapData);
		this.mindmapCanvas.renderMindmap(this.mindmapData);
	}

	deleteSelectedNode() {
		if (!this.currentFile || !this.mindmapData) {
			new Notice('请先加载一个文件');
			return;
		}

		const selectedNode = this.mindmapCanvas.getSelectedNode();
		if (!selectedNode || !selectedNode.parent) {
			new Notice('无法删除根节点或未选择节点');
			return;
		}

		// 保存历史记录
		this.saveToHistory();

		// 记住父节点，稍后选中它
		const parentNode = selectedNode.parent;

		// 从父节点中移除
		const index = parentNode.children.indexOf(selectedNode);
		if (index > -1) {
			parentNode.children.splice(index, 1);
		}

		// 重新计算位置并渲染
		MarkdownParser.calculateNodePositions(this.mindmapData);
		this.mindmapCanvas.renderMindmap(this.mindmapData);

		// 选中父节点（如果父节点不是根节点）
		if (parentNode.id !== 'root') {
			this.mindmapCanvas.selectNode(parentNode.id);
		} else {
			// 如果父节点是根节点，选中中心节点
			const centerNode = this.findCenterNode(this.mindmapData);
			if (centerNode) {
				this.mindmapCanvas.selectNode(centerNode.id);
			}
		}
	}

	async saveToFile() {
		if (!this.currentFile || !this.mindmapData) {
			new Notice('没有可保存的内容');
			return;
		}

		try {
			const markdown = MarkdownParser.generateMarkdown(this.mindmapData);
			await this.app.vault.modify(this.currentFile, markdown);
			new Notice('已保存到文件');
		} catch (error) {
			new Notice('保存失败');
			console.error('Error saving file:', error);
		}
	}

	resetView() {
		if (this.mindmapData) {
			MarkdownParser.calculateNodePositions(this.mindmapData);
			this.mindmapCanvas.renderMindmap(this.mindmapData);
		}
	}

	async openInEditor() {
		if (this.currentFile) {
			await this.app.workspace.openLinkText(this.currentFile.path, '');
		}
	}

	openSettings() {
		// 打开插件设置
		(this.app as any).setting.open();
		(this.app as any).setting.openTabById(this.plugin.manifest.id);
	}

	// 处理节点编辑
	async onNodeEdit(node: MindmapNodeData, newText: string) {
		node.text = newText;
		
		// 自动保存功能
		if (this.plugin.settings.autoSave) {
			this.autoSaveDebounced();
		}
	}

	private autoSaveDebounced = this.debounce(async () => {
		await this.saveToFile();
	}, 1000);

	private debounce(func: Function, wait: number) {
		let timeout: NodeJS.Timeout;
		return function executedFunction(...args: any[]) {
			const later = () => {
				clearTimeout(timeout);
				func(...args);
			};
			clearTimeout(timeout);
			timeout = setTimeout(later, wait);
		};
	}

	// 处理双链点击
	async onWikilinkClick(wikilink: string) {
		try {
			// 使用Obsidian的链接处理功能，在当前标签页打开
			const { workspace } = this.app;
			
			// 清理链接文本，移除可能的别名
			const cleanLink = wikilink.split('|')[0].trim();
			
			// 在当前叶子节点中打开链接
			const file = this.app.metadataCache.getFirstLinkpathDest(cleanLink, this.currentFile?.path || '');
			if (file) {
				await this.leaf.openFile(file);
			} else {
				// 如果文件不存在，使用workspace的方法创建并打开
				const newFile = await this.app.vault.create(cleanLink + '.md', '');
				await this.leaf.openFile(newFile);
			}
		} catch (error) {
			console.error('Error opening wikilink:', error);
			new Notice(`无法打开链接: ${wikilink}`);
		}
	}

	private setupKeyboardListeners() {
		// 添加键盘事件监听器到画布容器
		const canvasContainer = this.containerEl.querySelector('.mindmap-canvas-container');
		if (canvasContainer) {
			canvasContainer.addEventListener('keydown', (e: KeyboardEvent) => {
				this.handleKeyDown(e);
			});
			(canvasContainer as HTMLElement).setAttribute('tabindex', '-1');
			(canvasContainer as HTMLElement).focus();
		}
		
		// 也在主容器上添加
		this.containerEl.addEventListener('keydown', (e: KeyboardEvent) => {
			this.handleKeyDown(e);
		});
		this.containerEl.setAttribute('tabindex', '-1');
	}

	private handleKeyDown(e: KeyboardEvent) {
		const selectedNode = this.mindmapCanvas.getSelectedNode();
		const settings = this.plugin.settings;
		
		// 检查删除快捷键
		if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNode && !this.isEditing()) {
			e.preventDefault();
			this.deleteSelectedNode();
			return;
		}
		
		// 检查添加子节点快捷键
		if (e.key === 'Tab' && selectedNode && !this.isEditing()) {
			e.preventDefault();
			this.addChildToSelectedNode();
			return;
		}
		
		// 检查i键编辑快捷键
		if (e.key === 'i' && selectedNode && !this.isEditing()) {
			e.preventDefault();
			this.startEditingSelectedNode();
			return;
		}

		// 检查Ctrl+Z撤销
		if (e.ctrlKey && e.key === 'z' && !this.isEditing()) {
			e.preventDefault();
			this.undo();
			return;
		}
		
		// 检查编辑快捷键
		if (e.key === settings.editKey && selectedNode && !this.isEditing()) {
			e.preventDefault();
			this.startEditingSelectedNode();
			return;
		}
		
		// 方向键导航
		if (!this.isEditing()) {
			switch (e.key) {
				case 'ArrowUp':
					e.preventDefault();
					this.navigateNode('up');
					return;
				case 'ArrowDown':
					e.preventDefault();
					this.navigateNode('down');
					return;
				case 'ArrowLeft':
					e.preventDefault();
					this.navigateNode('left');
					return;
				case 'ArrowRight':
					e.preventDefault();
					this.navigateNode('right');
					return;
			}
		}
		
		// 检查取消快捷键
		if (e.key === settings.cancelKey) {
			if (this.isEditing()) {
				e.preventDefault();
				this.cancelEditing();
			} else {
				this.mindmapCanvas.deselectAllNodes();
			}
			return;
		}
	}

	private isEditing(): boolean {
		// 检查是否有节点正在编辑状态
		return this.containerEl.querySelector('.node-input') !== null;
	}

	private startEditingSelectedNode() {
		const selectedNode = this.mindmapCanvas.getSelectedNode();
		if (selectedNode) {
			this.mindmapCanvas.startNodeEditing(selectedNode);
		}
	}

	private addChildToSelectedNode() {
		const selectedNode = this.mindmapCanvas.getSelectedNode();
		if (!selectedNode || !this.mindmapData) {
			return;
		}

		// 保存历史记录
		this.saveToHistory();

		// 创建新节点
		const newNode: MindmapNodeData = {
			id: `node-${Date.now()}`,
			text: '新节点',
			level: selectedNode.level + 1,
			type: selectedNode.type === 'header' && selectedNode.level < 6 ? 'header' : 'list',
			children: [],
			parent: selectedNode,
			lineNumber: -1,
			originalText: '',
			hasWikilink: false,
			wikilinks: []
		};

		selectedNode.children.push(newNode);
		MarkdownParser.calculateNodePositions(this.mindmapData);
		this.mindmapCanvas.renderMindmap(this.mindmapData);
		
		// 选中新创建的节点
		this.mindmapCanvas.selectNode(newNode.id);
	}

	private navigateNode(direction: 'up' | 'down' | 'left' | 'right') {
		if (!this.mindmapData) return;
		
		const currentNode = this.mindmapCanvas.getSelectedNode();
		if (!currentNode) {
			// 如果没有选中节点，选中中心节点
			const centerNode = this.findCenterNode(this.mindmapData);
			if (centerNode) {
				this.mindmapCanvas.selectNode(centerNode.id);
			}
			return;
		}
		
		const targetNode = this.findNodeInDirection(currentNode, direction);
		if (targetNode) {
			this.mindmapCanvas.selectNode(targetNode.id);
		}
	}

	private findCenterNode(root: MindmapNodeData): MindmapNodeData | null {
		// 返回第一个子节点作为中心节点
		return root.children.length > 0 ? root.children[0] : null;
	}

	private findNodeInDirection(currentNode: MindmapNodeData, direction: 'up' | 'down' | 'left' | 'right'): MindmapNodeData | null {
		if (!this.mindmapData || !currentNode.x || !currentNode.y) return null;
		
		// 对于右和下方向，优先考虑子节点
		if ((direction === 'right' || direction === 'down') && currentNode.children.length > 0) {
			// 找到未折叠的第一个子节点
			const visibleChildren = currentNode.children.filter(child => !currentNode.collapsed);
			if (visibleChildren.length > 0) {
				return visibleChildren[0];
			}
		}
		
		// 对于左和上方向，优先考虑父节点
		if ((direction === 'left' || direction === 'up') && currentNode.parent && currentNode.parent.id !== 'root') {
			return currentNode.parent;
		}
		
		// 如果没有直接的父子关系，使用原来的算法
		const allNodes = this.getAllNodes(this.mindmapData);
		let bestNode: MindmapNodeData | null = null;
		let bestDistance = Infinity;
		
		for (const node of allNodes) {
			if (node.id === currentNode.id || !node.x || !node.y) continue;
			
			const dx = node.x - currentNode.x;
			const dy = node.y - currentNode.y;
			const distance = Math.sqrt(dx * dx + dy * dy);
			
			// 根据方向筛选节点
			let isInDirection = false;
			switch (direction) {
				case 'up':
					isInDirection = dy < -50 && Math.abs(dx) < Math.abs(dy) * 2;
					break;
				case 'down':
					isInDirection = dy > 50 && Math.abs(dx) < Math.abs(dy) * 2;
					break;
				case 'left':
					isInDirection = dx < -50 && Math.abs(dy) < Math.abs(dx) * 2;
					break;
				case 'right':
					isInDirection = dx > 50 && Math.abs(dy) < Math.abs(dx) * 2;
					break;
			}
			
			if (isInDirection && distance < bestDistance) {
				bestDistance = distance;
				bestNode = node;
			}
		}
		
		return bestNode;
	}

	private getAllNodes(root: MindmapNodeData): MindmapNodeData[] {
		const nodes: MindmapNodeData[] = [];
		
		function traverse(node: MindmapNodeData) {
			if (node.id !== 'root') {
				nodes.push(node);
			}
			node.children.forEach(child => traverse(child));
		}
		
		traverse(root);
		return nodes;
	}

	private cancelEditing() {
		const input = this.containerEl.querySelector('.node-input') as HTMLInputElement;
		if (input) {
			// 触发取消编辑
			const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
			input.dispatchEvent(escEvent);
		}
	}

	updateGridDisplay(showGrid: boolean) {
		if (this.mindmapCanvas) {
			this.mindmapCanvas.setGridVisible(showGrid);
		}
	}

	recalculateAndRender() {
		if (this.mindmapData) {
			MarkdownParser.calculateNodePositions(this.mindmapData);
			this.mindmapCanvas.renderMindmap(this.mindmapData);
		}
	}

	private saveToHistory() {
		if (!this.mindmapData) return;
		
		// 深拷贝当前状态
		const state = JSON.parse(JSON.stringify(this.mindmapData));
		
		// 移除历史记录中当前索引之后的所有记录
		this.history = this.history.slice(0, this.historyIndex + 1);
		
		// 添加新状态
		this.history.push(state);
		this.historyIndex++;
		
		// 限制历史记录数量
		if (this.history.length > 20) {
			this.history.shift();
			this.historyIndex--;
		}
	}

	private undo() {
		if (this.historyIndex > 0) {
			this.historyIndex--;
			const previousState = this.history[this.historyIndex];
			
			// 恢复节点的父子关系
			this.restoreNodeReferences(previousState);
			this.mindmapData = previousState;
			
			this.recalculateAndRender();
			new Notice('已撤销上一步操作');
		} else {
			new Notice('没有可撤销的操作');
		}
	}

	private restoreNodeReferences(node: MindmapNodeData) {
		// 重建父子关系引用
		node.children.forEach(child => {
			child.parent = node;
			this.restoreNodeReferences(child);
		});
	}

	async onClose() {
		// 清理资源
		this.mindmapCanvas.destroy();
	}
}
