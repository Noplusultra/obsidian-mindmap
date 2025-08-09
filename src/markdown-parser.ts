export interface MindmapNodeData {
	id: string;
	text: string;
	level: number;
	type: 'header' | 'list';
	children: MindmapNodeData[];
	parent?: MindmapNodeData;
	x?: number;
	y?: number;
	lineNumber: number;
	originalText: string;
	hasWikilink: boolean;
	wikilinks: string[];
	color?: 'red' | 'blue' | 'green' | 'orange' | 'purple' | 'default';
	collapsed?: boolean;
}

export class MarkdownParser {
	
	static parseMarkdown(content: string): MindmapNodeData {
		const lines = content.split('\n');
		const root: MindmapNodeData = {
			id: 'root',
			text: '根节点',
			level: 0,
			type: 'header',
			children: [],
			lineNumber: -1,
			originalText: '',
			hasWikilink: false,
			wikilinks: []
		};

		const nodeStack: MindmapNodeData[] = [root];
		let currentId = 1;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmedLine = line.trim();
			
			if (!trimmedLine) continue;

			const node = this.parseLine(line, i, currentId++);
			if (!node) continue;

			// 找到正确的父节点
			const parentNode = this.findParentNode(nodeStack, node);
			node.parent = parentNode;
			parentNode.children.push(node);

			// 更新节点栈
			this.updateNodeStack(nodeStack, node);
		}

