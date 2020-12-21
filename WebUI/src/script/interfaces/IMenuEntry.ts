interface IMenuEntry {
	type: string;
	children: IMenuEntry[];
	entries?: Map<string, IMenuEntry>;
	label?: string;
	callback?: () => void;
}

export default IMenuEntry;
