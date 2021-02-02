import * as Collections from 'typescript-collections';

import { Guid } from '@/script/types/Guid';
import Command from './libs/three/Command';
import SpawnBlueprintCommand from './commands/SpawnBlueprintCommand';
import BulkCommand from './commands/BulkCommand';
import DeleteBlueprintCommand from './commands/DeleteBlueprintCommand';
import History from './libs/three/History';
import GameContext from './modules/GameContext';
import VEXTInterface from './modules/VEXT';

import { GameObjectParentData } from './types/GameObjectParentData';
import { BlueprintManager } from './modules/BlueprintManager';
import { EditorUI } from './modules/EditorUI';
import { SelectionGroup } from './types/SelectionGroup';
import { Config } from './modules/Config';
import { Blueprint } from './types/Blueprint';
import { THREEManager } from './modules/THREEManager';
import { EditorCore } from './EditorCore';
import { SpatialGameEntity } from './types/SpatialGameEntity';
import { CommandActionResult } from './types/CommandActionResult';
import { TransferData } from './types/TransferData';
import { GameObject } from './types/GameObject';
import { FrostbiteDataManager } from './modules/FrostbiteDataManager';
import { LinearTransform } from './types/primitives/LinearTransform';
import { Vec3 } from './types/primitives/Vec3';
import { signals } from '@/script/modules/Signals';
import { EDITOR_MODE, REALM } from '@/script/types/Enums';
import DisableBlueprintCommand from '@/script/commands/DisableBlueprintCommand';
import EnableBlueprintCommand from '@/script/commands/EnableBlueprintCommand';

export default class Editor {
	public config = new Config();
	public editorCore = new EditorCore();
	public debug: boolean;
	public threeManager: THREEManager;
	public ui: EditorUI;
	public history = new History(this);
	public blueprintManager = new BlueprintManager();
	public gameContext = new GameContext();
	public fbdMan = new FrostbiteDataManager();

	public playerName: string;
	public gameObjects = new Collections.Dictionary<Guid, GameObject>();
	public favorites = new Collections.Dictionary<Guid, Blueprint>();
	public copy: SpawnBlueprintCommand[];

	public selectionGroup: SelectionGroup;
	public missingParent: Collections.Dictionary<Guid, GameObject[]>;
	public test: number = 0;

	constructor(debug: boolean = false) {
		this.debug = debug;
		this.ui = new EditorUI(debug);
		this.threeManager = new THREEManager(debug);

		// Commands
		signals.editor.Ready.connect(this.onEditorReady.bind(this));
		signals.blueprintSpawnInvoked.connect(this.onBlueprintSpawnInvoked.bind(this));
		signals.enabledBlueprint.connect(this.onEnabledBlueprint.bind(this));
		signals.disabledBlueprint.connect(this.onDisabledBlueprint.bind(this));

		signals.deletedBlueprint.connect(this.onDeletedBlueprint.bind(this));
		signals.setObjectName.connect(this.onSetObjectName.bind(this));
		signals.setTransform.connect(this.onSetTransform.bind(this));
		signals.setVariation.connect(this.onSetVariation.bind(this));

		// Messages

		signals.objectChanged.connect(this.onObjectChanged.bind(this));

		/*

			Internal variables

		 */
		// this.selected = [];

		this.playerName = '';

		this.copy = [];

		// Creates selection group and adds them to the scene
		this.selectionGroup = new SelectionGroup();
		this.threeManager.attachToScene(this.selectionGroup);

		this.missingParent = new Collections.Dictionary<Guid, GameObject[]>();
		this.Initialize();
	}

	public Initialize() {
		const scope = this;
		signals.editor.Initializing.emit(true);
		// Adds the chrome background and debug window
		if (this.debug) {
			this.setPlayerName('LocalPlayer');
			setTimeout(() => {
				window.vext.EditorModeChanged(EDITOR_MODE.EDITOR);
			}, 200);
		}
	}

