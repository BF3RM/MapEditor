import Command from '../libs/three/Command';
import { GameObjectTransferData } from '@/script/types/GameObjectTransferData';
import { VextCommand } from '@/script/types/VextCommand';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';
export class SetTransformCommand extends Command {
    constructor(private gameObjectTransferData: GameObjectTransferData, private newTransform: LinearTransform) {
        super('SetTransformCommand');
        this.name = 'Set transform';
    }
    public execute() {
        const gameObjectTransferData = new GameObjectTransferData({
            guid: this.gameObjectTransferData.guid,
            transform: this.newTransform
        });
        editor.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData));
    }

    public undo() {
        const gameObjectTransferData = new GameObjectTransferData({
            guid: this.gameObjectTransferData.guid,
            transform: this.gameObjectTransferData.transform
        });
        editor.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData));
    }
}
