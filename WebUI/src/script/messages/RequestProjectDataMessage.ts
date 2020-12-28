import { Message } from '@/script/messages/Message';

export class RequestProjectDataMessage extends Message {
	constructor(private projectId: number) {
		super('RequestProjectDataMessage');
	}
}
