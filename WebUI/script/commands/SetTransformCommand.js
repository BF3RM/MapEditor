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

var SetTransformCommand = function (guid, newTransform, oldTransform ) {

    Command.call( this );

    this.type = 'SetTransformCommand';
    this.name = 'Set transform';

    this.guid = guid;

    this.newTransform = newTransform;
	this.oldTransform = oldTransform;

};


SetTransformCommand.prototype = {

	execute: function () {
		let s_Parameters = {
			'transform': this.newTransform
		};
		editor.vext.SendCommand(new VextCommand(this.guid, this.type, s_Parameters))
	},

	undo: function () {
		let s_Parameters = {
			'transform': this.oldTransform
		};
		editor.vext.SendCommand(new VextCommand(this.guid, this.type, s_Parameters))
	},
};