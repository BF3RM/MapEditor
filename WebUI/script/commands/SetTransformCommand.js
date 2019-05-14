const SetTransformCommand = function (gameObjectTransferData, newTransform) {

	Command.call( this );

	this.type = 'SetTransformCommand';
	this.name = 'Set transform';
	this.gameObjectTransferData = gameObjectTransferData;
	this.newTransform = newTransform;
};

SetTransformCommand.prototype = {
	execute: function () {
		let gameObjectTransferData = new GameObjectTransferData({
			'guid': this.gameObjectTransferData.guid,
			'transform': this.newTransform
		});
		editor.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData))
	},

	undo: function () {
		let gameObjectTransferData = new GameObjectTransferData({
			'guid': this.gameObjectTransferData.guid,
			'transform': this.gameObjectTransferData.transform
		});
		editor.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData))
	},
};