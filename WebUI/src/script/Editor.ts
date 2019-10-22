import * as Collections from 'typescript-collections';

import {Guid} from "guid-typescript";
import {Object3D} from "three";
import Command from "./libs/three/Command";
import SpawnBlueprintCommand from "./commands/SpawnBlueprintCommand";
import BulkCommand from "./commands/BulkCommand";
import DestroyBlueprintCommand from "./commands/DestroyBlueprintCommand";
import History from './libs/three/History';
import GameContext from "./modules/GameContext";
import VEXTInterface from "./modules/VEXT";

export default class Editor {
	config: Config;
	editorCore: EditorCore;
	debug: boolean;
	threeManager:THREEManager;
	ui:EditorUI;
	vext:VEXTInterface;
	history:History;
	blueprintManager:BlueprintManager;
	entityFactory: EntityFactory;
	gameContext: GameContext;
	projectManager: ProjectManager;
	fbdMan:FrostbiteDataManager;

	playerName:string;
	gameObjects: Collections.Dictionary<Guid, GameObject>;
	favorites: Blueprint[];
	copy:BulkCommand | null;

	selectionGroup:SelectionGroup;
	highlightGroup:HighlightGroup;
	missingParent:Collections.Dictionary<Guid, GameObject[]>;





	constructor(debug:boolean = false) {
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

		//Messages

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

		this.playerName = "";

		this.gameObjects = new Collections.Dictionary<Guid, GameObject>();
		this.favorites = [];

		this.copy = null;

		// Creates selection and highlighting group and adds them to the scene
		this.selectionGroup = new SelectionGroup();
		this.highlightGroup = new HighlightGroup();

		this.missingParent = new Collections.Dictionary<Guid, GameObject[]>();
		this.Initialize();

	}

    Initialize() {
	    let scope = this;
        signals.editorInitializing.dispatch(true);
        // Adds the chrome background and debug window
        if(this.debug === true) {
            let imported = document.createElement('script');
            imported.src = 'script/DebugData.js';
            document.head.appendChild(imported);
            this.setPlayerName("LocalPlayer");
        }


        this.ui.RegisterMenubarEntry(["Edit", "Undo"],this.undo.bind(this));
        this.ui.RegisterMenubarEntry(["Edit", "Redo"],this.undo.bind(this));
        this.ui.RegisterMenubarEntry(["Edit", ""]); // Separator
        this.ui.RegisterMenubarEntry(["Edit", "Cut"],this.Cut.bind(this));
        this.ui.RegisterMenubarEntry(["Edit", "Copy"],this.Copy.bind(this));
        this.ui.RegisterMenubarEntry(["Edit", "Paste"],this.Paste.bind(this));
        this.ui.RegisterMenubarEntry(["Edit", ""]); // Separator
        this.ui.RegisterMenubarEntry(["Edit", "Duplicate"], this.Duplicate.bind(this));
        this.ui.RegisterMenubarEntry(["Edit", "Delete"], this.DeleteSelected.bind(this));
        this.ui.RegisterMenubarEntry(["Edit", ""]); // Separator



        //All our UI stuff should be initialized by now.
        // We're going to trigger a resize so the content can adapt to being done initializing.
        // It's stupid, I know, but it beats trying to manually fix all instances of broken containers.
        //window.dispatchEvent(new Event('resize'));


		this.threeManager.scene.add(this.selectionGroup);
		this.threeManager.scene.add(this.highlightGroup);


        signals.editorReady.dispatch(true)
    }

	setPlayerName(name:string) {
		if(name === undefined) {
			LogError("Failed to set player name");
		} else {
			this.playerName = name;
		}
	}

	getPlayerName() {
		return this.playerName;
	}

	AddFavorite(blueprint:Blueprint) {
		this.favorites[blueprint.instanceGuid] = blueprint;
		blueprint.SetFavorite(true);
		signals.favoriteAdded.dispatch(blueprint);
		signals.favoritesChanged.dispatch();
	}

	RemoveFavorite(blueprint:Blueprint) {
		blueprint.SetFavorite(false);
		delete this.favorites[blueprint.instanceGuid];
		signals.favoriteRemoved.dispatch(blueprint);
		signals.favoritesChanged.dispatch();
	}


