declare namespace InfiniteTree {
	interface INode {
		id: string;
		type: string;
		name: string;
		data?: any;
		state?: INodeState;
		children?: INode[];
		content?: any[];
		path?: string;
	}
	interface INodeState {
		selected: boolean;
		depth: number;
		open: boolean;
		path: string;
		prefixMask: string;
		total: number;
		filtered: boolean;
	}

	interface IInfiniteTreeOptions {
		autoOpen: boolean;
		droppable: boolean;
		shouldLoadNodes: boolean;
		loadNodes: boolean;
		selectable: boolean;
		shouldSelectNode: boolean;

		// When el is not specified, the tree will run in the stealth mode
		el: any;
	}
}

declare module 'infinite-tree' {
	import events = require('events');
	import INode = InfiniteTree.INode;
	import INodeState = InfiniteTree.INodeState;
	import IInfiniteTreeOptions = InfiniteTree.IInfiniteTreeOptions;

	export { INode, INodeState, IInfiniteTreeOptions };
	export class Node implements INode {
		public id: string;
		public type: string;
		public name: string;
		public parent: Node;
		public children: Node[];
		public state: INodeState;
		public loadOnDemand: boolean;
		public content: any[];
		public path: string;

		constructor(node: INode);

		public contains(node: Partial<Node>): boolean;

		public getChildAt(index: number): Node;

		public getChildren(): Node;

		public getFirstChild(): Node;

		public getLastChild(): Node;

		public getNextSibling(): Node;

		public getParent(): Node;

		public getPreviousSibling(): Node;

		public hasChildren(): boolean;

		public isLastChild(): boolean;

	}

	export default class InfiniteTree extends events.EventEmitter {
		public options: IInfiniteTreeOptions;
		public nodes: Node[];
		public rows: any[];
		public filtered: boolean;

		constructor(el: any);
		// Adds an array of new child nodes to a parent node at the specified index.
		// * If the parent is null or undefined, inserts new childs at the specified index in the top-level.
		// * If the parent has children, the method adds the new child to it at the specified index.
		// * If the parent does not have children, the method adds the new child to the parent.
		// * If the index value is greater than or equal to the number of children in the parent, the method adds the child at the end of the children.
		// @param {Array} newNodes An array of new child nodes.
		// @param {number} [index] The 0-based index of where to insert the child node.
		// @param {Node} parentNode The Node object that defines the parent node.
		// @return {boolean} Returns true on success, false otherwise.

		public addChildNodes(newNodes: INode[], index?: number, parentNode?: Node): boolean;

		// Adds a new child node to the end of the list of children of a specified parent node.
		// * If the parent is null or undefined, inserts the child at the specified index in the top-level.
		// * If the parent has children, the method adds the child as the last child.
		// * If the parent does not have children, the method adds the child to the parent.
		// @param {object} newNode The new child node.
		// @param {Node} parentNode The Node object that defines the parent node.
		// @return {boolean} Returns true on success, false otherwise.
		public appendChildNode(newNode: INode, parentNode: Node): boolean;

		// Checks or unchecks a node.
		// @param {Node} node The Node object.
		// @param {boolean} [checked] Whether to check or uncheck the node. If not specified, it will toggle between checked and unchecked state.
		// @return {boolean} Returns true on success, false otherwise.
		// @example
		//
		// tree.checkNode(node); // toggle checked and unchecked state
		// tree.checkNode(node, true); // checked=true, indeterminate=false
		// tree.checkNode(node, false); // checked=false, indeterminate=false
		//
		// @doc
		//
		// state.checked | state.indeterminate | description
		// ------------- | ------------------- | -----------
		// false         | false               | The node and all of its children are unchecked.
		// true          | false               | The node and all of its children are checked.
		// true          | true                | The node will appear as indeterminate when the node is checked and some (but not all) of its children are checked.
		public checkNode(node: Node, checked: boolean): true;

		// Clears the tree.
		public clear(): void;

