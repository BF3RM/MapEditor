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
import {signals} from '@/script/modules/Signals';
import { SceneUtils } from 'three';

export default class Editor {
	public config = new Config();
	public editorCore = new EditorCore();
	public debug = true;
	public threeManager = new THREEManager();
	public ui = new EditorUI(this.debug);
	public vext = new VEXTInterface();
	public history = new History(this);
	public blueprintManager = new BlueprintManager();
	public entityFactory = new EntityFactory();
	public gameContext = new GameContext();
	public projectManager = new ProjectManager();
	public fbdMan = new FrostbiteDataManager();

	public playerName: string;
	public gameObjects = new Collections.Dictionary<Guid, GameObject>();
	public favorites: Blueprint[];
	public copy: SpawnBlueprintCommand[];

	public selectionGroup: SelectionGroup;
	public highlightGroup: HighlightGroup;
	public missingParent: Collections.Dictionary<Guid, GameObject[]>;





	constructor(debug: boolean = false) {
		// Commands
		signals.spawnedBlueprint.connect(this.onSpawnedBlueprint.bind(this));
		signals.blueprintSpawnInvoked.connect(this.onBlueprintSpawnInvoked.bind(this));
		signals.enabledBlueprint.connect(this.onEnabledBlueprint.bind(this));
		signals.disabledBlueprint.connect(this.onDisabledBlueprint.bind(this));

		signals.destroyedBlueprint.connect(this.onDestroyedBlueprint.bind(this));
		signals.setObjectName.connect(this.onSetObjectName.bind(this));
		signals.setTransform.connect(this.onSetTransform.bind(this));
		signals.setVariation.connect(this.onSetVariation.bind(this));

		// Messages

		signals.objectChanged.connect(this.onObjectChanged.bind(this));
		signals.setCameraTransform.connect(this.onSetCameraTransform.bind(this));
		signals.setRaycastPosition.connect(this.onSetRaycastPosition.bind(this));
		signals.setPlayerName.connect(this.onSetPlayerName.bind(this));
		signals.setScreenToWorldPosition.connect(this.onSetScreenToWorldPosition.bind(this));
		signals.setUpdateRateMessage.connect(this.onSetUpdateRateMessage.bind(this));
		signals.historyChanged.connect(this.onHistoryChanged.bind(this));

		this.debug = debug;

		/*

			Internal variables

		 */
		// this.selected = [];

		this.playerName = '';
		this.favorites = [];

		this.copy = [];

		// Creates selection and highlighting group and adds them to the scene
		this.selectionGroup = new SelectionGroup(false);
		this.highlightGroup = new HighlightGroup();

		this.missingParent = new Collections.Dictionary<Guid, GameObject[]>();
		this.Initialize();
	}

	public Initialize() {
		const scope = this;
		signals.editorInitializing.emit(true);
		// Adds the chrome background and debug window
		if (this.debug === true) {
			const imported = document.createElement('script');
			imported.src = 'script/DebugData.js';
			document.head.appendChild(imported);
			this.setPlayerName('LocalPlayer');
		}

/*
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

*/

		// All our UI stuff should be initialized by now.
		// We're going to trigger a resize so the content can adapt to being done initializing.
		// It's stupid, I know, but it beats trying to manually fix all instances of broken containers.
		// window.dispatchEvent(new Event('resize'));


		this.threeManager.scene.add(this.selectionGroup);
		this.threeManager.scene.add(this.highlightGroup);


		signals.editorReady.emit(true);
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
		this.favorites[blueprint.instanceGuid] = blueprint;
		blueprint.SetFavorite(true);
		signals.favoriteAdded.emit(blueprint);
		signals.favoritesChanged.emit();
	}

	public RemoveFavorite(blueprint: Blueprint) {
		blueprint.SetFavorite(false);
		delete this.favorites[blueprint.instanceGuid];
		signals.favoriteRemoved.emit(blueprint);
		signals.favoritesChanged.emit();
	}


		public Focus(guid: Guid) {
		let target: GameObject |undefined;
		if (guid) {
			target = this.getGameObjectByGuid(guid);
		} else {
			target = this.selectionGroup;
			if (target.children.length === 0) {
				return;
			} // Nothing specified, nothing selected. skip.
		}
		if (target === undefined) {
			return;
		}
		this.threeManager.Focus(target);
		signals.objectFocused.emit(target);
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
		const commands: SpawnBlueprintCommand[] = [];
		this.selectionGroup.children.forEach((childGameObject: GameObject) => {
			const gameObjectTransferData = childGameObject.getGameObjectTransferData();
			gameObjectTransferData.guid = GenerateGuid();

			commands.push(new SpawnBlueprintCommand(gameObjectTransferData));
		});
		scope.copy = commands;
	}

	public Paste() {
		const scope = this;
		if (scope.copy !== null) {
			// Generate a new guid for each command
			scope.copy.forEach(function(command: SpawnBlueprintCommand) {
				command.gameObjectTransferData.guid = GenerateGuid();
			});
			scope.execute(new BulkCommand(scope.copy));
		}
	}

	public Cut() {
		this.Copy();
		this.DeleteSelected();
	}

	public SpawnBlueprint(blueprint: Blueprint, transform: LinearTransform, variation: number, parentData?: GameObjectParentData) {
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
			parentData = new GameObjectParentData('root', 'root', 'root', 'root');
		}

		// Spawn blueprint
		window.Log(LOGLEVEL.VERBOSE, 'Spawning blueprint: ' + blueprint.instanceGuid);
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
			window.LogError(callerName + ': Couldn\'t find the GameObject for GameObjectTransferData. Name: ' + gameObjectTransferData.name + ' | Guid: ' + gameObjectTransferData.guid);
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
		const gameObject = this.gameObjects.getValue(gameObjectGuid);
		if (gameObject === undefined) {
			return;
		}
		this.threeManager.DeleteObject(gameObject);
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
				if (!this.gameObjects.getValue(parentGuid) === undefined) {
					const parent = this.gameObjects.getValue(parentGuid) as GameObject;
					SceneUtils.attach(gameObject, scope.threeManager.scene, parent);
				}

			}

			if (this.missingParent.containsKey(gameObjectGuid)) {
				const missingParent = this.missingParent.getValue(gameObjectGuid);
				if (missingParent !== undefined) {
					missingParent.every( ((child) => {
						SceneUtils.attach(child as THREE.Object3D, scope.threeManager.scene, gameObject);
					}));
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
			window.LogError('Attempted to enable a GameObject that doesn\'t exist');
			return;
		}

		const removeFromHierarchy = commandActionResult.payload.isDeleted;
		gameObject.Enable(); // removeFromHierarchy);
	}

	public onDisabledBlueprint(commandActionResult: CommandActionResult) {
		const gameObject = this.getGameObjectByGuid(commandActionResult.payload.guid);

		if (gameObject == null) {
			window.LogError('Attempted to disable a GameObject that doesn\'t exist');
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

	public Select(guid: Guid, multi: boolean = false, scrollTo: boolean = true) {
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

	public Unhighlight(guid?: Guid) {
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
	signals.windowResized.emit();
});