    Focus(guid:Guid) {
	    let target:GameObject | undefined;
	    if(guid) {
	        target = this.getGameObjectByGuid(guid)
        } else {
	    	target = this.selectionGroup;
	    	if(target.children.length === 0)
	        	return; // Nothing specified, nothing selected. skip.
        }

        this.threeManager.Focus(target);
        signals.objectFocused.dispatch(target);
    }

	Duplicate() {
		let scope = this;
		let commands:Command[] = [];
		this.selectionGroup.children.forEach(function(childGameObject) {
			let gameObjectTransferData = childGameObject.getGameObjectTransferData();
			gameObjectTransferData.guid = GenerateGuid();

			commands.push(new SpawnBlueprintCommand(gameObjectTransferData));
		});
		console.log(commands);
		scope.execute(new BulkCommand(commands));
	}

	Copy() {
		let scope = this;
		let commands:Command[] = [];
		this.selectionGroup.children.forEach(function(childGameObject:GameObject) {
			let gameObjectTransferData = childGameObject.getGameObjectTransferData();
			gameObjectTransferData.guid = GenerateGuid();

			commands.push(new SpawnBlueprintCommand(gameObjectTransferData));
		});
		scope.copy = new BulkCommand(commands);
	}

	Paste() {
		let scope = this;
		if(scope.copy !== null) {
			//Generate a new guid for each command
			scope.copy.commands.forEach(function (command:SpawnBlueprintCommand) {
				command.gameObjectTransferData.guid = GenerateGuid();
			});
			scope.execute(scope.copy);
		}
	}

	Cut() {
		this.Copy();
		this.DeleteSelected();
	}

