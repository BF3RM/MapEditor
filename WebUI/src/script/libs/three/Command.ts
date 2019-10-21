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
	id: number;
	inMemory:boolean;
	updatable:boolean;
	type:string;
	name:string;

	constructor(name: string = '', type: string = '') {

		this.id = -1;
		this.inMemory = false;
		this.updatable = false;
		this.type = name;
		this.name = type;
	}
}
