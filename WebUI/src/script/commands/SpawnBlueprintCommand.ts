import Command from '../libs/three/Command';
import {GameObjectTransferData} from '@/script/types/GameObjectTransferData';
import {VextCommand} from '@/script/types/VextCommand';
export default class SpawnBlueprintCommand extends Command {
	constructor(public gameObjectTransferData: GameObjectTransferData) {
		super();
		this.type = 'SpawnBlueprintCommand';
		this.name = 'Spawn Blueprint: ' + gameObjectTransferData.name;
	}

	public execute() {
		editor.vext.SendCommand(new VextCommand(this.type, this.gameObjectTransferData));
	}

	public undo() {
		const gameObjectTransferData = new GameObjectTransferData({
			guid: this.gameObjectTransferData.guid,
		});
		editor.vext.SendCommand(new VextCommand('DestroyBlueprintCommand', gameObjectTransferData));
	}
}

