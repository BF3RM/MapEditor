class SetPlayerNameMessage {
	constructor(guid, name) {
		this.type = "SetPlayerNameMessage";
		this.guid = guid;
		this.name = name;
	}
}