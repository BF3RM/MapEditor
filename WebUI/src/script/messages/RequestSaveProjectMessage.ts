import { Message } from '@/script/messages/Message';

export class RequestSaveProjectMessage extends Message {
	constructor(private projectHeaderJSON: string) {
		super('RequestSaveProjectMessage');
	}
}
