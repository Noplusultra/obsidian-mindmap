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
			
			// 如果解析结果为空或者没有有效的内容，创建默认的思维导图结构
			if (!this.mindmapData || this.mindmapData.children.length === 0 || content.trim() === '') {
				// 获取文件名作为根节点名称（不包含扩展名）
				const fileName = file.basename;
				
				// 创建只有一个根节点的默认思维导图结构
				const root: MindmapNodeData = {
					id: 'root',
					text: '根节点',
					level: 0,
					type: 'header',
					children: [{
						id: 'node-center',
						text: fileName,
						level: 1,
						type: 'header',
						children: [],
						lineNumber: -1,
						originalText: '',
						hasWikilink: false,
						wikilinks: [],
						color: 'blue'
					}],
					lineNumber: -1,
					originalText: '',
					hasWikilink: false,
					wikilinks: []
				};
				
				// 设置父子关系
				root.children[0].parent = root;
				this.mindmapData = root;
				
				// 如果原文件是空的，保存默认结构到文件
				if (content.trim() === '') {
					try {
						const markdown = MarkdownParser.generateMarkdown(this.mindmapData);
						await this.app.vault.modify(file, markdown);
						new Notice(`已为空白文档创建根节点: ${fileName}`);
					} catch (error) {
						console.error('Failed to save default structure:', error);
					}
				}
			}
			
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

		// 保存文件按钮
		const saveBtn = toolbar.createEl('button', {
			text: '保存文件',
			cls: 'mindmap-btn mindmap-btn-primary'
		});
		saveBtn.addEventListener('click', async () => {
			try {
				await this.saveToFile();
			} catch (error) {
				console.error('Save failed:', error);
			}
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
		
		// 渲染思维导图（现在总是有数据）
		if (this.mindmapData) {
			this.mindmapCanvas.renderMindmap(this.mindmapData);
			// 自动选中中心节点
			const centerNode = this.findCenterNode(this.mindmapData);
			if (centerNode) {
				console.log('Auto-selecting center node:', centerNode.id);
				setTimeout(() => {
					this.mindmapCanvas.selectNode(centerNode.id);
				}, 100);
			}
		} else {
			// 如果仍然没有数据，显示空画布提示
			const emptyMessage = container.createDiv('mindmap-empty-message');
			emptyMessage.textContent = '无法解析文档内容，请检查文档格式';
			emptyMessage.style.textAlign = 'center';
			emptyMessage.style.marginTop = '50px';
			emptyMessage.style.color = 'var(--text-muted)';
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

		// 自动保存
		if (this.plugin.settings.autoSave) {
			this.autoSaveDebounced();
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
			throw error; // 重新抛出错误以便调用者处理
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
		try {
			await this.saveToFile();
		} catch (error) {
			console.error('Auto save failed:', error);
			// 在自动保存失败时，显示一个不太突出的提示
			new Notice('自动保存失败，请手动保存', 3000);
		}
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
		console.log('Setting up keyboard listeners for MindmapView');
		
		// 主要的键盘事件处理器
		const globalKeyHandler = (e: KeyboardEvent) => {
			// 检查当前视图是否是思维导图视图
			const currentView = this.app.workspace.getActiveViewOfType(MindmapView);
			if (currentView !== this) {
				return; // 不是当前视图，忽略
			}
			
			console.log('Global key handler - Key:', e.key, 'Target:', e.target);
			this.handleKeyDown(e);
		};
		
		// 在全局添加键盘监听
		document.addEventListener('keydown', globalKeyHandler, true); // 使用 capture 阶段
		
		// 清理函数
		this.register(() => {
			document.removeEventListener('keydown', globalKeyHandler, true);
		});
		
		// 确保视图容器可以获得焦点
		this.containerEl.setAttribute('tabindex', '-1');
		this.containerEl.style.outline = 'none';
		
		// 点击时确保获得焦点
		this.containerEl.addEventListener('mousedown', () => {
			console.log('MindmapView container clicked, focusing...');
			setTimeout(() => this.containerEl.focus(), 10);
		});
		
		// 监听视图激活事件
		this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
			if (leaf?.view === this) {
				console.log('MindmapView became active');
				setTimeout(() => this.containerEl.focus(), 50);
			}
		}));
	}

	private handleKeyDown(e: KeyboardEvent) {
		console.log('handleKeyDown called - Key:', e.key, 'Target:', (e.target as HTMLElement)?.tagName, 'Ctrl:', e.ctrlKey, 'Alt:', e.altKey);
		
		// 忽略单独的修饰键
		if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
			return;
		}
		
		// 如果当前在输入框中或者在编辑状态，不处理快捷键
		const target = e.target as HTMLElement;
		if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) {
			console.log('Key ignored - editing mode');
			return;
		}
		
		const selectedNode = this.mindmapCanvas.getSelectedNode();
		const settings = this.plugin.settings;
		
		console.log('Selected node:', selectedNode?.id);
		
		// Ctrl+M - 切换模式（但不在这里处理，让它冒泡到全局处理器）
		if (e.ctrlKey && e.key === 'm') {
			console.log('Ctrl+M detected, letting it bubble to global handler');
			// 不阻止事件，让它传递给Obsidian的命令系统
			return;
		}
		
		// Tab键 - 添加子节点
		if (e.key === 'Tab') {
			console.log('Tab key pressed');
			if (selectedNode && !this.isEditing()) {
				e.preventDefault();
				e.stopPropagation();
				console.log('Adding child to node:', selectedNode.id);
				this.addChildToSelectedNode();
				return;
			} else {
				console.log('Tab ignored - no selected node or editing');
			}
		}
		
		// Backspace/Delete键 - 删除节点
		if (e.key === 'Backspace' || e.key === 'Delete') {
			console.log('Delete/Backspace key pressed');
			if (selectedNode && !this.isEditing()) {
				e.preventDefault();
				e.stopPropagation();
				console.log('Deleting node:', selectedNode.id);
				this.deleteSelectedNode();
				return;
			} else {
				console.log('Delete ignored - no selected node or editing');
			}
		}
		
		// i键 - 编辑节点
		if (e.key === 'i') {
			console.log('i key pressed');
			if (selectedNode && !this.isEditing()) {
				e.preventDefault();
				e.stopPropagation();
				console.log('Starting edit for node:', selectedNode.id);
				this.startEditingSelectedNode();
				return;
			}
		}
		
		// Enter键 - 编辑节点
		if (e.key === 'Enter') {
			console.log('Enter key pressed');
			if (selectedNode && !this.isEditing()) {
				e.preventDefault();
				e.stopPropagation();
				console.log('Starting edit for node:', selectedNode.id);
				this.startEditingSelectedNode();
				return;
			}
		}

		// Ctrl+Z - 撤销
		if (e.ctrlKey && e.key === 'z') {
			console.log('Ctrl+Z pressed');
			if (!this.isEditing()) {
				e.preventDefault();
				e.stopPropagation();
				this.undo();
				return;
			}
		}
		
		// 方向键导航
		if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
			console.log('Arrow key pressed:', e.key);
			if (!this.isEditing()) {
				e.preventDefault();
				e.stopPropagation();
				const direction = e.key.replace('Arrow', '').toLowerCase() as 'up' | 'down' | 'left' | 'right';
				this.navigateNode(direction);
				return;
			}
		}
		
		// Escape键 - 取消
		if (e.key === 'Escape') {
			console.log('Escape key pressed');
			if (this.isEditing()) {
				e.preventDefault();
				this.cancelEditing();
			} else {
				this.mindmapCanvas.deselectAllNodes();
			}
			return;
		}
		
		console.log('Key not handled:', e.key);
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
			new Notice('请先选择一个父节点');
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
		
		// 自动保存
		if (this.plugin.settings.autoSave) {
			this.autoSaveDebounced();
		}
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
		
		const allNodes = this.getAllNodes(this.mindmapData);
		let bestNode: MindmapNodeData | null = null;
		let bestScore = Infinity;
		const threshold = 30; // 方向判断的阈值
		
		for (const node of allNodes) {
			if (node.id === currentNode.id || !node.x || !node.y) continue;
			
			const dx = node.x - currentNode.x;
			const dy = node.y - currentNode.y;
			const distance = Math.sqrt(dx * dx + dy * dy);
			
			let isValidDirection = false;
			let score = distance;
			
			switch (direction) {
				case 'up':
					// 向上：y坐标必须更小
					if (dy < -threshold) {
						isValidDirection = true;
						// 优先选择最接近垂直上方的节点
						const angle = Math.abs(Math.atan2(Math.abs(dx), Math.abs(dy)) * 180 / Math.PI);
						score = distance + (angle * 2); // 角度偏差越大，分数越高
					}
					break;
				case 'down':
					// 向下：y坐标必须更大
					if (dy > threshold) {
						isValidDirection = true;
						const angle = Math.abs(Math.atan2(Math.abs(dx), Math.abs(dy)) * 180 / Math.PI);
						score = distance + (angle * 2);
					}
					break;
				case 'left':
					// 向左：x坐标必须更小
					if (dx < -threshold) {
						isValidDirection = true;
						// 优先选择最接近水平左侧的节点
						const angle = Math.abs(Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI);
						score = distance + (angle * 2);
					}
					break;
				case 'right':
					// 向右：x坐标必须更大
					if (dx > threshold) {
						isValidDirection = true;
						const angle = Math.abs(Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI);
						score = distance + (angle * 2);
					}
					break;
			}
			
			if (isValidDirection) {
				// 根据结构关系调整优先级
				const isChild = currentNode.children.includes(node);
				const isParent = node.children.includes(currentNode);
				const isSibling = currentNode.parent && node.parent && 
								  currentNode.parent.id === node.parent.id;
				
				// 优先级调整
				if (isChild || isParent) {
					score *= 0.6; // 父子关系优先
				} else if (isSibling) {
					score *= 0.8; // 兄弟关系次优先
				}
				
				// 对于水平方向，同一层级的节点优先
				if ((direction === 'left' || direction === 'right')) {
					const levelDiff = Math.abs(currentNode.level - node.level);
					score += levelDiff * 10;
				}
				
				if (score < bestScore) {
					bestScore = score;
					bestNode = node;
				}
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
		
		// 创建一个不包含循环引用的深拷贝
		const createCleanCopy = (node: MindmapNodeData): any => {
			const clean: any = {
				id: node.id,
				text: node.text,
				level: node.level,
				type: node.type,
				lineNumber: node.lineNumber,
				originalText: node.originalText,
				hasWikilink: node.hasWikilink,
				wikilinks: [...(node.wikilinks || [])],
				color: node.color,
				collapsed: node.collapsed,
				x: node.x,
				y: node.y,
				children: []
			};
			
			// 递归处理子节点，但不包含parent引用
			if (node.children) {
				clean.children = node.children.map(child => createCleanCopy(child));
			}
			
			return clean;
		};
		
		// 创建干净的状态拷贝
		const cleanState = createCleanCopy(this.mindmapData);
		
		// 移除历史记录中当前索引之后的所有记录
		this.history = this.history.slice(0, this.historyIndex + 1);
		
		// 添加新状态
		this.history.push(cleanState);
		this.historyIndex++;
		
		// 限制历史记录数量
		if (this.history.length > 20) {
			this.history.shift();
			this.historyIndex--;
		}
		
		console.log('Saved to history, index:', this.historyIndex, 'length:', this.history.length);
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
