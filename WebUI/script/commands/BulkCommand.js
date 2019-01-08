const BulkCommand = function (commands) {

	Command.call(this);

	this.type = 'BulkCommand';
	this.name = 'Bulk command';
	this.commands = commands;
};


BulkCommand.prototype = {

	execute: function () {
		editor.vext.Pause();
		this.commands.forEach(function(command) {
			command.execute();
		});
		editor.vext.Resume();
	},

	undo: function () {
		editor.vext.Pause();
		this.commands.forEach(function(command) {
			command.undo();
		});
		editor.vext.Resume();
	},
};