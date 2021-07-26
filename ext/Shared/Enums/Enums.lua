CameraMode = {
	FirstPerson = 1,
	FreeCam = 2,
	Orbital = 3,
	Editor = 4
}

RaycastType = {
	Camera = 1,
	Mouse = 2
}

GameObjectOriginType = {
	Vanilla = 1,
	Custom = 2,
	CustomChild = 3
}

EditorMode = {
	Loading = 1,
	Editor = 2,
	Playing = 3,
	FreeCam = 4
}

CARResponseType = {
	Success = 1,
	Failure = 2,
	Queue = 3
}

CommandActionType = {
	SpawnGameObjectCommand = "SpawnGameObjectCommand",
	DeleteGameObjectCommand = "DeleteGameObjectCommand",
	UndeleteGameObjectCommand = "UndeleteGameObjectCommand",
	SetTransformCommand = "SetTransformCommand",
	SelectGameObjectCommand = "SelectGameObjectCommand",
	EnableGameObjectCommand = "EnableGameObjectCommand",
	DisableGameObjectCommand = "DisableGameObjectCommand",
	SetVariationCommand = "SetVariationCommand",
	SetEBXFieldCommand = "SetEBXFieldCommand",
	SetObjectNameCommand = "SetObjectNameCommand",
}

CARType = {
	SpawnedGameObject = "SpawnedGameObject",
	DeletedGameObject = "DeletedGameObject",
	UndeletedGameObject = "UndeletedGameObject",
	EnabledGameObject = "EnabledGameObject",
	DisabledGameObject = "DisabledGameObject",
	SelectedGameObject = "SelectedGameObject",
	SetTransform = "SetTransform",
	SetVariation = "SetVariation",
	SetField = "SetField"
}

CoroutineState = {
	Scheduled = "scheduled",
	Suspended = "suspended",
	Running = "running",
	Dead = "dead"
}
