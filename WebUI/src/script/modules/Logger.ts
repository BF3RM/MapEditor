import { signals } from '@/script/modules/Signals';
import { LOGLEVEL } from '@/script/types/Enums';

export function LogError(message: string, info?: any): void {
	signals.onLog.emit(LOGLEVEL.ERROR, message, info);
	console.error(message);
}

export function Log(level: LOGLEVEL, message: string, info?: any): void {
	const logLevel = LOGLEVEL.VERBOSE;
	if (level <= logLevel) {
		signals.onLog.emit(level, message, info);
	}
}