	public onEditorReady() {
		signals.menuRegistered.emit(['Edit', 'Undo'], this.undo.bind(this));
		signals.menuRegistered.emit(['Edit', 'Redo'], this.redo.bind(this));
		signals.menuRegistered.emit(['Edit', '']); // Separator
		signals.menuRegistered.emit(['Edit', 'Cut'], this.Cut.bind(this));
		signals.menuRegistered.emit(['Edit', 'Copy'], this.Copy.bind(this));
		signals.menuRegistered.emit(['Edit', 'Paste'], this.Paste.bind(this));
		signals.menuRegistered.emit(['Edit', '']); // Separator
		signals.menuRegistered.emit(['Edit', 'Duplicate'], this.Duplicate.bind(this));
		signals.menuRegistered.emit(['Edit', 'Delete'], this.DeleteSelected.bind(this));
		signals.menuRegistered.emit(['Edit', '']); // Separator
		if (this.debug) {
			// this.blueprintManager.registerBlueprints(GenerateBlueprints(100));
		} else {
			console.log('Sent event');
		}
	}

	private NotImplemented() {
		console.error('Not implemented');
	}

	public setPlayerName(name: string) {
		if (name === undefined) {
			window.LogError('Failed to set player name');
		} else {
			this.playerName = name;
		}
	}

	public getPlayerName() {
		return this.playerName;
	}

	public AddFavorite(blueprint: Blueprint) {
		this.favorites.setValue(blueprint.instanceGuid, blueprint);
		blueprint.SetFavorite(true);
		signals.favoriteAdded.emit(blueprint);
		signals.favoritesChanged.emit();
	}

	public RemoveFavorite(blueprint: Blueprint) {
		blueprint.SetFavorite(false);
		this.favorites.remove(blueprint.instanceGuid);
		signals.favoriteRemoved.emit(blueprint);
		signals.favoritesChanged.emit();
	}

	public Focus(guid: Guid) {
		let target: GameObject | SelectionGroup | undefined;
		if (guid) {
			target = this.getGameObjectByGuid(guid);
		} else {
			target = this.selectionGroup;
			if ((target).selectedGameObjects.length === 0) {
				return;
			} // Nothing specified, nothing selected. skip.
		}
		if (target === undefined) {
			return;
		}
		this.threeManager.focus(target);
		signals.objectFocused.emit(target);
	}

	public Duplicate() {
		const commands = this.editorCore.CopySelectedObjects();
		this.execute(new BulkCommand(commands));
	}

	public Copy() {
		this.copy = this.editorCore.CopySelectedObjects();
	}

	public Paste() {
		const scope = this;
		if (scope.copy !== null) {
			// Generate a new guid for each command
			scope.copy.forEach((command: SpawnBlueprintCommand) => {
				command.gameObjectTransferData.guid = Guid.create();
			});
			scope.execute(new BulkCommand(scope.copy));
		}
	}

	public Cut() {
		this.Copy();
		this.DeleteSelected();
	}

	public SpawnBlueprint(blueprint: Blueprint, transform?: LinearTransform, variation?: number, parentData?: GameObjectParentData) {
		if (blueprint == null) {
			window.LogError('Tried to spawn a nonexistent blueprint');
			return false;
		}

		if (transform === undefined) {
			transform = this.editorCore.getRaycastTransform();
		}

		if (variation === undefined) {
			variation = blueprint.getDefaultVariation();
		}
		if (parentData === undefined) {
			parentData = new GameObjectParentData(Guid.createEmpty(), 'custom_root', Guid.createEmpty(), Guid.createEmpty());
		}

		// Spawn blueprint
		// window.Log(LOGLEVEL.VERBOSE, 'Spawning blueprint: ' + blueprint.instanceGuid);
		const gameObjectTransferData = new TransferData({
			guid: Guid.create(),
			name: blueprint.name,
			parentData,
			blueprintCtrRef: blueprint.getCtrRef(),
			transform,
			variation,
			isDeleted: false,
			isEnabled: true
		});

		this.execute(new SpawnBlueprintCommand(gameObjectTransferData));
	}

	public UpdateGameObjectRealm(guidString: string, realm: REALM) {
		const guid: Guid = new Guid(guidString);
		const go = this.getGameObjectByGuid(guid);
		if (go) {
			go.setRealm(realm);
		} else {
			console.error('Tried updatig realm of a gameobject that doesn\'t exist. Guid: ' + guidString);
		}
	}

