import { GameObjectTransferData } from '@/script/types/GameObjectTransferData';
import { Message } from '@/script/messages/Message';
import { LOGLEVEL } from '@/script/modules/Logger';

export class PreviewDestroyMessage extends Message {
	constructor(public gameObjectTransferData: GameObjectTransferData) {
		super('PreviewDestroyMessage');

		if (gameObjectTransferData === undefined) {
			window.Log(LOGLEVEL.DEBUG, 'PreviewDestroyMessage: Missing gameObjectTransferData');
		}
	}
}
