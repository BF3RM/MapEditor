import { signals } from '@/script/modules/Signals';
import { LOGLEVEL } from '@/script/types/Enums';

export function LogError(message: string, info?: any): void {
	console.log(message);
	signals.onLog.emit(LOGLEVEL.ERROR, message, info);
}

export function Log(level: LOGLEVEL, message: string, info?: any): void {
	const logLevel = LOGLEVEL.VERBOSE;
	if (level <= logLevel) {
		signals.onLog.emit(level, message, info);
	}
}
