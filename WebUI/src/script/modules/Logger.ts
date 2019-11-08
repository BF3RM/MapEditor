export function LogError(message: string, info?: any): void {
	console.error(message, info);
	if (window.onLog !== undefined) {
		window.onLog(1, message, info);
	}
}

export function Log(level: LOGLEVEL, message: string, info?: any): void {
	const logLevel = LOGLEVEL.VERBOSE;
	if (level <= logLevel) {
		console.log(message, info);
		console.error(message, info);
		if (window.onLog !== undefined) {
			window.onLog(level, message, info);
		}
	}
}
