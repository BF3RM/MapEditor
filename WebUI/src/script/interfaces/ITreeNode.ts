export interface ITreeNode {
	children: ITreeNode[];
	id: string | null;
	name: string | null;
	parent: ITreeNode;
	props: any;
	state: TreeNodeState;
	data: any;
	loadOnDemand: boolean;
	hasChildren(): boolean;
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
