import Command from '@/script/libs/three/Command';
import { TransferData } from '@/script/types/TransferData';
import { VextCommand } from '@/script/types/VextCommand';

export default class SetObjectNameCommand extends Command {
	constructor(private gameObjectTransferData: TransferData, private newGameObjectName: string) {
		super('SetObjectNameCommand');
		this.name = 'Set Object Name';
	}

	public execute() {
		const gameObjectTransferData = new TransferData({
			guid: this.gameObjectTransferData.guid,
			name: this.newGameObjectName
		});
		window.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData));
	}

	public undo() {
		const gameObjectTransferData = new TransferData({
			guid: this.gameObjectTransferData.guid,
			name: this.gameObjectTransferData.name
		});
		window.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData));
	}
}
