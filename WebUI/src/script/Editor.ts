import * as Collections from 'typescript-collections';

import {Guid} from 'guid-typescript';
import Command from './libs/three/Command';
import SpawnBlueprintCommand from './commands/SpawnBlueprintCommand';
import BulkCommand from './commands/BulkCommand';
import DestroyBlueprintCommand from './commands/DestroyBlueprintCommand';
import History from './libs/three/History';
import GameContext from './modules/GameContext';
import VEXTInterface from './modules/VEXT';

import {GameObjectParentData} from './types/GameObjectParentData';
import {BlueprintManager} from './modules/BlueprintManager';
import {EditorUI} from './modules/EditorUI';
import {SelectionGroup} from './types/SelectionGroup';
import {Config} from './modules/Config';
import {Blueprint} from './types/Blueprint';
import {THREEManager} from './modules/THREEManager';
import {EditorCore} from './EditorCore';
import {SpatialGameEntity} from './types/SpatialGameEntity';
import {ProjectManager} from './modules/ProjectManager';
import {CommandActionResult} from './types/CommandActionResult';
import {HighlightGroup} from './types/HighlightGroup';
import {GameObjectTransferData} from './types/GameObjectTransferData';
import {GameObject} from './types/GameObject';
import {FrostbiteDataManager} from './modules/FrostbiteDataManager';
import {EntityFactory} from './modules/EntityFactory';
import {LinearTransform} from './types/primitives/LinearTransform';
import {Vec3} from './types/primitives/Vec3';

export default class Editor {
	public config: Config;
	public editorCore: EditorCore;
	public debug: boolean;
	public threeManager: THREEManager;
	public ui: EditorUI;
	public vext: VEXTInterface;
	public history: History;
	public blueprintManager: BlueprintManager;
	public entityFactory: EntityFactory;
	public gameContext: GameContext;
	public projectManager: ProjectManager;
	public fbdMan: FrostbiteDataManager;

	public playerName: string;
	public gameObjects: Collections.Dictionary<Guid, GameObject>;
	public favorites: Blueprint[];
	public copy: BulkCommand | null;

	public selectionGroup: SelectionGroup;
	public highlightGroup: HighlightGroup;
	public missingParent: Collections.Dictionary<Guid, GameObject[]>;





	constructor(debug: boolean = false) {
		this.config = new Config();
		this.editorCore = new EditorCore();

		// Commands
		signals.spawnedBlueprint.add(this.onSpawnedBlueprint.bind(this));
		signals.blueprintSpawnInvoked.add(this.onBlueprintSpawnInvoked.bind(this));
		signals.enabledBlueprint.add(this.onEnabledBlueprint.bind(this));
		signals.disabledBlueprint.add(this.onDisabledBlueprint.bind(this));

		signals.destroyedBlueprint.add(this.onDestroyedBlueprint.bind(this));
		signals.setObjectName.add(this.onSetObjectName.bind(this));
		signals.setTransform.add(this.onSetTransform.bind(this));
		signals.setVariation.add(this.onSetVariation.bind(this));

		// Messages

		signals.objectChanged.add(this.onObjectChanged.bind(this));
		signals.setCameraTransform.add(this.onSetCameraTransform.bind(this));
		signals.setRaycastPosition.add(this.onSetRaycastPosition.bind(this));
		signals.setPlayerName.add(this.onSetPlayerName.bind(this));
		signals.setScreenToWorldPosition.add(this.onSetScreenToWorldPosition.bind(this));
		signals.setUpdateRateMessage.add(this.onSetUpdateRateMessage.bind(this));
		signals.historyChanged.add(this.onHistoryChanged.bind(this));

		this.debug = debug;
		this.threeManager = new THREEManager();
		this.ui = new EditorUI(debug);
		this.vext = new VEXTInterface();
		// @ts-ignore
		this.history = new History(this);
		this.blueprintManager = new BlueprintManager();
		this.entityFactory = new EntityFactory();
		this.gameContext = new GameContext();
		this.projectManager = new ProjectManager();
		this.fbdMan = new FrostbiteDataManager();

		/*

			Internal variables

		 */
		// this.selected = [];

		this.playerName = '';

		this.gameObjects = new Collections.Dictionary<Guid, GameObject>();
		this.favorites = [];

		this.copy = null;

		// Creates selection and highlighting group and adds them to the scene
		this.selectionGroup = new SelectionGroup();
		this.highlightGroup = new HighlightGroup();

		this.missingParent = new Collections.Dictionary<Guid, GameObject[]>();
		this.Initialize();

	}

