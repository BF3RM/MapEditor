import Command from "../libs/three/Command";

export default class DestroyBlueprintCommand extends Command {
	constructor(gameObjectTransferData) {
		super();
		this.type = 'DestroyBlueprintCommand';
		this.name = 'Destroy Blueprint';
		this.gameObjectTransferData = gameObjectTransferData;
	}

	execute() {
		let gameObjectTransferData = new GameObjectTransferData({
			'guid': this.gameObjectTransferData.guid
		});
		editor.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData)) // the lua side doesnt need the gameObjectTransferData just to delete the object, so we save memory
	}

	undo() {
		editor.vext.SendCommand(new VextCommand("SpawnBlueprintCommand", this.gameObjectTransferData))
	}
};

