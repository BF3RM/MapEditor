import { TransferData } from '@/script/types/TransferData';
import { Message } from '@/script/messages/Message';

export class PreviewDestroyMessage extends Message {
	constructor(public gameObjectTransferData: TransferData) {
		super('PreviewDestroyMessage');
	}
}
