import Command from "../libs/three/Command";

export default class BulkCommand extends Command {
	constructor(commands) {
		super();
		this.type = 'BulkCommand';
		this.name = 'Bulk command ' + commands[0].name;
		this.commands = commands;
	}

	execute() {
		editor.vext.Pause();
		this.commands.forEach(function(command) {
			command.execute();
		});
		editor.vext.Resume();
	}

	undo() {
		editor.vext.Pause();
		this.commands.forEach(function(command) {
			command.undo();
		});
		editor.vext.Resume();
	}
};
