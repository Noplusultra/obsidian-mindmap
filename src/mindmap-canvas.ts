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
	private isDraggingCanvas = false;
	private canvasOffset = { x: 0, y: 0 };
	private lastCanvasPos = { x: 0, y: 0 };
	private dragStartTime = 0;
	private dragOverNode: MindmapNodeData | null = null;
	private dragOverTimeout: NodeJS.Timeout | null = null;

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

		// 画布鼠标按下事件
		this.canvasElement.addEventListener('mousedown', (e) => {
			if (e.target === this.canvasElement && e.button === 0) {
				this.isDraggingCanvas = true;
				this.lastCanvasPos = { x: e.clientX, y: e.clientY };
				this.canvasElement.style.cursor = 'grabbing';
			}
		});

		// 鼠标移动事件
		this.canvasElement.addEventListener('mousemove', (e) => {
			if (this.isDraggingCanvas) {
				// 拖动画布
				const deltaX = e.clientX - this.lastCanvasPos.x;
				const deltaY = e.clientY - this.lastCanvasPos.y;
				this.canvasOffset.x += deltaX;
				this.canvasOffset.y += deltaY;
				this.lastCanvasPos = { x: e.clientX, y: e.clientY };
				this.updateCanvasTransform();
			} else if (this.isDragging && this.selectedNodeId && this.mindmapData) {
				// 拖动节点
				const node = this.findNodeById(this.mindmapData, this.selectedNodeId);
				if (node) {
					const rect = this.canvasElement.getBoundingClientRect();
					const x = e.clientX - rect.left - this.dragOffset.x;
					const y = e.clientY - rect.top - this.dragOffset.y;
					node.x = x;
					node.y = y;
					this.updateNodePosition(node);
					this.updateConnections();
					
					// 检查是否悬停在其他节点上
					this.checkNodeOverlap(e, node);
				}
			}
		});

		// 鼠标释放事件
		this.canvasElement.addEventListener('mouseup', () => {
			this.isDragging = false;
			this.isDraggingCanvas = false;
			this.canvasElement.style.cursor = 'grab';
			this.clearDragOverTimeout();
		});

		// 防止上下文菜单在画布上显示
		this.canvasElement.addEventListener('contextmenu', (e) => {
			if (e.target === this.canvasElement) {
				e.preventDefault();
			}
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

		// 添加颜色样式
		if (node.color && node.color !== 'default') {
			nodeElement.addClass(`node-color-${node.color}`);
		}

		// 创建节点文本容器
		const nodeText = nodeElement.createDiv('node-text');
		this.renderNodeText(nodeText, node);

		// 如果节点有子节点，添加折叠/展开指示器
		if (node.children.length > 0) {
			// 右上角的折叠/展开按钮（默认隐藏）
			const toggleBtn = nodeElement.createDiv('collapse-toggle');
			toggleBtn.textContent = node.collapsed ? '+' : '-';
			toggleBtn.style.position = 'absolute';
			toggleBtn.style.right = '4px';
			toggleBtn.style.top = '4px';
			toggleBtn.style.width = '16px';
			toggleBtn.style.height = '16px';
			toggleBtn.style.borderRadius = '50%';
			toggleBtn.style.backgroundColor = 'var(--interactive-accent)';
			toggleBtn.style.color = 'var(--text-on-accent)';
			toggleBtn.style.fontSize = '12px';
			toggleBtn.style.textAlign = 'center';
			toggleBtn.style.lineHeight = '16px';
			toggleBtn.style.cursor = 'pointer';
			toggleBtn.style.opacity = '0';
			toggleBtn.style.transition = 'opacity 0.2s ease';
			
			// 如果是折叠状态，在节点下方添加省略号指示器
			if (node.collapsed) {
				const dotIndicator = nodeElement.createDiv('collapsed-indicator');
				dotIndicator.textContent = '•••';
				dotIndicator.style.position = 'absolute';
				dotIndicator.style.bottom = '-20px';
				dotIndicator.style.left = '50%';
				dotIndicator.style.transform = 'translateX(-50%)';
				dotIndicator.style.color = 'var(--text-muted)';
				dotIndicator.style.fontSize = '14px';
				dotIndicator.style.fontWeight = 'bold';
				dotIndicator.style.letterSpacing = '2px';
			}
		}

		// 存储节点元素引用
		this.nodeElements.set(node.id, nodeElement);

		// 添加事件监听器
		this.setupNodeEventListeners(nodeElement, node);

		// 递归渲染子节点（只有未折叠时才渲染）
		if (!node.collapsed) {
			node.children.forEach(child => this.renderNode(child));
		}
	}

	private renderNodeText(textElement: HTMLElement, node: MindmapNodeData) {
		textElement.empty();
		
		// 检查并处理双链
		const wikilinkRegex = /\[\[([^\]]+)\]\]/g;
		const hasWikilink = wikilinkRegex.test(node.text);
		
		if (hasWikilink) {
			// 重新检测双链
			let text = node.text;
			const wikilinks: string[] = [];
			let match;
			
			// 重置正则表达式的索引
			wikilinkRegex.lastIndex = 0;
			while ((match = wikilinkRegex.exec(node.text)) !== null) {
				const linkText = match[1].split('|')[0].trim();
				wikilinks.push(linkText);
			}
			
			// 替换所有双链为可点击的span
			wikilinks.forEach(wikilink => {
				const linkRegex = new RegExp(`\\[\\[([^\\]]*\\|?${wikilink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\]]*)\\]\\]`, 'g');
				text = text.replace(linkRegex, `<span class="wikilink" data-link="${wikilink}">[[${wikilink}]]</span>`);
			});
			
			textElement.innerHTML = text;
			
			// 为双链添加点击事件
			textElement.querySelectorAll('.wikilink').forEach(link => {
				link.addEventListener('click', (e) => {
					e.stopPropagation();
					e.preventDefault();
					
					// 检查是否在编辑模式下
					const isEditing = textElement.parentElement?.querySelector('.node-input') !== null;
					if (!isEditing) {
						const linkText = link.getAttribute('data-link');
						if (linkText) {
							this.view.onWikilinkClick(linkText);
						}
					}
				});
				
				// 添加悬停效果
				link.addEventListener('mouseenter', () => {
					(link as HTMLElement).style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
				});
				
				link.addEventListener('mouseleave', () => {
					(link as HTMLElement).style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
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

		// 右键菜单
		element.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.showNodeContextMenu(e, node);
		});

		// 鼠标按下开始拖拽
		element.addEventListener('mousedown', (e) => {
			if (e.button === 0) { // 只响应左键
				e.preventDefault();
				e.stopPropagation();
				this.selectNode(node.id);
				this.isDragging = true;
				this.dragStartTime = Date.now();
				
				const rect = this.canvasElement.getBoundingClientRect();
				this.dragOffset.x = e.clientX - rect.left - (node.x || 0);
				this.dragOffset.y = e.clientY - rect.top - (node.y || 0);
			}
		});

		// 鼠标悬停显示折叠按钮
		element.addEventListener('mouseenter', () => {
			const toggleBtn = element.querySelector('.collapse-toggle') as HTMLElement;
			if (toggleBtn) {
				toggleBtn.style.opacity = '1';
			}
		});

		element.addEventListener('mouseleave', () => {
			const toggleBtn = element.querySelector('.collapse-toggle') as HTMLElement;
			if (toggleBtn) {
				toggleBtn.style.opacity = '0';
			}
		});

		// 折叠按钮点击事件
		const toggleBtn = element.querySelector('.collapse-toggle');
		if (toggleBtn) {
			toggleBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.toggleNodeCollapse(node);
			});
		}
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
		// 只为未折叠的节点绘制连接线
		if (!node.collapsed) {
			node.children.forEach(child => {
				if (node.id !== 'root') { // 不为根节点绘制连接线
					this.drawConnection(node, child);
				}
				this.drawConnections(child); // 递归绘制子节点的连接线
			});
		}
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

	private updateCanvasTransform() {
		// 通过transform属性移动整个画布，而不是改变每个节点的位置
		this.canvasElement.style.transform = `translate(${this.canvasOffset.x}px, ${this.canvasOffset.y}px)`;
	}

	private checkNodeOverlap(e: MouseEvent, draggedNode: MindmapNodeData) {
		if (!this.mindmapData) return;
		
		const rect = this.canvasElement.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;
		
		const overlappingNode = this.findNodeAtPosition(mouseX, mouseY, draggedNode);
		
		if (overlappingNode && overlappingNode !== this.dragOverNode) {
			this.clearDragOverTimeout();
			this.dragOverNode = overlappingNode;
			
			// 设置2秒超时
			this.dragOverTimeout = setTimeout(() => {
				this.moveNodeToParent(draggedNode, overlappingNode);
			}, 2000);
		} else if (!overlappingNode) {
			this.clearDragOverTimeout();
		}
	}

	private findNodeAtPosition(x: number, y: number, excludeNode: MindmapNodeData): MindmapNodeData | null {
		if (!this.mindmapData) return null;
		
		const allNodes = this.getAllNodes(this.mindmapData);
		for (const node of allNodes) {
			if (node === excludeNode || !node.x || !node.y) continue;
			
			const nodeWidth = 100; // 估算节点宽度
			const nodeHeight = 50; // 估算节点高度
			
			if (x >= node.x && x <= node.x + nodeWidth &&
				y >= node.y && y <= node.y + nodeHeight) {
				return node;
			}
		}
		return null;
	}

	private clearDragOverTimeout() {
		if (this.dragOverTimeout) {
			clearTimeout(this.dragOverTimeout);
			this.dragOverTimeout = null;
		}
		this.dragOverNode = null;
	}

	private moveNodeToParent(childNode: MindmapNodeData, newParent: MindmapNodeData) {
		if (!this.mindmapData || childNode === newParent || this.isAncestor(childNode, newParent)) {
			return; // 防止循环引用
		}
		
		// 从原父节点移除
		if (childNode.parent) {
			const index = childNode.parent.children.indexOf(childNode);
			if (index > -1) {
				childNode.parent.children.splice(index, 1);
			}
		}
		
		// 添加到新父节点
		childNode.parent = newParent;
		newParent.children.push(childNode);
		
		// 重新计算位置并重新渲染
		this.view.recalculateAndRender();
	}

	private isAncestor(ancestor: MindmapNodeData, descendant: MindmapNodeData): boolean {
		let current = descendant.parent;
		while (current) {
			if (current === ancestor) return true;
			current = current.parent;
		}
		return false;
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

	private toggleNodeCollapse(node: MindmapNodeData) {
		if (node.children.length === 0) return;
		
		node.collapsed = !node.collapsed;
		this.view.recalculateAndRender();
	}

	private showNodeContextMenu(e: MouseEvent, node: MindmapNodeData) {
		// 移除已存在的菜单
		const existingMenu = document.querySelector('.node-context-menu');
		if (existingMenu) {
			existingMenu.remove();
		}
		
		const menu = document.createElement('div');
		menu.className = 'node-context-menu';
		menu.style.position = 'fixed';
		menu.style.left = e.clientX + 'px';
		menu.style.top = e.clientY + 'px';
		menu.style.zIndex = '1000';
		menu.style.backgroundColor = 'var(--background-primary)';
		menu.style.border = '1px solid var(--background-modifier-border)';
		menu.style.borderRadius = '4px';
		menu.style.padding = '8px';
		menu.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
		
		const colors = [
			{ name: '默认', value: 'default' },
			{ name: '红色', value: 'red' },
			{ name: '蓝色', value: 'blue' },
			{ name: '绿色', value: 'green' },
			{ name: '橙色', value: 'orange' },
			{ name: '紫色', value: 'purple' }
		];
		
		colors.forEach(color => {
			const item = document.createElement('div');
			item.textContent = color.name;
			item.style.padding = '4px 8px';
			item.style.cursor = 'pointer';
			item.style.borderRadius = '2px';
			
			if (color.value !== 'default') {
				item.style.color = `var(--color-${color.value})`;
			}
			
			item.addEventListener('click', () => {
				node.color = color.value as any;
				this.view.recalculateAndRender();
				menu.remove();
			});
			
			item.addEventListener('mouseenter', () => {
				item.style.backgroundColor = 'var(--background-modifier-hover)';
			});
			
			item.addEventListener('mouseleave', () => {
				item.style.backgroundColor = 'transparent';
			});
			
			menu.appendChild(item);
		});
		
		// 添加编辑选项
		const editItem = document.createElement('div');
		editItem.textContent = '编辑节点';
		editItem.style.padding = '4px 8px';
		editItem.style.cursor = 'pointer';
		editItem.style.borderRadius = '2px';
		editItem.style.borderTop = '1px solid var(--background-modifier-border)';
		editItem.style.marginTop = '4px';
		
		editItem.addEventListener('click', () => {
			this.startEditing(node);
			menu.remove();
		});
		
		editItem.addEventListener('mouseenter', () => {
			editItem.style.backgroundColor = 'var(--background-modifier-hover)';
		});
		
		editItem.addEventListener('mouseleave', () => {
			editItem.style.backgroundColor = 'transparent';
		});
		
		menu.appendChild(editItem);
		
		document.body.appendChild(menu);
		
		// 点击其他地方关闭菜单
		const closeMenu = (event: MouseEvent) => {
			if (!menu.contains(event.target as Node)) {
				menu.remove();
				document.removeEventListener('click', closeMenu);
			}
		};
		
		setTimeout(() => {
			document.addEventListener('click', closeMenu);
		}, 100);
	}

	destroy() {
		// 清理事件监听器和DOM元素
		this.clearDragOverTimeout();
		this.nodeElements.clear();
		this.selectedNodeId = null;
		this.mindmapData = null;
		if (this.canvasElement) {
			this.canvasElement.empty();
		}
	}
}