		return root;
	}

	private static parseLine(line: string, lineNumber: number, id: number): MindmapNodeData | null {
		const trimmedLine = line.trim();
		
		// 解析标题
		const headerMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
		if (headerMatch) {
			const level = headerMatch[1].length;
			const text = headerMatch[2];
			const { cleanText, wikilinks } = this.extractWikilinks(text);
			
			return {
				id: `node-${id}`,
				text: cleanText,
				level: level,
				type: 'header',
				children: [],
				lineNumber: lineNumber,
				originalText: line,
				hasWikilink: wikilinks.length > 0,
				wikilinks: wikilinks,
				color: level === 1 ? 'red' : 'default' // 根节点默认红色
			};
		}

		// 解析列表项 (支持Tab和空格缩进)
		const listMatch = line.match(/^(\s*)-\s+(.+)$/);
		if (listMatch) {
			const indent = listMatch[1];
			// 计算缩进级别：Tab算作4个空格
			const indentLength = indent.replace(/\t/g, '    ').length;
			const indentLevel = Math.floor(indentLength / 4) + 1;
			const text = listMatch[2];
			const { cleanText, wikilinks } = this.extractWikilinks(text);
			
			return {
				id: `node-${id}`,
				text: cleanText,
				level: indentLevel + 6, // 列表项的level从7开始，避免与标题冲突
				type: 'list',
				children: [],
				lineNumber: lineNumber,
				originalText: line,
				hasWikilink: wikilinks.length > 0,
				wikilinks: wikilinks
			};
		}

		return null;
	}

	private static extractWikilinks(text: string): { cleanText: string; wikilinks: string[] } {
		const wikilinkRegex = /\[\[([^\]]+)\]\]/g;
		const wikilinks: string[] = [];
		let cleanText = text;

		let match;
		while ((match = wikilinkRegex.exec(text)) !== null) {
			// 处理可能的别名 [[链接|别名]]
			const linkText = match[1].split('|')[0].trim();
			wikilinks.push(linkText);
		}

		// 保留双链的显示，但记录链接信息
		return { cleanText, wikilinks };
	}

	private static findParentNode(nodeStack: MindmapNodeData[], currentNode: MindmapNodeData): MindmapNodeData {
		// 从栈顶向下查找合适的父节点
		for (let i = nodeStack.length - 1; i >= 0; i--) {
			const stackNode = nodeStack[i];
			if (stackNode.level < currentNode.level) {
				return stackNode;
			}
		}
		
		// 如果找不到合适的父节点，返回根节点
		return nodeStack[0];
	}

	private static updateNodeStack(nodeStack: MindmapNodeData[], currentNode: MindmapNodeData): void {
		// 移除level大于等于当前节点的所有节点
		while (nodeStack.length > 0 && nodeStack[nodeStack.length - 1].level >= currentNode.level) {
			nodeStack.pop();
		}
		
		// 将当前节点加入栈
		nodeStack.push(currentNode);
	}

	static generateMarkdown(rootNode: MindmapNodeData): string {
		const lines: string[] = [];
		
		function traverse(node: MindmapNodeData) {
			if (node.id === 'root') {
				// 跳过根节点
				node.children.forEach(child => traverse(child));
				return;
			}

			if (node.type === 'header') {
				const headerLevel = '#'.repeat(node.level);
				const text = node.hasWikilink && node.wikilinks.length > 0 
					? this.restoreWikilinks(node.text, node.wikilinks)
					: node.text;
				lines.push(`${headerLevel} ${text}`);
			} else if (node.type === 'list') {
				const indentLevel = Math.max(0, node.level - 7); // 列表项的缩进
				const indent = '\t'.repeat(indentLevel);
				const text = node.hasWikilink && node.wikilinks.length > 0 
					? this.restoreWikilinks(node.text, node.wikilinks)
					: node.text;
				lines.push(`${indent}- ${text}`);
			}

			// 递归处理子节点
			node.children.forEach(child => traverse(child));
		}

		traverse(rootNode);
		return lines.join('\n');
	}

	private static restoreWikilinks(text: string, wikilinks: string[]): string {
		// 这里可以根据需要实现更复杂的双链恢复逻辑
		// 简单实现：如果原本有双链，保持原样
		return text;
	}

	static calculateNodePositions(rootNode: MindmapNodeData): void {
		const centerX = 600;
		const centerY = 400;
		
		// 找到主要的中心节点（第一个子节点通常是中心主题）
		if (rootNode.children.length === 0) return;
		
		const centerNode = rootNode.children[0];
		centerNode.x = centerX;
		centerNode.y = centerY;
		
		// 使用新的水平树形布局
		this.arrangeHorizontalTree(centerNode, centerX, centerY);
	}

	private static arrangeHorizontalTree(centerNode: MindmapNodeData, centerX: number, centerY: number): void {
		const mainBranches = centerNode.children;
		if (mainBranches.length === 0) return;

		// 计算每一边分配多少个分支
		const totalBranches = mainBranches.length;
		const rightCount = Math.ceil(totalBranches / 2);
		const leftCount = totalBranches - rightCount;

		const verticalSpacing = 100; // 分支间的垂直间距
		const horizontalDistance = 300; // 水平距离

		// 安排右侧分支
		for (let i = 0; i < rightCount; i++) {
			const branch = mainBranches[i];
			const offsetFromCenter = (i - (rightCount - 1) / 2) * verticalSpacing;
			
			branch.x = centerX + horizontalDistance;
			branch.y = centerY + offsetFromCenter;
			
			// 递归安排子节点
			this.arrangeHorizontalSubtree(branch, 'right', 0);
		}

		// 安排左侧分支
		for (let i = 0; i < leftCount; i++) {
			const branch = mainBranches[rightCount + i];
			const offsetFromCenter = (i - (leftCount - 1) / 2) * verticalSpacing;
			
			branch.x = centerX - horizontalDistance;
			branch.y = centerY + offsetFromCenter;
			
			// 递归安排子节点
			this.arrangeHorizontalSubtree(branch, 'left', 0);
		}
	}

	private static arrangeHorizontalSubtree(parentNode: MindmapNodeData, direction: 'left' | 'right', level: number): void {
		const children = parentNode.children;
		if (children.length === 0) return;

		// 根据层级调整间距，越深层间距越小但不会太小
		const baseHorizontalSpacing = 220;
		const baseVerticalSpacing = 100;
		const horizontalSpacing = Math.max(baseHorizontalSpacing - (level * 20), 150);
		const verticalSpacing = Math.max(baseVerticalSpacing - (level * 10), 60);
		
		const directionMultiplier = direction === 'right' ? 1 : -1;
		const baseX = parentNode.x! + (directionMultiplier * horizontalSpacing);

		// 计算所有子节点需要的总空间，考虑它们的子节点
		const childHeights = children.map(child => this.calculateSubtreeHeight(child, level + 1));
		const totalRequiredHeight = childHeights.reduce((sum, height) => sum + height, 0);
		
		// 计算起始Y位置
		let currentY = parentNode.y! - totalRequiredHeight / 2;

		// 为每个子节点安排位置
		children.forEach((child, index) => {
			const childHeight = childHeights[index];
			child.x = baseX;
			child.y = currentY + childHeight / 2;
			
			// 递归处理子节点
			this.arrangeHorizontalSubtree(child, direction, level + 1);
			
			// 更新Y位置到下一个子节点
			currentY += childHeight;
		});
	}

	private static calculateSubtreeHeight(node: MindmapNodeData, level: number): number {
		if (node.children.length === 0 || node.collapsed) {
			return Math.max(100 - (level * 10), 60); // 单个节点的最小高度
		}

		// 递归计算所有子节点的高度
		const childHeights = node.children.map(child => this.calculateSubtreeHeight(child, level + 1));
		const totalChildHeight = childHeights.reduce((sum, height) => sum + height, 0);
		
		// 子树的高度是所有子节点高度的总和，但至少要有最小间距
		return Math.max(totalChildHeight, Math.max(100 - (level * 10), 60));
	}

	private static arrangeSubBranches(branchNode: MindmapNodeData, baseAngle: number, spacing: number): void {
		const children = branchNode.children;
		if (children.length === 0) return;

		const distance = 250;
		const angleSpread = Math.PI / 2; // 90度扇形
		
		children.forEach((child, index) => {
			let childAngle: number;
			
			if (children.length === 1) {
				childAngle = baseAngle;
			} else {
				// 在扇形区域内分布子节点
				const step = angleSpread / (children.length - 1);
				childAngle = baseAngle - angleSpread/2 + (index * step);
			}
			
			if (branchNode.x !== undefined && branchNode.y !== undefined) {
				child.x = branchNode.x + Math.cos(childAngle) * distance;
				child.y = branchNode.y + Math.sin(childAngle) * distance;
			}
			
			// 递归处理更深层的子节点
			this.arrangeDeepSubBranches(child, childAngle, distance * 0.8);
		});
	}

	private static arrangeDeepSubBranches(node: MindmapNodeData, baseAngle: number, distance: number): void {
		const children = node.children;
		if (children.length === 0) return;

		children.forEach((child, index) => {
			// 深层节点沿着同一方向延伸，稍微偏移避免重叠
			const angleOffset = (index - (children.length - 1) / 2) * 0.4;
			const childAngle = baseAngle + angleOffset;
			
			if (node.x !== undefined && node.y !== undefined) {
				child.x = node.x + Math.cos(childAngle) * distance;
				child.y = node.y + Math.sin(childAngle) * distance;
			}
			
			// 继续递归处理
			this.arrangeDeepSubBranches(child, childAngle, Math.max(distance * 0.9, 150));
		});
	}
}
