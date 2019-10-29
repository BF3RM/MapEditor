import { Message } from '@/script/messages/Message';

export class SetPlayerNameMessage extends Message {
    constructor(public name: string) {
        super('SetPlayerNameMessage');
        this.name = name;
    }
}
