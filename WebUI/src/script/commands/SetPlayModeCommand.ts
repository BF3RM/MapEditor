import Command from '@/script/libs/three/Command';
import { GameObjectTransferData } from '@/script/types/GameObjectTransferData';
import { VextCommand } from '@/script/types/VextCommand';
import { PLAY_MODE } from '@/script/types/Enums';

export default class SetPlayModeCommand extends Command {
	constructor(public playMode: PLAY_MODE) {
		super('SetPlayModeCommand');
		this.name = 'Set play mode';
	}

	public execute() {
		const gameObjectTransferData = new GameObjectTransferData({
			playMode: this.playMode
		});
		window.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData));
	}

	public undo() {
		// const gameObjectTransferData = new GameObjectTransferData({
		// 	guid: this.gameObjectTransferData.guid,
		// 	name: this.gameObjectTransferData.name
		// });
		// window.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData));
	}
}
