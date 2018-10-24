let Signal = signals.Signal;
var signals = {

    // Object actions
    spawnBlueprintRequested: new Signal(),

    spawnedBlueprint: new Signal(),
	destroyedBlueprint: new Signal(),

    selectedEntity: new Signal(),
    deselectedEntity: new Signal(),

    setTransform: new Signal(),


    objectMoveStarted: new Signal(),
    objectMoved: new Signal(),
    objectMoveEnded: new Signal(),

    objectSelected: new Signal(),
    objectDeselected: new Signal(),

    objectFocused: new Signal(),

    objectAdded: new Signal(),
    objectChanged: new Signal(),
    objectRemoved: new Signal(),

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