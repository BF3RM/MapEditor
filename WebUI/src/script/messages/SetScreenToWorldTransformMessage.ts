import {Message} from '@/script/messages/Message';
import {Vec3} from '@/script/types/primitives/Vec3';

export class SetScreenToWorldTransformMessage extends Message {
	constructor(public direction: Vec3) {
		super('SetScreenToWorldPositionMessage');
	}
}
