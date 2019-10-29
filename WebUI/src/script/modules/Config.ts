import { Guid } from 'guid-typescript';

export class Config {
	public PreviewGameObjectGuid: Guid;
	constructor() {
	    this.PreviewGameObjectGuid = Guid.parse('ed170120-0000-0000-0000-000000000000');
	}
}
