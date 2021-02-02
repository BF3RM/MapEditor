import Command from '../libs/three/Command';
import { TransferData } from '@/script/types/TransferData';
import { VextCommand } from '@/script/types/VextCommand';

export default class SpawnBlueprintCommand extends Command {
	constructor(public gameObjectTransferData: TransferData) {
		super('SpawnBlueprintCommand');
		this.name = 'Spawn Blueprint: ' + gameObjectTransferData.name;
	}

	public execute() {
		window.vext.SendCommand(new VextCommand(this.type, this.gameObjectTransferData));
	}

	public undo() {
		const gameObjectTransferData = new TransferData({
			guid: this.gameObjectTransferData.guid
		});
		window.vext.SendCommand(new VextCommand('DeleteBlueprintCommand', gameObjectTransferData));
	}
}
