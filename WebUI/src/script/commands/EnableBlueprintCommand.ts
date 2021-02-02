import { TransferData } from '@/script/types/TransferData';
import { VextCommand } from '@/script/types/VextCommand';
import Command from '@/script/libs/three/Command';

export default class EnableBlueprintCommand extends Command {
	constructor(public gameObjectTransferData: TransferData) {
		super('EnableBlueprintCommand');
		this.name = 'Enable Blueprint';
	}

	public execute() {
		const gameObjectTransferData = new TransferData({
			guid: this.gameObjectTransferData.guid
		});
		window.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData));
	}

	public undo() {
		const gameObjectTransferData = new TransferData({
			guid: this.gameObjectTransferData.guid
		});
		window.vext.SendCommand(new VextCommand('DisableBlueprintCommand', gameObjectTransferData));
	}
}