	public Initialize() {
		const scope = this;
		signals.editorInitializing.dispatch(true);
		// Adds the chrome background and debug window
		if (this.debug === true) {
			const imported = document.createElement('script');
			imported.src = 'script/DebugData.js';
			document.head.appendChild(imported);
			this.setPlayerName('LocalPlayer');
		}


		this.ui.RegisterMenubarEntry(['Edit', 'Undo'], this.undo.bind(this));
		this.ui.RegisterMenubarEntry(['Edit', 'Redo'], this.undo.bind(this));
		this.ui.RegisterMenubarEntry(['Edit', '']); // Separator
		this.ui.RegisterMenubarEntry(['Edit', 'Cut'], this.Cut.bind(this));
		this.ui.RegisterMenubarEntry(['Edit', 'Copy'], this.Copy.bind(this));
		this.ui.RegisterMenubarEntry(['Edit', 'Paste'], this.Paste.bind(this));
		this.ui.RegisterMenubarEntry(['Edit', '']); // Separator
		this.ui.RegisterMenubarEntry(['Edit', 'Duplicate'], this.Duplicate.bind(this));
		this.ui.RegisterMenubarEntry(['Edit', 'Delete'], this.DeleteSelected.bind(this));
		this.ui.RegisterMenubarEntry(['Edit', '']); // Separator



		// All our UI stuff should be initialized by now.
		// We're going to trigger a resize so the content can adapt to being done initializing.
		// It's stupid, I know, but it beats trying to manually fix all instances of broken containers.
		// window.dispatchEvent(new Event('resize'));


		this.threeManager.scene.add(this.selectionGroup);
		this.threeManager.scene.add(this.highlightGroup);


		signals.editorReady.dispatch(true);
	}

	public setPlayerName(name: string) {
		if (name === undefined) {
			LogError('Failed to set player name');
		} else {
			this.playerName = name;
		}
	}

	public getPlayerName() {
		return this.playerName;
	}

	public AddFavorite(blueprint: Blueprint) {
		this.favorites[blueprint.instanceGuid] = blueprint;
		blueprint.SetFavorite(true);
		signals.favoriteAdded.dispatch(blueprint);
		signals.favoritesChanged.dispatch();
	}

	public RemoveFavorite(blueprint: Blueprint) {
		blueprint.SetFavorite(false);
		delete this.favorites[blueprint.instanceGuid];
		signals.favoriteRemoved.dispatch(blueprint);
		signals.favoritesChanged.dispatch();
	}


		public Focus(guid: Guid) {
		let target: GameObject | undefined;
		if (guid) {
			target = this.getGameObjectByGuid(guid);
		} else {
			target = this.selectionGroup;
			if (target.children.length === 0) {
				return;
			} // Nothing specified, nothing selected. skip.
		}

		this.threeManager.Focus(target);
		signals.objectFocused.dispatch(target);
		}

	public Duplicate() {
		const scope = this;
		const commands: Command[] = [];
		this.selectionGroup.children.forEach(function(childGameObject) {
			const gameObjectTransferData = childGameObject.getGameObjectTransferData();
			gameObjectTransferData.guid = GenerateGuid();

			commands.push(new SpawnBlueprintCommand(gameObjectTransferData));
		});
		console.log(commands);
		scope.execute(new BulkCommand(commands));
	}