		// Closes a node to hide its children.
		// @param {Node} node The Node object.
		// @param {object} [options] The options object.
		// @param {boolean} [options.silent] Pass true to prevent "closeNode" and "selectNode" events from being triggered.
		// @return {boolean} Returns true on success, false otherwise.
		public closeNode(node: Node, options?: object): boolean;

		// Filters nodes. Use a string or a function to test each node of the tree. Otherwise, it will render nothing after filtering (e.g. tree.filter(), tree.filter(null), tree.flter(0), tree.filter({}), etc.).
		// @param {string|function} predicate A keyword string, or a function to test each node of the tree. If the predicate is an empty string, all nodes will be filtered. If the predicate is a function, returns true to keep the node, false otherwise.
		// @param {object} [options] The options object.
		// @param {boolean} [options.caseSensitive] Case sensitive string comparison. Defaults to false. This option is only available for string comparison.
		// @param {boolean} [options.exactMatch] Exact string matching. Defaults to false. This option is only available for string comparison.
		// @param {string} [options.filterPath] Gets the value at path of Node object. Defaults to 'name'. This option is only available for string comparison.
		// @param {boolean} [options.includeAncestors] Whether to include ancestor nodes. Defaults to true.
		// @param {boolean} [options.includeDescendants] Whether to include descendant nodes. Defaults to true.
		// @example
		//
		// const filterOptions = {
		//     caseSensitive: false,
		//     exactMatch: false,
		//     filterPath: 'props.some.other.key',
		//     includeAncestors: true,
		//     includeDescendants: true
		// };
		// tree.filter('keyword', filterOptions);
		//
		// @example
		//
		// const filterOptions = {
		//     includeAncestors: true,
		//     includeDescendants: true
		// };
		// tree.filter(function(node) {
		//     const keyword = 'keyword';
		//     const filterText = node.name || '';
		//     return filterText.toLowerCase().indexOf(keyword) >= 0;
		// }, filterOptions);
		public filter(predicate: any, options?: object): void;

		// Flattens all child nodes of a parent node by performing full tree traversal using child-parent link.
		// No recursion or stack is involved.
		// @param {Node} parentNode The Node object that defines the parent node.
		// @return {array} Returns an array of Node objects containing all the child nodes of the parent node.
		public flattenChildNodes(parentNode: Node): Node[];

		// Flattens a node by performing full tree traversal using child-parent link.
		// No recursion or stack is involved.
		// @param {Node} node The Node object.
		// @return {array} Returns a flattened list of Node objects.
		public flattenNode(node: Node): Node[];

		// Gets a list of child nodes.
		// @param {Node} [parentNode] The Node object that defines the parent node. If null or undefined, returns a list of top level nodes.
		// @return {array} Returns an array of Node objects containing all the child nodes of the parent node.
		public getChildNodes(parentNode: Node): Node[];

		// Gets a node by its unique id. This assumes that you have given the nodes in the data a unique id.
		// @param {string|number} id An unique node id. A null value will be returned if the id doesn't match.
		// @return {Node} Returns a node the matches the id, null otherwise.
		public getNodeById(id: string): Node;

		// Returns the node at the specified point. If the specified point is outside the visible bounds or either coordinate is negative, the result is null.
		// @param {number} x A horizontal position within the current viewport.
		// @param {number} y A vertical position within the current viewport.
		// @return {Node} The Node object under the given point.
		public getNodeFromPoint(x: number, y: number): Node;

		// Gets an array of open nodes.
		// @return {array} Returns an array of Node objects containing open nodes.
		public getOpenNodes(): Node[];

		// Gets the root node.
		// @return {Node} Returns the root node, or null if empty.
		public getRootNode(): Node;

		// Gets the index of the selected node.
		// @return {number} Returns the index of the selected node, or -1 if not selected.
		public getSelectedNode(): Node;

		// Gets the index of the selected node.
		// @return {number} Returns the index of the selected node, or -1 if not selected.
		public getSelectedIndex(): number;

		// Inserts the specified node after the reference node.
		// @param {object} newNode The new sibling node.
		// @param {Node} referenceNode The Node object that defines the reference node.
		// @return {boolean} Returns true on success, false otherwise.
		public insertNodeAfter(newNode: Node, referenceNode: Node): boolean;

