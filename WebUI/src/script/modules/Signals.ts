import { Signal } from 'typed-signals';
import { CommandActionResult } from '@/script/types/CommandActionResult';
import { Guid } from '@/script/types/Guid';

import { GameObject } from '@/script/types/GameObject';
import { EDITOR_MODE, GIZMO_MODE, VIEW, WORLD_SPACE } from '@/script/types/Enums';

export const signals = {
	editor: {
		Initializing: new Signal(),
		Ready: new Signal()
	},

	menuRegistered: new Signal(),
	onLog: new Signal(),

	levelLoaded: new Signal(),
	// Object actions
	windowResized: new Signal(),

	spawnBlueprintRequested: new Signal(),
	getProjects: new Signal(),
	setProjectHeaders: new Signal(),

	gizmoModeChanged: new Signal<(mode: GIZMO_MODE) => void>(),
	worldSpaceChanged: new Signal<(mode: WORLD_SPACE) => void>(),
	objectChanged: new Signal<(gameObject: GameObject, field: string, value: any) => void>(),

	spawnedBlueprint: new Signal<(result: CommandActionResult) => void>(),
	blueprintSpawnInvoked: new Signal(),
	deletedBlueprint: new Signal(),

	enabledBlueprint: new Signal(),
	disabledBlueprint: new Signal(),

	createGroupRequested: new Signal(),
	createdGroup: new Signal(),
	deletedGroup: new Signal(),

	selectedGameObject: new Signal<(guid: Guid, isMultiSelection?:boolean) => void>(),
	deselectedGameObject: new Signal<(guid: Guid) => void>(),

	selectionGroupChanged: new Signal(),

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

	historyChanged: new Signal(),
	setActiveView: new Signal<(mode: VIEW) => void>()
};