	SpawnBlueprint(blueprint:Blueprint, transform:LinearTransform, variation:number, parentData:GameObjectParentData) {
		if(blueprint == null) {
			LogError("Tried to spawn a nonexistent blueprint");
			return false;
		}

		if(transform === undefined) {
			transform = this.editorCore.getRaycastTransform();
		}

		if(variation === undefined) {
			variation = blueprint.getDefaultVariation();
		}
		if(parentData === undefined) {
			parentData = new GameObjectParentData("root", "root", "root", "root");
		}

		//Spawn blueprint
		Log(LOGLEVEL.VERBOSE, "Spawning blueprint: " + blueprint.instanceGuid);
		let gameObjectTransferData = new GameObjectTransferData({
			guid: GenerateGuid(),
			name: blueprint.name,
			parentData: parentData,
			blueprintCtrRef: blueprint.getCtrRef(),
			transform: transform,
			variation: variation,
			isDeleted: false,
			isEnabled: true
		});

		this.execute(new SpawnBlueprintCommand(gameObjectTransferData), );
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

	DeleteSelected() {
		let scope = this;
		let commands:Command[] = [];
		this.selectionGroup.children.forEach(function(childGameObject) {
			if (childGameObject instanceof GameObject) {
				commands.push(new DestroyBlueprintCommand(childGameObject.getGameObjectTransferData()));
			}
		});

		if(commands.length > 0) {
			scope.execute(new BulkCommand(commands));
		}
	}

	getGameObjectFromGameObjectTransferData(gameObjectTransferData: GameObjectTransferData, callerName:string) {
		let gameObject = this.getGameObjectByGuid(gameObjectTransferData.guid);

		if(gameObject === undefined) {
			LogError(callerName + ": Couldn't find the GameObject for GameObjectTransferData. Name: " + gameObjectTransferData.name + " | Guid: " + gameObjectTransferData.guid);
			return;
		}

		return gameObject;
	}

	getGameObjectByGuid(guid:Guid) {
		return this.gameObjects.getValue(guid);
	}

	SetRaycastPosition(x:number, y:number, z:number){
		this.editorCore.raycastTransform.trans = new Vec3(x, y, z);
	}

	SetScreenToWorldPosition(x:number, y:number, z:number){
		this.editorCore.screenToWorldTransform.trans = new Vec3(x, y, z);
	}

	setUpdating(value:boolean) {
		this.editorCore.setUpdating( value );
	}

	/*

    Controls

	*/

	onControlMoveStart() {
		let scope = this;
		scope.selectionGroup.onMoveStart();
	}

	onControlMove() {
		let scope = this;
		scope.selectionGroup.onMove();
	}

	onControlMoveEnd() {
		let scope = this;
		scope.selectionGroup.onMoveEnd();
	}

	/*

		Commands

	*/

	onSetObjectName(commandActionResult:CommandActionResult) {
		let gameObjectTransferData = commandActionResult.gameObjectTransferData;
		let gameObject = this.getGameObjectFromGameObjectTransferData(gameObjectTransferData, "onSetObjectName");
		if(gameObject !== undefined)
			gameObject.setName(gameObjectTransferData.name);
	}

	onSetTransform(commandActionResult:CommandActionResult) {
		let gameObjectTransferData = commandActionResult.gameObjectTransferData;
		let gameObject = this.getGameObjectFromGameObjectTransferData(gameObjectTransferData, "onSetTransform");
		if(gameObject !== undefined) {
			gameObject.setTransform(gameObjectTransferData.transform);

			if (this.selectionGroup.children.length === 1 && gameObject === this.selectionGroup.children[0]) {
				this.selectionGroup.setTransform(gameObject.transform);
			}
		}

		this.threeManager.Render();
	}

	onSetVariation(commandActionResult:CommandActionResult) {
		let gameObjectTransferData = commandActionResult.gameObjectTransferData;
		let gameObject = this.getGameObjectFromGameObjectTransferData(gameObjectTransferData, "onSetVariation");
		if(gameObject !== undefined)
			gameObject.setVariation(gameObjectTransferData.variation);
	}

	onDestroyedBlueprint(commandActionResult:CommandActionResult) {
		let gameObjectGuid = commandActionResult.gameObjectTransferData.guid;
		this.threeManager.DeleteObject(this.gameObjects.getValue(gameObjectGuid));
		this.gameObjects.remove(gameObjectGuid);
		
		if(this.selectionGroup.children.length === 0) {
			this.threeManager.HideGizmo()
		}

		this.threeManager.Render();
	}

	// TODO: Move logic to GameContext
	onSpawnedBlueprint(commandActionResult:CommandActionResult) {
		let scope = this;
		let gameObjectTransferData = commandActionResult.gameObjectTransferData;
		let gameObjectGuid = gameObjectTransferData.guid;
		let parentGuid = gameObjectTransferData.parentData.guid;


		// TODO: change GameObject ctor
		let gameObject = new GameObject(gameObjectTransferData.guid,
										gameObjectTransferData.typeName,
										gameObjectTransferData.name,
										gameObjectTransferData.transform,
										gameObjectTransferData.parentData,
										gameObjectTransferData.blueprintCtrRef,
										gameObjectTransferData.variation,
										gameObjectTransferData.gameEntities);

		for (let key in gameObjectTransferData.gameEntities) {
			let entityData = gameObjectTransferData.gameEntities[key];
			// UniqueID is fucking broken. this won't work online, boi.
			if(entityData.isSpatial) {
				let gameEntity = new SpatialGameEntity(entityData.instanceId, entityData.transform, entityData.aabb);
				gameObject.AddEntity(gameEntity);
			}
		}

		gameObject.updateMatrixWorld();

		this.gameObjects.setValue(gameObjectGuid, gameObject);
		// If the parent is the leveldata, ignore all this
		// todo: make an entry for the leveldata itself maybe?

		// Allows children to be spawned before parents, and then added to the appropriate parent.
		if(!scope.gameContext.levelData.containsKey(parentGuid)) {
			if(this.gameObjects.containsKey(parentGuid)) {
				let parent = this.missingParent.getValue(parentGuid);
				if(parent === undefined) {
					this.missingParent.setValue(parentGuid, []);
					parent = this.missingParent.getValue(parentGuid);
				}
				if(parent !== undefined) { // hack to suppress compiler warnings.
					parent.push(gameObject)
				}
			} else {
				THREE.SceneUtils.attach(gameObject, scope.threeManager.scene, this.gameObjects.getValue(parentGuid) );
			}

			if(this.missingParent.containsKey(gameObjectGuid)) {
				let missingParent = this.missingParent.getValue(gameObjectGuid);
				for(let child in missingParent) {
					THREE.SceneUtils.attach(child, scope.threeManager.scene, gameObject);
				}

				this.missingParent.remove(gameObjectGuid);
			}
		}

		setTimeout(function() {scope.threeManager.scene.remove(gameObject)}, 1);
		if(!scope.vext.executing && commandActionResult.sender === this.getPlayerName()) {
			// Make selection happen after all signals have been handled
			setTimeout(function() {scope.Select(gameObjectGuid, false)}, 2);
		}
	}

	onBlueprintSpawnInvoked(commandActionResult:CommandActionResult) {
		console.log("Successfully invoke spawning of blueprint: " + commandActionResult.gameObjectTransferData.name + " | " + commandActionResult.gameObjectTransferData.guid)
	}

	onEnabledBlueprint(commandActionResult:CommandActionResult) {
		let gameObject = this.getGameObjectByGuid(commandActionResult.gameObjectTransferData.guid);

		if(gameObject == null) {
			LogError("Attempted to enable a GameObject that doesn't exist");
			return;
		}

		let removeFromHierarchy = commandActionResult.gameObjectTransferData.isDeleted;
		gameObject.Enable();//removeFromHierarchy);
	}

	onDisabledBlueprint(commandActionResult:CommandActionResult) {
		let gameObject = this.getGameObjectByGuid(commandActionResult.gameObjectTransferData.guid);

		if(gameObject == null) {
			LogError("Attempted to disable a GameObject that doesn't exist");
			return;
		}

		let isDeletedVanillaObject = commandActionResult.gameObjectTransferData.isDeleted;
		gameObject.Disable();//isDeletedVanillaObject:);
	}

	onObjectChanged(object:GameObject) {
		this.editorCore.addPending(object.guid, object);
	}


	isSelected(guid:Guid) {
		let scope = this;
		if(scope.selectionGroup.children.length === 0) {
			return false
		}
		for(let i = 0; i < scope.selectionGroup.children.length; i++) {
			if(guid.equals(scope.selectionGroup.children[i].guid)) {
				return true;
			}
		}
		return false;
	}

	Select(guid:Guid, multi:Boolean = false, scrollTo:Boolean = true) {
		this.Unhighlight(guid);

		if(multi) {
			this.editorCore.onSelectedGameObject(guid, true, scrollTo)
		} else {
			this.editorCore.onSelectedGameObject(guid, false, scrollTo)
		}
	}

	Deselect(guid:Guid) {
		this.editorCore.onDeselectedGameObject(guid);
	}

	Highlight(guid:Guid){
		let gameObject = this.getGameObjectByGuid(guid);

		if (gameObject === null) return;


		this.highlightGroup.HighlightObject(gameObject);
	}

	Unhighlight(guid:Guid){
		if (guid !== null && guid !== undefined) {
			let gameObject = this.getGameObjectByGuid(guid);

			if (gameObject === null || gameObject === undefined){
				console.error("Tried to unhighlight an object that doesn't exist");
				return;
			}else if (!gameObject.highlighted) {
				return;
			}
		}

		this.highlightGroup.UnhighlightCurrentObject()
	}

	/*

		Messages

	 */

	onSetCameraTransform(transform:LinearTransform) {

	}
	onSetRaycastPosition(position:Vec3) {

	}
	onSetPlayerName(name:string){

	}
	onSetScreenToWorldPosition(position:Vec3) {

	}
	onSetUpdateRateMessage(value:number){

	}

	/*

		History

	 */
	onHistoryChanged(cmd:Command) {

	}

	execute( cmd:Command, optionalName?:string ) {
		this.history.execute( cmd, optionalName );
	}

	undo() {
		this.history.undo();
	}

	redo() {
		this.history.redo();
	}
}
window.addEventListener('resize', function () {
	signals.windowResized.dispatch()
});