	public DeleteSelected() {
		const scope = this;
		const commands: Command[] = [];
		this.selectionGroup.selectedGameObjects.forEach((selectedGameObject) => {
			if (selectedGameObject) {
				commands.push(new DeleteBlueprintCommand(selectedGameObject.getTransferData()));
			}
		});

		if (commands.length > 0) {
			scope.execute(new BulkCommand(commands));
		}
	}

	public Enable(guid: Guid) {
		const command = new EnableBlueprintCommand(new TransferData({
			guid: guid
		}));
		this.execute(command);
	}

	public Disable(guid: Guid) {
		const command = new DisableBlueprintCommand(new TransferData({
			guid: guid
		}));
		this.execute(command);
	}

	public ToggleRaycastEnabled(guid: Guid, enabled: boolean) {
		const go = this.getGameObjectByGuid(guid);
		if (go) {
			go.raycastEnabled = enabled;
		}
	}

	public getGameObjectByGuid(guid: Guid) {
		return this.gameObjects.getValue(guid);
	}

	public setRaycastPosition(pos: Vec3) {
		this.editorCore.raycastTransform.trans = pos;
	}

	public setScreenToWorldPosition(pos: Vec3) {
		this.editorCore.screenToWorldTransform.trans = pos;
	}

	public setUpdating(value: boolean) {
		this.editorCore.setUpdating(value);
	}

	/*

		Commands

	*/
	public Select(guid: Guid, multiSelection: boolean, scrollTo: boolean = false, moveGizmo: boolean = false) {
		this.editorCore.select(guid, multiSelection, scrollTo, moveGizmo);
	}

	public Deselect(guid: Guid) {
		this.editorCore.deselect(guid);
	}

	public onSetObjectName(commandActionResult: CommandActionResult) {
		const gameObjectTransferData = commandActionResult.gameObjectTransferData as TransferData;
		const gameObject = this.editorCore.getGameObjectFromTransferData(gameObjectTransferData, 'onSetObjectName');
		if (gameObject !== undefined) {
			(gameObject).setName(gameObjectTransferData.name);
		}
	}

	public onSetTransform(commandActionResult: CommandActionResult) {
		const gameObjectTransferData = commandActionResult.gameObjectTransferData as TransferData;
		const gameObject = this.editorCore.getGameObjectFromTransferData(gameObjectTransferData, 'onSetTransform');
		if (gameObject !== undefined) {
			(gameObject).setTransform(gameObjectTransferData.transform);
			if (gameObject.parent) {
				gameObject.parent.updateMatrixWorld();
				if (this.selectionGroup.isSelected(gameObject)) {
					this.selectionGroup.RefreshTransform();
				}
			}
		}

		this.threeManager.setPendingRender();
	}

	public onSetVariation(commandActionResult: CommandActionResult) {
		const gameObjectTransferData = commandActionResult.gameObjectTransferData as TransferData;
		const gameObject = this.editorCore.getGameObjectFromTransferData(gameObjectTransferData, 'onSetVariation');
		if (gameObject !== undefined) {
			(gameObject).setVariation(gameObjectTransferData.variation);
		}
	}

	public onDeletedBlueprint(commandActionResult: CommandActionResult) {
		const gameObjectTransferData = commandActionResult.gameObjectTransferData as TransferData;
		const gameObjectGuid = gameObjectTransferData.guid;
		const gameObject = this.gameObjects.getValue(gameObjectGuid);
		if (gameObject === undefined) {
			return;
		}
		this.threeManager.deleteObject(gameObject);
		this.gameObjects.remove(gameObjectGuid);

		gameObject.getAllChildren().forEach((go) => {
			this.threeManager.deleteObject(go);
			this.gameObjects.remove(go.guid);
		});

		if (this.selectionGroup.selectedGameObjects.length === 0) {
			this.threeManager.hideGizmo();
		}

		this.threeManager.setPendingRender();
		console.log('Deleted blueprint: ' + gameObject.name);
	}

