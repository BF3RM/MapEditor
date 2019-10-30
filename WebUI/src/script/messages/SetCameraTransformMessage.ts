import { Message } from '@/script/messages/Message';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';

export class SetCameraTransformMessage extends Message {
	constructor(public transform: LinearTransform) {
		super('SetCameraTransformMessage');
		this.transform = transform;
	}
}
