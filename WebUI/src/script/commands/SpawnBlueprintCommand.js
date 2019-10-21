import Command from "../libs/three/Command";
export default class SpawnBlueprintCommand extends Command {
	constructor(gameObjectTransferData) {
		super();
		this.type = 'SpawnBlueprintCommand';
		this.name = 'Spawn Blueprint: ' + gameObjectTransferData.name;
		this.gameObjectTransferData = gameObjectTransferData;
	}

	execute() {
		editor.vext.SendCommand(new VextCommand(this.type, this.gameObjectTransferData))
	}

	undo() {
		let gameObjectTransferData = new GameObjectTransferData({
			'guid': this.gameObjectTransferData.guid,
		});
		editor.vext.SendCommand(new VextCommand("DestroyBlueprintCommand", gameObjectTransferData))
	}
}

