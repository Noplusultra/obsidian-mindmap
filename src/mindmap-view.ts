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

		// 保存按钮
		const saveBtn = toolbar.createEl('button', {
			text: '保存到文件',
			cls: 'mindmap-btn'
		});
		saveBtn.addEventListener('click', () => {
			this.saveToFile();
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

		// 从父节点中移除
		const parent = selectedNode.parent;
		const index = parent.children.indexOf(selectedNode);
		if (index > -1) {
			parent.children.splice(index, 1);
		}

		MarkdownParser.calculateNodePositions(this.mindmapData);
		this.mindmapCanvas.renderMindmap(this.mindmapData);
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

	// 处理节点编辑
	async onNodeEdit(node: MindmapNodeData, newText: string) {
		node.text = newText;
		// 可以在这里添加实时保存功能
	}

	// 处理双链点击
	async onWikilinkClick(wikilink: string) {
		// 使用Obsidian的链接处理功能
		await this.app.workspace.openLinkText(wikilink, this.currentFile?.path || '');
	}

	private setupKeyboardListeners() {
		// 添加键盘事件监听器
		this.containerEl.addEventListener('keydown', (e) => {
			this.handleKeyDown(e);
		});
		
		// 确保容器可以接收焦点
		this.containerEl.setAttribute('tabindex', '-1');
		this.containerEl.focus();
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
		if (e.key === settings.addChildKey && selectedNode && !this.isEditing()) {
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

	async onClose() {
		// 清理资源
		this.mindmapCanvas.destroy();
	}
}
