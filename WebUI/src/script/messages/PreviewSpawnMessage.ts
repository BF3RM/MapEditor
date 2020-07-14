import { GameObjectTransferData } from '@/script/types/GameObjectTransferData';
import { Message } from '@/script/messages/Message';

export class PreviewSpawnMessage extends Message {
	constructor(public gameObjectTransferData: GameObjectTransferData) {
		super('PreviewSpawnMessage');
	}
}
