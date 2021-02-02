import Command from '../libs/three/Command';
import { TransferData } from '@/script/types/TransferData';
import { VextCommand } from '@/script/types/VextCommand';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';

export class SetTransformCommand extends Command {
	constructor(private gameObjectTransferData: TransferData, private newTransform: LinearTransform) {
		super('SetTransformCommand');
		this.name = 'Set transform';
	}

	public execute() {
		const gameObjectTransferData = new TransferData({
			guid: this.gameObjectTransferData.guid,
			transform: this.newTransform
		});
		window.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData));
	}

	public undo() {
		const gameObjectTransferData = new TransferData({
			guid: this.gameObjectTransferData.guid,
			transform: this.gameObjectTransferData.transform
		});
		window.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData));
	}
}
