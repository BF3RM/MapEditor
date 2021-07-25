import Command from '../libs/three/Command';
import { GameObjectTransferData } from '@/script/types/GameObjectTransferData';
import { VextCommand } from '@/script/types/VextCommand';

export default class SpawnGameObjectCommand extends Command {
	constructor(public gameObjectTransferData: GameObjectTransferData) {
		super('SpawnGameObjectCommand');
		this.name = 'Spawn GameObject: ' + gameObjectTransferData.name;
	}

	public execute() {
		window.vext.SendCommand(new VextCommand(this.type, this.gameObjectTransferData));
	}

	public undo() {
		const gameObjectTransferData = new GameObjectTransferData({
			guid: this.gameObjectTransferData.guid
		});
		window.vext.SendCommand(new VextCommand('DeleteGameObjectCommand', gameObjectTransferData));
	}
}
