let Signal = signals.Signal;
var signals = {
    editorInitializing: new Signal(),
    editorReady: new Signal(),

	levelLoaded: new Signal(),
	// Object actions
	windowResized: new Signal(),

	spawnBlueprintRequested: new Signal(),

	spawnedBlueprint: new Signal(),
	blueprintSpawnInvoked: new Signal(),
	destroyedBlueprint: new Signal(),

	enabledBlueprint: new Signal(),
	disabledBlueprint: new Signal(),

	createGroupRequested: new Signal(),
	createdGroup: new Signal(),
	destroyedGroup: new Signal(),

	selectionGroupMoved: new Signal(),

	selectedGameObject: new Signal(),
	deselectedGameObject: new Signal(),

	setTransform: new Signal(),
	folderSelected: new Signal(),
	folderFiltered: new Signal(),

	objectMoveStarted: new Signal(),
	objectMoved: new Signal(),
	objectMoveEnded: new Signal(),

	objectSelected: new Signal(),
	objectDeselected: new Signal(),

	objectFocused: new Signal(),

	objectAdded: new Signal(),
	objectChanged: new Signal(),
	objectRemoved: new Signal(),

	favoriteAdded: new Signal(),
	favoriteRemoved: new Signal(),
	favoritesChanged: new Signal(),

	setObjectName: new Signal(),
	setVariation: new Signal(),

	setCameraTransform: new Signal(),
	setRaycastPosition: new Signal(),
	setPlayerName: new Signal(),
	setScreenToWorldPosition: new Signal(),
	setUpdateRateMessage: new Signal(),

	modalShowed: new Signal(),
	modalClosed: new Signal(),
	modalConfirmed: new Signal(),

	blueprintsRegistered: new Signal(),

	windowRegistered: new Signal(),

	historyChanged: new Signal()

};