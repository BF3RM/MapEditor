class Group {
	constructor(guid, userData)
	{
		this.guid = guid;
		this.type = "Group";
		this.selected = false;
		this.userData = userData;
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