class Group {
	constructor(guid = GenerateGuid(), name = "New Group")
	{
		this.guid = guid;
		this.type = "Group";
		this.name = name;
		this.selected = false;
		this.children = [];
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