	public Copy() {
		const scope = this;
		const commands: Command[] = [];
		this.selectionGroup.children.forEach((childGameObject: GameObject) => {
			const gameObjectTransferData = childGameObject.getGameObjectTransferData();
			gameObjectTransferData.guid = GenerateGuid();

			commands.push(new SpawnBlueprintCommand(gameObjectTransferData));
		});
		scope.copy = new BulkCommand(commands);
	}

	public Paste() {
		const scope = this;
		if (scope.copy !== null) {
			// Generate a new guid for each command
			scope.copy.commands.forEach(function(command: SpawnBlueprintCommand) {
				command.gameObjectTransferData.guid = GenerateGuid();
			});
			scope.execute(scope.copy);
		}
	}

	public Cut() {
		this.Copy();
		this.DeleteSelected();
	}

	public SpawnBlueprint(blueprint: Blueprint, transform: LinearTransform, variation: number, parentData: GameObjectParentData) {
		if (blueprint == null) {
			LogError('Tried to spawn a nonexistent blueprint');
			return false;
		}

		if (transform === undefined) {
			transform = this.editorCore.getRaycastTransform();
		}

		if (variation === undefined) {
			variation = blueprint.getDefaultVariation();
		}
		if (parentData === undefined) {
			parentData = new GameObjectParentData('root', 'root', 'root', 'root');
		}

		// Spawn blueprint
		Log(logLevel.VERBOSE, 'Spawning blueprint: ' + blueprint.instanceGuid);
		const gameObjectTransferData = new GameObjectTransferData({
			guid: GenerateGuid(),
			name: blueprint.name,
			parentData,
			blueprintCtrRef: blueprint.getCtrRef(),
			transform,
			variation,
			isDeleted: false,
			isEnabled: true,
		});

		this.execute(new SpawnBlueprintCommand(gameObjectTransferData) );
	}

/*	DisableSelected() {
		let scope = this;
		let commands = [];
		editor.selectionGroup.children.forEach(function(childGameObject) {
			let gameObjectTransferData = new GameObjectTransferData({
				guid: childGameObject.guid
			});

			commands.push(new DisableBlueprintCommand(gameObjectTransferData));
		});
		if(commands.length > 0) {
			scope.execute(new BulkCommand(commands));
		}
	}*/

	// TODO: EnableBlueprintCommand and DisableBlueprintCommand are not invoked anywhere, but the whole lua side works.

	public DeleteSelected() {
		const scope = this;
		const commands: Command[] = [];
		this.selectionGroup.children.forEach(function(childGameObject) {
			if (childGameObject instanceof GameObject) {
				commands.push(new DestroyBlueprintCommand(childGameObject.getGameObjectTransferData()));
			}
		});

		if (commands.length > 0) {
			scope.execute(new BulkCommand(commands));
		}
	}

	public getGameObjectFromGameObjectTransferData(gameObjectTransferData: GameObjectTransferData, callerName: string) {
		const gameObject = this.getGameObjectByGuid(gameObjectTransferData.guid);

		if (gameObject === undefined) {
			LogError(callerName + ': Couldn\'t find the GameObject for GameObjectTransferData. Name: ' + gameObjectTransferData.name + ' | Guid: ' + gameObjectTransferData.guid);
			return;
		}

		return gameObject;
	}

	public getGameObjectByGuid(guid: Guid) {
		return this.gameObjects.getValue(guid);
	}

	public SetRaycastPosition(x: number, y: number, z: number) {
		this.editorCore.raycastTransform.trans = new Vec3(x, y, z);
	}

	public SetScreenToWorldPosition(x: number, y: number, z: number) {
		this.editorCore.screenToWorldTransform.trans = new Vec3(x, y, z);
	}

	public setUpdating(value: boolean) {
		this.editorCore.setUpdating( value );
	}

	/*

    Controls

	*/

	public onControlMoveStart() {
		const scope = this;
		scope.selectionGroup.onMoveStart();
	}

	public onControlMove() {
		const scope = this;
		scope.selectionGroup.onMove();
	}

