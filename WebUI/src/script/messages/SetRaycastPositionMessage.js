export class SetRaycastPositionMessage {
	constructor(position) {
		this.type = "SetRaycastPositionMessage";
		this.position = position;
	}
}