type Editor = import('@/script/Editor').default;

declare var editor: Editor;
declare enum LOGLEVEL {
	NONE = 0,
	PROD = 1,
	DEBUG = 2,
	VERBOSE = 3,
}
interface Window {
	[key:string]: any; // Add index signature
}