	public onControlMoveEnd() {
		const scope = this;
		scope.selectionGroup.onMoveEnd();
	}

	/*

		Commands

	*/

	public onSetObjectName(commandActionResult: CommandActionResult) {
		const gameObjectTransferData = commandActionResult.payload as GameObjectTransferData;
		const gameObject = this.getGameObjectFromGameObjectTransferData(gameObjectTransferData, 'onSetObjectName');
		if (gameObject !== undefined) {
			gameObject.setName(gameObjectTransferData.name);
		}
	}

	public onSetTransform(commandActionResult: CommandActionResult) {
		const gameObjectTransferData = commandActionResult.payload as GameObjectTransferData;
		const gameObject = this.getGameObjectFromGameObjectTransferData(gameObjectTransferData, 'onSetTransform');
		if (gameObject !== undefined) {
			gameObject.setTransform(gameObjectTransferData.transform);

			if (this.selectionGroup.children.length === 1 && gameObject === this.selectionGroup.children[0]) {
				this.selectionGroup.setTransform(gameObject.transform);
			}
		}

		this.threeManager.Render();
	}

	public onSetVariation(commandActionResult: CommandActionResult) {
		const gameObjectTransferData = commandActionResult.payload as GameObjectTransferData;
		const gameObject = this.getGameObjectFromGameObjectTransferData(gameObjectTransferData, 'onSetVariation');
		if (gameObject !== undefined) {
			gameObject.setVariation(gameObjectTransferData.variation);
		}
	}

	public onDestroyedBlueprint(commandActionResult: CommandActionResult) {
		const gameObjectTransferData = commandActionResult.payload as GameObjectTransferData;
		const gameObjectGuid = gameObjectTransferData.guid;
		this.threeManager.DeleteObject(this.gameObjects.getValue(gameObjectGuid));
		this.gameObjects.remove(gameObjectGuid);

		if (this.selectionGroup.children.length === 0) {
			this.threeManager.HideGizmo();
		}

		this.threeManager.Render();
	}

	// TODO: Move logic to GameContext
	public onSpawnedBlueprint(commandActionResult: CommandActionResult) {
		const scope = this;
		const gameObjectTransferData = commandActionResult.payload as GameObjectTransferData;
		const gameObjectGuid = gameObjectTransferData.guid;
		const parentGuid = gameObjectTransferData.parentData.guid;


		// TODO: change GameObject ctor
		const gameObject = new GameObject(gameObjectTransferData.guid,
										gameObjectTransferData.typeName,
										gameObjectTransferData.name,
										gameObjectTransferData.transform,
										gameObjectTransferData.parentData,
										gameObjectTransferData.blueprintCtrRef,
										gameObjectTransferData.variation,
										gameObjectTransferData.gameEntities);

		for (const key in gameObjectTransferData.gameEntities) {
			const entityData = gameObjectTransferData.gameEntities[key];
			// UniqueID is fucking broken. this won't work online, boi.
			if (entityData.isSpatial) {
				const gameEntity = new SpatialGameEntity(entityData.instanceId, entityData.transform, entityData.aabb);
				gameObject.add(gameEntity);
			}
		}

		gameObject.updateMatrixWorld();

		this.gameObjects.setValue(gameObjectGuid, gameObject);
		// If the parent is the leveldata, ignore all this
		// todo: make an entry for the leveldata itself maybe?

		// Allows children to be spawned before parents, and then added to the appropriate parent.
		if (!scope.gameContext.levelData.containsKey(parentGuid)) {
			if (this.gameObjects.containsKey(parentGuid)) {
				let parent = this.missingParent.getValue(parentGuid);
				if (parent === undefined) {
					this.missingParent.setValue(parentGuid, []);
					parent = this.missingParent.getValue(parentGuid);
				}
				if (parent !== undefined) { // hack to suppress compiler warnings.
					parent.push(gameObject);
				}
			} else {
				THREE.SceneUtils.attach(gameObject, scope.threeManager.scene, this.gameObjects.getValue(parentGuid) );
			}

			if (this.missingParent.containsKey(gameObjectGuid)) {
				const missingParent = this.missingParent.getValue(gameObjectGuid);
				for (const child in missingParent) {
					THREE.SceneUtils.attach(child, scope.threeManager.scene, gameObject);
				}

				this.missingParent.remove(gameObjectGuid);
			}
		}

		setTimeout(function() {scope.threeManager.scene.remove(gameObject); }, 1);
		if (!scope.vext.executing && commandActionResult.sender === this.getPlayerName()) {
			// Make selection happen after all signals have been handled
			setTimeout(function() {scope.Select(gameObjectGuid, false); }, 2);
		}
	}

