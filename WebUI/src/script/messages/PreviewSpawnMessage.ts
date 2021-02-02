import { TransferData } from '@/script/types/TransferData';
import { Message } from '@/script/messages/Message';

export class PreviewSpawnMessage extends Message {
	constructor(public gameObjectTransferData: TransferData) {
		super('PreviewSpawnMessage');
	}
}
