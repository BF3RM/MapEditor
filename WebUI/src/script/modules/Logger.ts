import { signals } from '@/script/modules/Signals';
import { LOGLEVEL } from '@/script/types/Enums';

export function LogError(message: string, info?: any): void {
	signals.onLog.emit(LOGLEVEL.ERROR, message, info);
	console.error(message);
}

export function Log(level: LOGLEVEL, message: string, info?: any): void {
	// Gameface port: the panel stored EVERY level (threshold VERBOSE), so the hot-path
	// VERBOSE/INFO logs (every command/message/pick) grew the Logs array unbounded and
	// re-filtered the whole array on every reactive update -> progressive slowdown +
	// periodic GC stalls. Only keep WARNING and more severe in the panel; the rest are
	// dropped. (LOGLEVEL: lower number = more severe, so `level <= WARNING` keeps
	// NONE/ERROR/PROD/WARNING and drops INFO/DEBUG/VERBOSE.)
	const logLevel = LOGLEVEL.WARNING;
	if (level <= logLevel) {
		signals.onLog.emit(level, message, info);
	}
}
