import Command from '../libs/three/Command';
import SpawnBlueprintCommand from '@/script/commands/SpawnBlueprintCommand';

export default class BulkCommand extends Command {
	constructor(public commands: Command[] | SpawnBlueprintCommand[]) {
		super('BulkCommand');
		this.name = 'Bulk command ' + commands[0].name;
	}

	public execute() {
		editor.vext.Pause();
		this.commands.forEach(function (command) {
			command.execute();
		});
		editor.vext.Resume();
	}

	public undo() {
		editor.vext.Pause();
		this.commands.forEach(function (command) {
			command.undo();
		});
		editor.vext.Resume();
	}
}
