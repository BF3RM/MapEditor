import { VextCommand } from '@/script/types/VextCommand';
import Command from '@/script/libs/three/Command';
import { GameObjectTransferData } from '@/script/types/GameObjectTransferData';

export default class DisableBlueprintCommand extends Command {
	constructor(private gameObjectTransferData: GameObjectTransferData) {
		super('DisableBlueprintCommand');
		this.name = 'Disable Blueprint';
	}

	public execute() {
		const gameObjectTransferData = new GameObjectTransferData({
			guid: this.gameObjectTransferData.guid
		});
		window.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData));
	}

	public undo() {
		const gameObjectTransferData = new GameObjectTransferData({
			guid: this.gameObjectTransferData.guid
		});
		window.vext.SendCommand(new VextCommand('EnableBlueprintCommand', gameObjectTransferData));
	}
}
