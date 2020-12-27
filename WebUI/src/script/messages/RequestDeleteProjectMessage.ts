import { Message } from '@/script/messages/Message';

export class RequestDeleteProjectMessage extends Message {
	constructor(private projectId: number) {
		super('RequestDeleteProjectMessage');
	}
}
