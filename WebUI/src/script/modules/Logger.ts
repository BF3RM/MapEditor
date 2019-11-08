import { signals } from '@/script/modules/Signals';

export function LogError(message: string, info?: any): void {
	console.error(message, info);
	signals.onLog.emit(1, message, info);
}

export function Log(level: LOGLEVEL, message: string, info?: any): void {
	const logLevel = LOGLEVEL.VERBOSE;
	if (level <= logLevel) {
		console.log(message, info);
		signals.onLog.emit(level, message, info);
	}
}
