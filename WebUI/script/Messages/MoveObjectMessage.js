class MoveObjectMessage {
	constructor(guid, transform) {
		this.type = "MoveObjectMessage";
		this.guid = guid;
		this.transform = transform;
	}
}