	// TODO: Move logic to GameContext
	public onSpawnedBlueprint(commandActionResult: CommandActionResult) {
		return new Promise((resolve, reject) => {
			const scope = this;
			const gameObjectTransferData = commandActionResult.gameObjectTransferData;
			const gameObjectGuid = gameObjectTransferData.guid;

			if (this.gameObjects.getValue(gameObjectGuid)) {
				console.error('Tried to create a GameObject that already exists');
				return;
			}

			const parentGuid = gameObjectTransferData.parentData.guid;
			const gameObject = GameObject.CreateWithTransferData(gameObjectTransferData);
			editor.threeManager.attachToScene(gameObject);
			gameObject.updateTransform();
			for (const gameEntityData of gameObjectTransferData.gameEntities) {
				const entityData = gameEntityData;

				if (entityData.isSpatial) {
					const gameEntity = new SpatialGameEntity(entityData.instanceId, entityData.transform, entityData.aabb, entityData.initiatorRef);
					gameObject.add(gameEntity);
				}
			}

			this.gameObjects.setValue(gameObjectGuid, gameObject);
			// If the parent is the leveldata, ignore all this
			// todo: make an entry for the leveldata itself maybe?

			// Allows children to be spawned before parents, and then added to the appropriate parent.
			if (!scope.gameContext.levelData.containsKey(parentGuid)) {
				// Parent doesnt exists yet
				if (!this.gameObjects.containsKey(parentGuid)) {
					let parent = this.missingParent.getValue(parentGuid);
					if (parent === undefined) {
						this.missingParent.setValue(parentGuid, []);
						parent = this.missingParent.getValue(parentGuid);
					}
					if (parent !== undefined) { // hack to suppress compiler warnings.
						parent.push(gameObject);
					}
				} else {
					// Parent already exists
					const parent = this.gameObjects.getValue(parentGuid);
					if (parent !== undefined) {
						parent.attach(gameObject);
					}
				}

				if (this.missingParent.containsKey(gameObjectGuid)) {
					const missingParent = this.missingParent.getValue(gameObjectGuid);
					if (missingParent !== undefined) {
						missingParent.forEach((child) => {
							gameObject.attach(child);
						});
					}
					this.missingParent.remove(gameObjectGuid);
				}
			}
			if (!window.vext.executing && commandActionResult.sender === this.getPlayerName() && !gameObject.isVanilla) {
				// Make selection happen after all signals have been handled
				this.threeManager.nextFrame(() => scope.Select(gameObjectGuid, false, true));
			}
			signals.spawnedBlueprint.emit(commandActionResult);
		});
	}

	public onBlueprintSpawnInvoked(commandActionResult: CommandActionResult) {
		console.log('Successfully invoke spawning of blueprint: ' + commandActionResult.gameObjectTransferData.name + ' | ' + commandActionResult.gameObjectTransferData.guid);
	}

	public onEnabledBlueprint(commandActionResult: CommandActionResult) {
		const gameObject = this.getGameObjectByGuid(commandActionResult.gameObjectTransferData.guid);

		if (gameObject == null) {
			window.LogError('Attempted to enable a GameObject that doesn\'t exist');
			return;
		}

		const removeFromHierarchy = commandActionResult.gameObjectTransferData.isDeleted;
		gameObject.Enable(); // removeFromHierarchy);
	}

	public onDisabledBlueprint(commandActionResult: CommandActionResult) {
		const gameObject = this.getGameObjectByGuid(commandActionResult.gameObjectTransferData.guid);

		if (gameObject == null) {
			window.LogError('Attempted to disable a GameObject that doesn\'t exist');
			return;
		}

		const isDeletedVanillaObject = commandActionResult.gameObjectTransferData.isDeleted;
		gameObject.Disable(); // isDeletedVanillaObject:);
	}

	public onObjectChanged(object: GameObject) {
		this.editorCore.addPending(object.guid, object);
	}

	/*

		History

	 */

	public execute(cmd: Command, optionalName?: string) {
		this.history.execute(cmd, optionalName);
	}

	public undo() {
		this.history.undo();
	}

	public redo() {
		this.history.redo();
	}
}
window.addEventListener('resize', () => {
	signals.windowResized.emit();
});
