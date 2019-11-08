import { signals } from '@/script/modules/Signals';
export enum LOGLEVEL {
	NONE = 0,
	ERROR = 1,
	PROD = 2,
	DEBUG = 3,
	VERBOSE = 4,
}

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
