type Editor = import('@/script/Editor').default;

declare var editor: Editor;
declare enum LOGLEVEL {
	NONE = 0,
	ERROR = 1,
	PROD = 2,
	DEBUG = 3,
	VERBOSE = 4,
}
interface Window {
	[key:string]: any; // Add index signature
}
