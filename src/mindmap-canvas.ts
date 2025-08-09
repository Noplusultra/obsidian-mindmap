import { MindmapNodeData } from './markdown-parser';
import { MindmapView } from './mindmap-view';

export class MindmapCanvas {
	private container: HTMLElement;
	private canvasElement: HTMLDivElement;
	private view: MindmapView;
	private nodeElements: Map<string, HTMLElement> = new Map();
	private selectedNodeId: string | null = null;
	private isDragging = false;
	private dragOffset = { x: 0, y: 0 };
	private mindmapData: MindmapNodeData | null = null;
	private showGrid = true;

	constructor(container: HTMLElement, view: MindmapView) {
		this.container = container;
		this.view = view;
	}

	initialize(canvasContainer: HTMLElement) {
		// 创建画布元素
		this.canvasElement = canvasContainer.createDiv('mindmap-canvas');
		
		// 添加事件监听器
		this.setupEventListeners();
	}

	private setupEventListeners() {
		// 画布点击事件
		this.canvasElement.addEventListener('click', (e) => {
			if (e.target === this.canvasElement) {
				this.deselectAllNodes();
			}
		});

		// 鼠标移动事件（用于拖拽）
		this.canvasElement.addEventListener('mousemove', (e) => {
			if (this.isDragging && this.selectedNodeId && this.mindmapData) {
				const node = this.findNodeById(this.mindmapData, this.selectedNodeId);
				if (node) {
					const rect = this.canvasElement.getBoundingClientRect();
					const x = e.clientX - rect.left - this.dragOffset.x;
					const y = e.clientY - rect.top - this.dragOffset.y;
					node.x = x;
					node.y = y;
					this.updateNodePosition(node);
					this.updateConnections();
				}
			}
		});

		// 鼠标释放事件
		this.canvasElement.addEventListener('mouseup', () => {
			this.isDragging = false;
		});
	}

	renderMindmap(data: MindmapNodeData) {
		this.mindmapData = data;
		this.clear();
		this.renderNode(data);
		this.updateConnections();
	}

	private clear() {
		this.canvasElement.empty();
		this.nodeElements.clear();
		this.selectedNodeId = null;
	}

	private renderNode(node: MindmapNodeData) {
		if (node.id === 'root') {
			// 跳过根节点，直接渲染子节点
			node.children.forEach(child => this.renderNode(child));
			return;
		}

		const nodeElement = this.canvasElement.createDiv('mindmap-node');
		nodeElement.style.left = (node.x || 0) + 'px';
		nodeElement.style.top = (node.y || 0) + 'px';
		
		// 根据节点类型添加样式
		if (node.type === 'header') {
			nodeElement.addClass(`header-level-${node.level}`);
			if (node.level === 1) {
				nodeElement.addClass('root-node');
			}
		} else {
			nodeElement.addClass('list-node');
		}

		// 创建节点文本容器
		const nodeText = nodeElement.createDiv('node-text');
		this.renderNodeText(nodeText, node);

		// 存储节点元素引用
		this.nodeElements.set(node.id, nodeElement);

		// 添加事件监听器
		this.setupNodeEventListeners(nodeElement, node);

		// 递归渲染子节点
		node.children.forEach(child => this.renderNode(child));
	}

	private renderNodeText(textElement: HTMLElement, node: MindmapNodeData) {
		textElement.empty();
		
		if (node.hasWikilink && node.wikilinks.length > 0) {
			// 处理包含双链的文本
			let text = node.text;
			node.wikilinks.forEach(wikilink => {
				const linkRegex = new RegExp(`\\[\\[${wikilink}\\]\\]`, 'g');
				text = text.replace(linkRegex, `<span class="wikilink" data-link="${wikilink}">[[${wikilink}]]</span>`);
			});
			textElement.innerHTML = text;
			
			// 为双链添加点击事件
			textElement.querySelectorAll('.wikilink').forEach(link => {
				link.addEventListener('click', (e) => {
					e.stopPropagation();
					const linkText = link.getAttribute('data-link');
					if (linkText) {
						this.view.onWikilinkClick(linkText);
					}
				});
			});
		} else {
			textElement.textContent = node.text;
		}
	}

	private setupNodeEventListeners(element: HTMLElement, node: MindmapNodeData) {
		// 点击选择节点
		element.addEventListener('click', (e) => {
			e.stopPropagation();
			this.selectNode(node.id);
		});

		// 双击编辑节点
		element.addEventListener('dblclick', (e) => {
			e.stopPropagation();
			this.startEditing(node);
		});

		// 鼠标按下开始拖拽
		element.addEventListener('mousedown', (e) => {
			e.preventDefault();
			this.selectNode(node.id);
			this.isDragging = true;
			
			const rect = this.canvasElement.getBoundingClientRect();
			this.dragOffset.x = e.clientX - rect.left - (node.x || 0);
			this.dragOffset.y = e.clientY - rect.top - (node.y || 0);
		});
	}

