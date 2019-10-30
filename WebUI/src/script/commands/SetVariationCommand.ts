import Command from '../libs/three/Command';
import { LogError } from '@/script/modules/Logger';
import { GameObjectTransferData } from '@/script/types/GameObjectTransferData';
import { VextCommand } from '@/script/types/VextCommand';

export default class SetVariationCommand extends Command {
	constructor(private gameObjectTransferData: GameObjectTransferData, private newVariationKey: number) {
		super('SetVariationCommand');
		this.name = 'Set Variation';
	}

	public execute() {
		const gameObjectTransferData = new GameObjectTransferData({
			guid: this.gameObjectTransferData.guid,
			variation: this.newVariationKey,
		});

		editor.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData));
	}

	public undo() {
		const gameObjectTransferData = new GameObjectTransferData({
			guid: this.gameObjectTransferData.guid,
			variation: this.gameObjectTransferData.variation,
		});

		editor.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData));
	}
}
