import { ITreeNode, ITreeNodeState } from '@/script/interfaces/ITreeNode';

export class TreeNode implements ITreeNode {
	public id: string = '';
	public name: string = '';
	public type: string = '';
	public path: string = '';
	public children: TreeNode[] = [];
	public content: any[] = [];
	public data: any;
	public loadOnDemand: boolean = false;
	public parent?: TreeNode = undefined;
	public props: any;
	public state: ITreeNodeState = {
		depth: 0,
		open: false,
		selected: false,
		filtered: true
	};

	constructor(node: ITreeNode) {
		this.id = node.id;
		this.name = node.name;
		this.type = node.type;
		this.path = node.path;
		if (node.state) {
			this.state = {
				...this.state,
				...node.state
			};
		}
	}
}
