import { GameObjectTransferData } from '@/script/types/GameObjectTransferData';
import { Message } from '@/script/messages/Message';

export class MoveObjectMessage extends Message {
	constructor(private gameObjectTransferData: GameObjectTransferData) {
		super('MoveObjectMessage');
		if (gameObjectTransferData === undefined) {
			window.Log(LOGLEVEL.DEBUG, 'MoveObjectMessage: Missing gameObjectTransferData');
		}
	}
}
