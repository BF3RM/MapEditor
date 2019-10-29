import Command from '@/script/libs/three/Command';
import { GameObjectTransferData } from '@/script/types/GameObjectTransferData';
import { VextCommand } from '@/script/types/VextCommand';

export default class SetObjectNameCommand extends Command {
    constructor(private gameObjectTransferData: GameObjectTransferData, private newGameObjectName: string) {
        super('SetObjectNameCommand');
        this.name = 'Set Object Name';
    }
    public execute() {
        const gameObjectTransferData = new GameObjectTransferData({
            guid: this.gameObjectTransferData.guid,
            name: this.newGameObjectName
        });
        editor.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData));
    }

    public undo() {
        const gameObjectTransferData = new GameObjectTransferData({
            guid: this.gameObjectTransferData.guid,
            name: this.gameObjectTransferData.name
        });
        editor.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData));
    }
}
