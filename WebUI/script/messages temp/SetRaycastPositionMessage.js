class SetRaycastPositionMessage {
	constructor(guid, position) {
		this.type = "SetRaycastPositionMessage";
		this.guid = guid;
		this.position = position;
	}
}