class SetCameraTransformMessage {
	constructor(guid, transform) {
		this.type = "SetCameraTransformMessage";
		this.guid = guid;
		this.transform = transform;
	}
}