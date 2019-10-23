export class SetScreenToWorldTransformMessage {
	constructor(direction) {
		this.type = "SetScreenToWorldPositionMessage";
		this.direction = direction;
	}
}