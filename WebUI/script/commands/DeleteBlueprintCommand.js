const DeleteBlueprintCommand = function (gameObjectTransferData) {

	Command.call(this);

	this.type = 'DeleteBlueprintCommand';
	this.name = 'Delete Blueprint';
	this.gameObjectTransferData = gameObjectTransferData;
};

DeleteBlueprintCommand.prototype = {

	execute: function () {
		let gameObjectTransferData = new GameObjectTransferData({
			'guid': this.gameObjectTransferData.guid
		});
		editor.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData)) // the lua side doesnt need the gameObjectTransferData just to delete the object, so we save memory
	},

	undo: function () {
		editor.vext.SendCommand(new VextCommand("UndeleteBlueprintCommand", this.gameObjectTransferData))
	},
};