		// Inserts the specified node before the reference node.
		// @param {object} newNode The new sibling node.
		// @param {Node} referenceNode The Node object that defines the reference node.
		// @return {boolean} Returns true on success, false otherwise.
		public insertNodeBefore(newNode: Node, referenceNode: Node): boolean;

		// Loads data in the tree.
		// @param {object|array} data The data is an object or array of objects that defines the node.
		public loadData(data: any): void;

		// Moves a node from its current position to the new position.
		// @param {Node} node The Node object.
		// @param {Node} parentNode The Node object that defines the parent node.
		// @param {number} [index] The 0-based index of where to insert the child node.
		// @return {boolean} Returns true on success, false otherwise.
		public moveNodeTo(node: Node, parentNode: Node, index: number): boolean;

		// Opens a node to display its children.
		// @param {Node} node The Node object.
		// @param {object} [options] The options object.
		// @param {boolean} [options.silent] Pass true to prevent "openNode" event from being triggered.
		// @return {boolean} Returns true on success, false otherwise.
		public openNode(node: Node, options?: object): boolean;

		// Removes all child nodes from a parent node.
		// @param {Node} parentNode The Node object that defines the parent node.
		// @param {object} [options] The options object.
		// @param {boolean} [options.silent] Pass true to prevent "selectNode" event from being triggered.
		// @return {boolean} Returns true on success, false otherwise.
		public removeChildNodes(parentNode: Node, options?: object): boolean;

		// Removes a node and all of its child nodes.
		// @param {Node} node The Node object.
		// @param {object} [options] The options object.
		// @param {boolean} [options.silent] Pass true to prevent "selectNode" event from being triggered.
		// @return {boolean} Returns true on success, false otherwise.
		public removeNode(node: Node, options: object): boolean;

		// Sets the current scroll position to this node.
		// @param {Node} node The Node object.
		// @return {boolean} Returns true on success, false otherwise.
		public scrollToNode(node: Node): boolean;

		// Gets (or sets) the current vertical position of the scroll bar.
		// @param {number} [value] If the value is specified, indicates the new position to set the scroll bar to.
		// @return {number} Returns the vertical scroll position.
		public scrollTop(value: number): number;

		// Selects a node.
		// @param {Node} node The Node object. If null or undefined, deselects the current node.
		// @param {object} [options] The options object.
		// @param {boolean} [options.autoScroll] Pass true to automatically scroll to the selected node. Defaults to true.
		// @param {boolean} [options.silent] Pass true to prevent "selectNode" event from
		// @return {boolean} Returns true on success, false otherwise.
		public selectNode(node: Node, options?: object): boolean;

		// Swaps two nodes.
		// @param {Node} node1 The Node object.
		// @param {Node} node2 The Node object.
		// @return {boolean} Returns true on success, false otherwise.
		public swapNodes(node1: Node, node2: Node): boolean;

		// Toggles a node to display or hide its children.
		// @param {Node} node The Node object.
		// @param {object} [options] The options object.
		// @param {boolean} [options.silent] Pass true to prevent "closeNode", "openNode", and "selectNode" events from being triggered.
		// @return {boolean} Returns true on success, false otherwise.
		public toggleNode(node: Node, options?: object): boolean;

		// Serializes the current state of a node to a JSON string.
		// @param {Node} node The Node object. If null, returns the whole tree.
		// @return {string} Returns a JSON string represented the tree.
		public toString(node?: Node | null): string;

		// Unfilters nodes.
		public unfilter(): void;

		// Updates the tree.
		public update(): void;

		// Updates the data of a node.
		// @param {Node} node The Node object.
		// @param {object} data The data object.
		// @param {object} [options] The options object.
		// @param {boolean} [options.shallowRendering] True to render only the parent node, false to render the parent node and all expanded child nodes. Defaults to false.
		public updateNode(node: Node, data: any, options?: object): boolean;

		// Destroys the tree
		public destroy(): void;
	}
}
