import { Message } from '@/script/messages/Message';

export class RequestLoadProjectMessage extends Message {
	constructor(private projectId: number) {
		super('RequestLoadProjectMessage');
	}
}
