import { Message } from '@/script/messages/Message';
import { Vec3 } from '@/script/types/primitives/Vec3';
import { Vec2 } from '@/script/types/primitives/Vec2';

export class SetScreenToWorldTransformMessage extends Message {
	constructor(public direction: Vec3, public coordinates: Vec2) {
		super('SetScreenToWorldPositionMessage');
	}
}
