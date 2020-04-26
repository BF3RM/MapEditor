import { Message } from '@/script/messages/Message';

export class SetUpdateRateMessage extends Message {
	constructor(public value: number) {
		super('SetUpdateRateMessage');
	}
}
