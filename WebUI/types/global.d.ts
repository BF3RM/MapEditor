type Editor = import('@/script/Editor').default;

declare var editor: Editor;

interface Window {
	[key:string]: any; // Add index signature
}
