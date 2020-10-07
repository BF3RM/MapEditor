import { Message } from '@/script/messages/Message';
import { Vec2 } from '@/script/types/primitives/Vec2';

export class TeleportMouseMessage extends Message {
	constructor(public coordinates: Vec2, public direction: string) {
		super('TeleportMouseMessage');
	}
}
