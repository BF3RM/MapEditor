import { Vec3 } from '../types/primitives/Vec3';
import { Message } from '@/script/messages/Message';

export class SetRaycastPositionMessage extends Message {
    constructor(public position: Vec3) {
        super('SetRaycastPositionMessage');
    }
}
