import { TransferData } from '@/script/types/TransferData';
import { Message } from '@/script/messages/Message';

export class MoveObjectMessage extends Message {
	constructor(private gameObjectTransferData: TransferData) {
		super('MoveObjectMessage');
	}
}
