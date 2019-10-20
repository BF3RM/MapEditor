const SetObjectNameCommand = function (gameObjectTransferData, newGameObjectName) {

	Command.call(this);

	this.type = 'SetObjectNameCommand';
	this.name = 'Set Object Name';
	this.gameObjectTransferData = gameObjectTransferData;
	this.newGameObjectName = newGameObjectName
};


SetObjectNameCommand.prototype = {

	execute: function () {
		let gameObjectTransferData = new GameObjectTransferData({
			'guid': this.gameObjectTransferData.guid,
			'name': this.newGameObjectName
		});
		editor.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData))
	},

	undo: function () {
		let gameObjectTransferData = new GameObjectTransferData({
			'guid': this.gameObjectTransferData.guid,
			'name': this.gameObjectTransferData.name
		});
		editor.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData))
	},
};
