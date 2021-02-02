import { VextCommand } from '@/script/types/VextCommand';
import Command from '@/script/libs/three/Command';
import { TransferData } from '@/script/types/TransferData';

export default class DisableBlueprintCommand extends Command {
	constructor(private gameObjectTransferData: TransferData) {
		super('DisableBlueprintCommand');
		this.name = 'Disable Blueprint';
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
		window.vext.SendCommand(new VextCommand('EnableBlueprintCommand', gameObjectTransferData));
	}
}
