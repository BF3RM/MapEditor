const SetVariationCommand = function (guid, variationKey) {

	Command.call(this);

	this.type = 'SetVariationCommand';
	this.guid = guid;
	this.newVariationKey = variationKey;

	if (variationKey === undefined) {
		LogError("Missing variationKey");
		return;
	}

	let gameObject = editor.getGameObjectByGuid(guid);

	if (gameObject == null) {
		LogError("Tried setting variation for a GameObject that doesnt exist.");
		return;
	}

	if(gameObject.gameObjectData == null) {
		LogError("Attempted to set the variation for a GameObject without gameObjectData")
	} else {
		this.oldVariationKey = gameObjectData.variation;
	}
};


SetVariationCommand.prototype = {
	execute: function () {
		let gameObjectData = {
			'guid': this.guid,
			'variation': this.newVariationKey
		};

		editor.vext.SendCommand(new VextCommand(this.type, gameObjectData))
	},

	undo: function () {
		let gameObjectData = {
			'guid': this.guid,
			'variation': this.oldVariationKey
		};

		editor.vext.SendCommand(new VextCommand(this.type, gameObjectData))
	},
};
