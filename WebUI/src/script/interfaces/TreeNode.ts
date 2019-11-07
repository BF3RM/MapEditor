export interface TreeNode {
	children: TreeNode[];
	id: string | null;
	name: string | null;
	parent: TreeNode;
	props: any;
	state: TreeNodeState;
	data: any;
	loadOnDemand: boolean;
	hasChildren: Function;
}

export interface TreeNodeState {
	collapsing: boolean;
	depth: number;
	expanding: boolean;
	open: boolean;
	path: string;
	prefixMask: string;
	selected: boolean;
	total: number;
}
