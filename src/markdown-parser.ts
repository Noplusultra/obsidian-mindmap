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
				wikilinks: wikilinks
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
			wikilinks.push(match[1]);
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
		
		// 为主要分支安排位置
		this.arrangeMainBranches(centerNode, centerX, centerY);
	}

	private static arrangeMainBranches(centerNode: MindmapNodeData, centerX: number, centerY: number): void {
		const mainBranches = centerNode.children;
		if (mainBranches.length === 0) return;

		// 定义主要方向：右、左、上、下，然后是对角线方向
		const directions = [
			{ angle: 0, x: 1, y: 0 },      // 右
			{ angle: Math.PI, x: -1, y: 0 }, // 左
			{ angle: -Math.PI/2, x: 0, y: -1 }, // 上
			{ angle: Math.PI/2, x: 0, y: 1 },   // 下
			{ angle: Math.PI/4, x: 0.7, y: -0.7 }, // 右上
			{ angle: 3*Math.PI/4, x: -0.7, y: -0.7 }, // 左上
			{ angle: -Math.PI/4, x: 0.7, y: 0.7 }, // 右下
			{ angle: -3*Math.PI/4, x: -0.7, y: 0.7 } // 左下
		];

		const baseDistance = 350;
		const branchSpacing = 150;

		mainBranches.forEach((branch, index) => {
			const direction = directions[index % directions.length];
			const extraOffset = Math.floor(index / directions.length) * 50;
			
			branch.x = centerX + (direction.x * (baseDistance + extraOffset));
			branch.y = centerY + (direction.y * (baseDistance + extraOffset));
			
			// 为该分支的子节点安排位置
			this.arrangeSubBranches(branch, direction.angle, branchSpacing);
		});
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
