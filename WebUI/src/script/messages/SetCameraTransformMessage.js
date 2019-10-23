export class SetCameraTransformMessage {
	constructor(transform) {
		this.type = "SetCameraTransformMessage";
		this.transform = transform;
	}
}