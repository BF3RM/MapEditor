import { VextCommand } from '@/script/types/VextCommand';
import Command from '@/script/libs/three/Command';
import { GameObjectTransferData } from '@/script/types/GameObjectTransferData';

export default class DisableBlueprintCommand extends Command {
    constructor(private gameObjectTransferData:GameObjectTransferData) {
        super('DisableBlueprintCommand');
        this.name = 'Disable Blueprint';
    }

    execute() {
        let gameObjectTransferData = new GameObjectTransferData({
            'guid': this.gameObjectTransferData.guid
        });
        editor.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData));
    }

    undo() {
        let gameObjectTransferData = new GameObjectTransferData({
            'guid': this.gameObjectTransferData.guid
        });
        editor.vext.SendCommand(new VextCommand('EnableBlueprintCommand', gameObjectTransferData));
    }
}
