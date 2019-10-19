const SetVariationCommand = function (gameObjectTransferData, newVariationKey) {

	Command.call(this);

	this.type = 'SetVariationCommand';
	this.gameObjectTransferData = gameObjectTransferData;
	this.newVariationKey = newVariationKey;

	if (newVariationKey === undefined) {
		LogError("Missing variationKey");
		return;
	}
};


SetVariationCommand.prototype = {
	execute: function () {
		let gameObjectTransferData = new GameObjectTransferData({
			'guid': this.gameObjectTransferData.guid,
			'variation': this.newVariationKey
		});

		editor.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData))
	},

	undo: function () {
		let gameObjectTransferData = new GameObjectTransferData({
			'guid': this.gameObjectTransferData.guid,
			'variation': this.gameObjectTransferData.variation
		});

		editor.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData))
	},
};
