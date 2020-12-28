import { Message } from '@/script/messages/Message';

export class SetProjectDataMessage extends Message {
	constructor(public projectDataJSON: string) {
		super('SetProjectDataMessage');
	}
}
