import { Message } from '@/script/messages/Message';

export class SetViewModeMessage extends Message {
	constructor(public viewMode: number) {
		super('SetViewModeMessage');
	}
}