	startNodeEditing(node: MindmapNodeData) {
		this.startEditing(node);
	}

	private startEditing(node: MindmapNodeData) {
		const element = this.nodeElements.get(node.id);
		if (!element) return;

		const textElement = element.querySelector('.node-text') as HTMLElement;
		if (!textElement) return;

		const currentText = node.text;
		
		// 创建输入框
		const input = document.createElement('input');
		input.type = 'text';
		input.value = currentText;
		input.className = 'node-input';
		input.style.width = 'calc(100% + 20px)';
		input.style.marginLeft = '-10px';
		input.style.textAlign = 'center';
		input.style.fontSize = 'inherit';
		input.style.fontFamily = 'inherit';

		// 替换文本元素
		textElement.style.display = 'none';
		element.appendChild(input);
		
		// 选中输入框内容
		input.focus();
		input.select();

		// 完成编辑的函数
		const finishEditing = () => {
			const newText = input.value.trim() || '新节点';
			node.text = newText;
			
			// 恢复文本显示
			this.renderNodeText(textElement, node);
			textElement.style.display = '';
			input.remove();
			
			// 通知视图节点已编辑
			this.view.onNodeEdit(node, newText);
		};

		// 监听事件
		input.addEventListener('blur', finishEditing);
		input.addEventListener('keydown', (e) => {
			e.stopPropagation(); // 防止事件冒泡到视图层
			if (e.key === 'Enter') {
				e.preventDefault();
				finishEditing();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				// 取消编辑，恢复原文本
				textElement.style.display = '';
				input.remove();
			}
		});
	}

	selectNode(nodeId: string) {
		this.deselectAllNodes();
		this.selectedNodeId = nodeId;
		const element = this.nodeElements.get(nodeId);
		if (element) {
			element.addClass('selected');
		}
	}

	deselectAllNodes() {
		this.nodeElements.forEach(element => {
			element.removeClass('selected');
		});
		this.selectedNodeId = null;
	}

	getSelectedNode(): MindmapNodeData | null {
		if (!this.selectedNodeId || !this.mindmapData) return null;
		return this.findNodeById(this.mindmapData, this.selectedNodeId);
	}

	private findNodeById(root: MindmapNodeData, id: string): MindmapNodeData | null {
		if (root.id === id) return root;
		
		for (const child of root.children) {
			const found = this.findNodeById(child, id);
			if (found) return found;
		}
		
		return null;
	}

	private updateNodePosition(node: MindmapNodeData) {
		const element = this.nodeElements.get(node.id);
		if (element && node.x !== undefined && node.y !== undefined) {
			element.style.left = node.x + 'px';
			element.style.top = node.y + 'px';
		}
	}

	private updateConnections() {
		if (!this.mindmapData) return;
		
		// 移除所有现有的连接线
		this.canvasElement.querySelectorAll('.connection-line').forEach(line => {
			line.remove();
		});

		// 重新绘制所有连接线
		this.drawConnections(this.mindmapData);
	}

	private drawConnections(node: MindmapNodeData) {
		node.children.forEach(child => {
			if (node.id !== 'root') { // 不为根节点绘制连接线
				this.drawConnection(node, child);
			}
			this.drawConnections(child); // 递归绘制子节点的连接线
		});
	}

	private drawConnection(parentNode: MindmapNodeData, childNode: MindmapNodeData) {
		if (parentNode.x === undefined || parentNode.y === undefined || 
			childNode.x === undefined || childNode.y === undefined) {
			return;
		}

		const line = this.canvasElement.createDiv('connection-line');
		
		const parentCenterX = parentNode.x + 50; // 节点宽度的一半
		const parentCenterY = parentNode.y + 25; // 节点高度的一半
		const childCenterX = childNode.x + 50;
		const childCenterY = childNode.y + 25;

		const deltaX = childCenterX - parentCenterX;
		const deltaY = childCenterY - parentCenterY;
		const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
		const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);

		line.style.width = length + 'px';
		line.style.left = parentCenterX + 'px';
		line.style.top = parentCenterY + 'px';
		line.style.transform = `rotate(${angle}deg)`;
		line.style.transformOrigin = '0 50%';
	}

	setGridVisible(visible: boolean) {
		this.showGrid = visible;
		if (this.canvasElement) {
			if (visible) {
				this.canvasElement.addClass('show-grid');
			} else {
				this.canvasElement.removeClass('show-grid');
			}
		}
	}

	destroy() {
		// 清理事件监听器和DOM元素
		this.nodeElements.clear();
		this.selectedNodeId = null;
		this.mindmapData = null;
		if (this.canvasElement) {
			this.canvasElement.empty();
		}
	}
}
