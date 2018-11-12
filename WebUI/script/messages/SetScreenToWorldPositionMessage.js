class SetScreenToWorldPositionMessage {
	constructor(guid, position) {
		this.type = "SetScreenToWorldPositionMessage";
		this.guid = guid;
		this.position = position;
	}
}