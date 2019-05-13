class Group {
	constructor(gameObjectData)
	{
		this.guid = guid;
		this.type = "Group";
		this.selected = false;
		this.gameObjectData = gameObjectData;
	}

	Select() {
		this.onSelected();
	}
	Deselect() {
		this.onDeselected();
	}

	onSelected() {
		this.selected = true;
	}

	onDeselected() {
		this.selected = false;
	}

}