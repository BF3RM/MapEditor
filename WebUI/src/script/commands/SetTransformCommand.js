import Command from "../libs/three/Command";
export default class SetTransformCommand extends Command {
	constructor (gameObjectTransferData, newTransform) {
		super();
		this.type = 'SetTransformCommand';
		this.name = 'Set transform';
		this.gameObjectTransferData = gameObjectTransferData;
		this.newTransform = newTransform;
	}
	execute() {
		let gameObjectTransferData = new GameObjectTransferData({
			'guid': this.gameObjectTransferData.guid,
			'transform': this.newTransform
		});
		editor.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData))
	}

	undo() {
		let gameObjectTransferData = new GameObjectTransferData({
			'guid': this.gameObjectTransferData.guid,
			'transform': this.gameObjectTransferData.transform
		});
		editor.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData))
	}
};
