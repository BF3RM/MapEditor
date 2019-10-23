export class SetPlayerNameMessage {
	constructor(name) {
		this.type = "SetPlayerNameMessage";
		this.name = name;
	}
}