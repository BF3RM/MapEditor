class SetViewModeMessage {
	constructor(viewMode) {
		this.type = "SetViewModeMessage";
		this.guid = GenerateGuid();
		this.viewMode = viewMode;
	}
}