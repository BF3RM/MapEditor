/**
 * @author dforrer / https://github.com/dforrer
 * Developed as part of a project at University of Applied Sciences and Arts Northwestern Switzerland (www.fhnw.ch)
 */

/**
 * @param editorRef pointer to main editor object used to initialize
 *        each command object with a reference to the editor
 * @constructor
 */

export default class Command {
	public id: number;
	public inMemory: boolean;
	public updatable: boolean;
	public timeStamp: number;
	// Identifies "the same edit continuing" for History's merge window: two consecutive updatable
	// commands with an equal, defined mergeKey collapse into one history entry. Undefined (the
	// default) never merges.
	public mergeKey?: string;

	constructor(public type: string = '', public name: string = '') {
		this.id = -1;
		this.inMemory = false;
		this.updatable = false;
		this.timeStamp = Date.now();
	}

	/** Fold a newer command of the same mergeKey into this one (keeps this command's undo value). */
	public update(_cmd: Command) {
		console.log('missing update action');
	}

	public execute() {
		console.log('missing execute action');
	}
	public undo() {
		console.log('missing undo action');
	}
}
