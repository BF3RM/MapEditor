import { signals } from '@/script/modules/Signals';
export enum LOGLEVEL {
	NONE = 0,
	ERROR = 1,
	PROD = 2,
	WARNING = 3,
	INFO = 4,
	DEBUG = 5,
	VERBOSE = 6,
}

export function LogError(message: string, info?: any): void {
	signals.onLog.emit(LOGLEVEL.ERROR, message, info);
}

export function Log(level: LOGLEVEL, message: string, info?: any): void {
	const logLevel = LOGLEVEL.VERBOSE;
	if (level <= logLevel) {
		signals.onLog.emit(level, message, info);
	}
}
