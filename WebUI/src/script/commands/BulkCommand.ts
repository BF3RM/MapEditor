import Command from '../libs/three/Command';

export default class BulkCommand extends Command {
	constructor(public commands: Command[]) {
		super('BulkCommand');
		// commands can be empty (e.g. Paste with an empty copy buffer, or a selection that
		// produced no spawn commands). Reading commands[0].name in that case threw
		// "Cannot read properties of undefined (reading 'name')" and killed the paste.
		this.name = 'Bulk command ' + (commands.length > 0 ? commands[0].name : '(empty)');
	}

	public execute() {
		window.vext.Pause();
		this.commands.forEach((command) => {
			command.execute();
		});
		window.vext.Resume();
	}

	public undo() {
		window.vext.Pause();
		this.commands.forEach((command) => {
			command.undo();
		});
		window.vext.Resume();
	}
}
