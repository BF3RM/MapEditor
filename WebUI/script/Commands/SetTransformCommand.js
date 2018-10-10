/**
 * @author dforrer / https://github.com/dforrer
 * Developed as part of a project at University of Applied Sciences and Arts Northwestern Switzerland (www.fhnw.ch)
 */

/**
 * @param object GameObject
 * @param newPosition Vec3
 * @param optionalOldPosition Vec3
 * @constructor
 */

var SetTransformCommand = function (guid, newPosition, oldPosition ) {

    Command.call( this );

    this.type = 'SetTransformCommand';
    this.name = 'Set transform';

    this.guid = guid;

    this.newPosition = newPosition;
	this.oldPosition = oldPosition;


};


SetTransformCommand.prototype = {

	execute: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, this.type, this.newPosition))
	},

	undo: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, this.type, this.oldPosition))
	},
};