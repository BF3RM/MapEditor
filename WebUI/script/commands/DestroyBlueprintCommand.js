const DestroyBlueprintCommand = function (gameObjectTransferData) {

	Command.call(this);

	this.type = 'DestroyBlueprintCommand';
	this.name = 'Destroy Blueprint';
	this.gameObjectTransferData = gameObjectTransferData;
};

DestroyBlueprintCommand.prototype = {

	execute: function () {
		let gameObjectTransferData = new GameObjectTransferData({
			'guid': this.gameObjectTransferData.guid
		});
		editor.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData)) // the lua side doesnt need the gameObjectTransferData just to delete the object, so we save memory
	},

	undo: function () {
		editor.vext.SendCommand(new VextCommand("SpawnBlueprintCommand", this.gameObjectTransferData))
	},
};

