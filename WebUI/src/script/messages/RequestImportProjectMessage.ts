import { Message } from '@/script/messages/Message';

export class RequestImportProjectMessage extends Message {
	constructor(private projectDataJSON: string) {
		super('RequestImportProjectMessage');
	}
}
