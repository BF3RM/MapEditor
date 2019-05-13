const SetTransformCommand = function (guid, newTransform) {

	Command.call( this );

	this.type = 'SetTransformCommand';
	this.name = 'Set transform';
	this.guid = guid;
	this.newTransform = newTransform;

	let gameObject = editor.getGameObjectByGuid(guid);

	if(gameObject === undefined) {
		LogError("Attempted to set name for null GameObject");
	} else {
		this.oldTransform = gameObject.gameObjectData.transform.clone()
	}
};

SetTransformCommand.prototype = {
	execute: function () {
		let gameObjectData = {
			'guid': this.guid,
			'transform': this.newTransform
		};
		editor.vext.SendCommand(new VextCommand(this.type, gameObjectData))
	},

	undo: function () {
		let gameObjectData = {
			'guid': this.guid,
			'transform': this.oldTransform
		};
		editor.vext.SendCommand(new VextCommand(this.type, gameObjectData))
	},
};