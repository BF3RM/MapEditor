const SpawnBlueprintCommand = function (gameObjectTransferData) {

	Command.call(this);

	this.type = 'SpawnBlueprintCommand';
	this.name = 'Spawn Blueprint: ' + gameObjectTransferData.name;
	this.gameObjectTransferData = gameObjectTransferData
};


SpawnBlueprintCommand.prototype = {

	execute: function () {
		editor.vext.SendCommand(new VextCommand(this.type, this.gameObjectTransferData))
	},

	undo: function () {
		let gameObjectTransferData = new GameObjectTransferData({
			'guid': this.gameObjectTransferData.guid,
		});
		editor.vext.SendCommand(new VextCommand("DeleteBlueprintCommand", gameObjectTransferData))
	},
};

