import Command from "../libs/three/Command";

export default class SetVariationCommand extends Command {
	constructor(gameObjectTransferData, newVariationKey) {
		super();
		this.type = 'SetVariationCommand';
		this.name = 'Set Variation';
		this.gameObjectTransferData = gameObjectTransferData;
		this.newVariationKey = newVariationKey;

		if (newVariationKey === undefined) {
			LogError("Missing variationKey");
		}
	}

	execute() {
		let gameObjectTransferData = new GameObjectTransferData({
			'guid': this.gameObjectTransferData.guid,
			'variation': this.newVariationKey
		});

		editor.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData))
	}

	undo() {
		let gameObjectTransferData = new GameObjectTransferData({
			'guid': this.gameObjectTransferData.guid,
			'variation': this.gameObjectTransferData.variation
		});

		editor.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData))
	}
};
