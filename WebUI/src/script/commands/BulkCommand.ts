import Command from '../libs/three/Command';

export default class BulkCommand extends Command {
	constructor(public commands: Command[]) {
		super('BulkCommand');
		this.name = 'Bulk command ' + commands[0].name;
	}

	public execute() {
		editor.vext.Pause();
		this.commands.forEach((command) => {
			command.execute();
		});
		editor.vext.Resume();
	}

	public undo() {
		editor.vext.Pause();
		this.commands.forEach((command) => {
			command.undo();
		});
		editor.vext.Resume();
	}
}