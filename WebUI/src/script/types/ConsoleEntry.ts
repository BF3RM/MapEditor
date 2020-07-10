import * as Util from 'util';
import { LOGLEVEL } from '@/script/types/Enums';

export interface IConsoleEntry {
	level: LOGLEVEL;
	id: number;
	message: any;
	info: any;
	time: number;
	expanded: boolean;
	stackTrace: string;
}

export class ConsoleEntry implements IConsoleEntry {
	public time = Date.now();
	public expanded = false;
	public id: number;
	public info: any;
	public level: LOGLEVEL;
	public message: string;
	public stackTrace: string = '';

	constructor(entry: IConsoleEntry) {
		this.level = entry.level;
		this.id = entry.id;
		if (entry.message === undefined) {
			this.message = 'undefined';
		} else if (entry.message === null) {
			this.message = 'null';
		} else if (typeof entry.message === 'object') {
			this.message = Util.inspect(entry.message);
		} else {
			this.message = entry.message;
		}
		this.info = entry.info;
		this.stackTrace = entry.stackTrace;
	}
}
