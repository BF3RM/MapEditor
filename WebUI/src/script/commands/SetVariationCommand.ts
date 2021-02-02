import Command from '../libs/three/Command';
import { LogError } from '@/script/modules/Logger';
import { TransferData } from '@/script/types/TransferData';
import { VextCommand } from '@/script/types/VextCommand';

export default class SetVariationCommand extends Command {
	constructor(private gameObjectTransferData: TransferData, private newVariationKey: number) {
		super('SetVariationCommand');
		this.name = 'Set Variation';
	}

	public execute() {
		const gameObjectTransferData = new TransferData({
			guid: this.gameObjectTransferData.guid,
			variation: this.newVariationKey
		});

		window.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData));
	}

	public undo() {
		const gameObjectTransferData = new TransferData({
			guid: this.gameObjectTransferData.guid,
			variation: this.gameObjectTransferData.variation
		});

		window.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData));
	}
}
