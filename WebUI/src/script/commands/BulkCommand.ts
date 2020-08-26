import Command from '../libs/three/Command';

export default class BulkCommand extends Command {
	constructor(public commands: Command[]) {
		super('BulkCommand');
		this.name = 'Bulk command ' + commands[0].name;
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