	public onBlueprintSpawnInvoked(commandActionResult: CommandActionResult) {
		console.log('Successfully invoke spawning of blueprint: ' + commandActionResult.payload.name + ' | ' + commandActionResult.payload.guid);
	}

	public onEnabledBlueprint(commandActionResult: CommandActionResult) {
		const gameObject = this.getGameObjectByGuid(commandActionResult.payload.guid);

		if (gameObject == null) {
			LogError('Attempted to enable a GameObject that doesn\'t exist');
			return;
		}

		const removeFromHierarchy = commandActionResult.payload.isDeleted;
		gameObject.Enable(); // removeFromHierarchy);
	}

	public onDisabledBlueprint(commandActionResult: CommandActionResult) {
		const gameObject = this.getGameObjectByGuid(commandActionResult.payload.guid);

		if (gameObject == null) {
			LogError('Attempted to disable a GameObject that doesn\'t exist');
			return;
		}

		const isDeletedVanillaObject = commandActionResult.payload.isDeleted;
		gameObject.Disable(); // isDeletedVanillaObject:);
	}

	public onObjectChanged(object: GameObject) {
		this.editorCore.addPending(object.guid, object);
	}


	public isSelected(guid: Guid) {
		const scope = this;
		if (scope.selectionGroup.children.length === 0) {
			return false;
		}
		for (let i = 0; i < scope.selectionGroup.children.length; i++) {
			if (guid.equals(scope.selectionGroup.children[i].guid)) {
				return true;
			}
		}
		return false;
	}

	public Select(guid: Guid, multi: Boolean = false, scrollTo: Boolean = true) {
		this.Unhighlight(guid);

		if (multi) {
			this.editorCore.onSelectedGameObject(guid, true, scrollTo);
		} else {
			this.editorCore.onSelectedGameObject(guid, false, scrollTo);
		}
	}

	public Deselect(guid: Guid) {
		this.editorCore.onDeselectedGameObject(guid);
	}

	public Highlight(guid: Guid) {
		const gameObject = this.getGameObjectByGuid(guid);

		if (gameObject === null) { return; }


		this.highlightGroup.HighlightObject(gameObject);
	}

	public Unhighlight(guid: Guid) {
		if (guid !== null && guid !== undefined) {
			const gameObject = this.getGameObjectByGuid(guid);

			if (gameObject === null || gameObject === undefined) {
				console.error('Tried to unhighlight an object that doesn\'t exist');
				return;
			} else if (!gameObject.highlighted) {
				return;
			}
		}

		this.highlightGroup.UnhighlightCurrentObject();
	}

	/*

		Messages

	 */

	public onSetCameraTransform(transform: LinearTransform) {

	}
	public onSetRaycastPosition(position: Vec3) {

	}
	public onSetPlayerName(name: string) {

	}
	public onSetScreenToWorldPosition(position: Vec3) {

	}
	public onSetUpdateRateMessage(value: number) {

	}

	/*

		History

	 */
	public onHistoryChanged(cmd: Command) {

	}

	public execute( cmd: Command, optionalName?: string ) {
		this.history.execute( cmd, optionalName );
	}

	public undo() {
		this.history.undo();
	}

	public redo() {
		this.history.redo();
	}
}
window.addEventListener('resize', function() {
	signals.windowResized.dispatch();
});
