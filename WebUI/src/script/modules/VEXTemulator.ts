import { CommandActionResult } from '@/script/types/CommandActionResult';
import { LogError } from '@/script/modules/Logger';
import {
	SetScreenToWorldTransformMessage,
	MoveObjectMessage,
	RequestDeleteProjectMessage
} from '@/script/messages/MessagesIndex';
import { XP2SKybar, XP2SKybarBlueprints } from '@/data/DebugData';
import { WebXSource } from '@/script/modules/WebXSource';
import { LevelLoader } from '@/script/modules/LevelLoader';
import { MeshManager } from '@/script/modules/MeshManager';
import { StaticModels } from '@/script/modules/StaticModels';
import { Terrain } from '@/script/modules/Terrain';
import { Lighting } from '@/script/modules/Lighting';
import { MobileLayout } from '@/script/modules/MobileLayout';
import {
	StandaloneUI, enableCameraControls, enableMeshPicking, frameLevel, requestedLevel
} from '@/script/modules/StandaloneUI';
import { Guid } from '@/script/types/Guid';
import { IEBXFieldData } from '@/script/commands/SetEBXFieldCommand';

export class VEXTemulator {
	private commands: any;
	private messages: any;
	private events: any;

	constructor() {
		this.commands = {};
		this.commands.SpawnGameObjectCommand = this.SpawnGameObject;
		this.commands.DeleteGameObjectCommand = this.DestroyGameObject;
		this.commands.CreateGroupCommand = this.CreateGroup;
		this.commands.DestroyGroupCommand = this.DestroyGroup;
		this.commands.SetObjectNameCommand = this.SetObjectName;
		this.commands.SetTransformCommand = this.SetTransform;
		this.commands.SetVariationCommand = this.SetVariation;
		this.commands.EnableGameObjectCommand = this.EnableGameObject;
		this.commands.DisableGameObjectCommand = this.DisableGameObject;
		this.commands.SetEBXFieldCommand = this.SetEBXField;

		this.messages = {};
		this.messages.GetProjectsMessage = this.GetProjectsMessage;
		this.messages.RequestDeleteProjectMessage = this.RequestDeleteProjectMessage;
		this.messages.RequestProjectDataMessage = this.RequestProjectDataMessage;
		this.messages.SetScreenToWorldPositionMessage = this.SetScreenToWorldPositionMessage;
		this.messages.MoveObjectMessage = this.MoveObjectMessage;

		this.events = {};
		this.events.UIReloaded = this.UIReloaded;
		this.events.controlUpdate = () => {};
		this.events.controlStart = () => {};

		// Everything else the WebUI sends is a message to the NATIVE side: it draws the selection
		// boxes and the gizmo through VEXT's DebugRenderer, restricts input, flies the freecam.
		// Standalone there is no native side, and three.js already draws all of it in the
		// viewport, so these are genuinely nothing to do here -- but going through the
		// unimplemented path logged console.error on every mouse move (NativeHighlight) and every
		// selection change, which buries real errors.
		//
		// Accept them silently. Add a real handler above if one ever needs to do something.
		const s_NativeOnly = [
			'controlEnd',
			'DisableEditorMode',
			'EnableFreeCamMovement',
			'FocusCamera',
			'NativeHighlight',
			'NativePick',
			'SetGizmoBasis',
			'SetGizmoCenter',
			'SetGizmoMode',
			'SetOverlaySettings',
			'SetSelection',
			'SetWorldSpace'
		];

		s_NativeOnly.forEach((l_Name: string) => {
			this.events[l_Name] = () => {};
		});
	}

	public Receive(commands: any[]) {
		const scope = this;
		const responses: any[] = [];
		commands.forEach((command) => {
			if (scope.commands[command.type] === undefined) {
				console.error('NotImplemented: ' + command.type);
			} else {
				responses.push(scope.commands[command.type](command));
			}
		});
		// Delay to simulate tick pass
		setTimeout(() => {
			window.vext.HandleResponse(responses, true);
		}, 1);
	}

	public ReceiveMessage(messages: any[]) {
		const scope = this;
		const responses: any[] = [];
		messages.forEach((message) => {
			if (scope.messages[message.type] === undefined) {
				console.error('NotImplemented: ' + message.type);
			} else {
				responses.push(scope.messages[message.type](message));
			}
		});
		// Delay to simulate tick pass
		for (const response of responses) {
			setTimeout(() => {
				window.vext.HandleMessage(response);
			}, 1);
		}
	}

	public ReceiveEvent(eventName: string, param?: any) {
		const scope = this;
		if (scope.events[eventName] === undefined) {
			console.error('NotImplemented: ' + eventName);
		} else {
			scope.events[eventName](param);
		}
	}

	private GetProjectsMessage() {
		const save = [
			{
				id: 1,
				projectName: 'debugProject',
				mapName: 'XP2_Skybar',
				gameModeName: 'ConquestLargeC0',
				requiredBundles: 'none',
				timeStamp: 1592245943322
			},
			{
				id: 2,
				projectName: 'debugProject',
				mapName: 'XP2_Skybar',
				gameModeName: 'ConquestLargeC0',
				requiredBundles: 'none',
				timeStamp: 1592245944322
			},
			{
				id: 3,
				projectName: 'debugProject',
				mapName: 'XP2_Skybar',
				gameModeName: 'ConquestLargeC0',
				requiredBundles: 'none',
				timeStamp: 1592245945322
			},
			{
				id: 4,
				projectName: 'debugProject',
				mapName: 'XP2_Skybar',
				gameModeName: 'ConquestLargeC0',
				requiredBundles: 'none',
				timeStamp: 1592245946322
			},
			{
				id: 5,
				projectName: 'NewdebugProject',
				mapName: 'XP2_Skybar',
				gameModeName: 'ConquestLargeC0',
				requiredBundles: 'none',
				timeStamp: 1592245947322
			},
			{
				id: 6,
				projectName: 'NewdebugProject',
				mapName: 'XP2_Skybar',
				gameModeName: 'ConquestLargeC0',
				requiredBundles: 'none',
				timeStamp: 1592245948322
			}
		];
		return { type: 'SetProjectHeaders', payload: save };
	}

	private RequestProjectDataMessage(projectId: number) {
		return {
			type: 'SetProjectData',
			payload:
				'{"data":"{\\"ED170122-0000-0000-0000-000872916384\\":{\\"transform\\":{\\"left\\":{\\"x\\":1,\\"y\\":0,\\"z\\":0},\\"up\\":{\\"x\\":0,\\"y\\":1,\\"z\\":0},\\"forward\\":{\\"x\\":0,\\"y\\":0,\\"z\\":1},\\"trans\\":{\\"x\\":37.279998779297,\\"y\\":10.239999771118,\\"z\\":16.945972442627}},\\"parentData\\":{\\"primaryInstanceGuid\\":\\"C1F25548-8EF2-4AB5-A79F-D88726713BAE\\",\\"partitionGuid\\":\\"663F36CF-79CC-452E-9B29-7F01E9167849\\",\\"typeName\\":\\"WorldPartData\\",\\"guid\\":\\"ED170122-0000-0000-0000-012043136906\\"},\\"guid\\":\\"ED170122-0000-0000-0000-000872916384\\",\\"variation\\":0,\\"name\\":\\"XP2\\\\/Objects\\\\/SkybarPlanters_01\\\\/SkybarPlanterSquare_01\\",\\"overrides\\":{},\\"origin\\":1,\\"originalRef\\":{\\"partitionGuid\\":\\"663F36CF-79CC-452E-9B29-7F01E9167849\\",\\"typeName\\":\\"ReferenceObjectData\\",\\"instanceGuid\\":\\"4B209482-31AB-4C46-838F-56DF09754B70\\"},\\"blueprintCtrRef\\":{\\"name\\":\\"XP2\\\\/Objects\\\\/SkybarPlanters_01\\\\/SkybarPlanterSquare_01\\",\\"partitionGuid\\":\\"91531887-598A-11E1-B16D-E6BABDB94B75\\",\\"typeName\\":\\"ObjectBlueprint\\",\\"instanceGuid\\":\\"24225227-7FD5-0C8C-BD8D-AB007C5B5C7C\\"},\\"localTransform\\":{\\"left\\":{\\"x\\":1,\\"y\\":0,\\"z\\":0},\\"up\\":{\\"x\\":0,\\"y\\":1,\\"z\\":0},\\"forward\\":{\\"x\\":0,\\"y\\":0,\\"z\\":1},\\"trans\\":{\\"x\\":37.279998779297,\\"y\\":10.239999771118,\\"z\\":16.945972442627}}}}","header":{"requiredBundles":"{\\"Levels\\\\/MP_Subway\\\\/MP_Subway_Settings_win32\\":true,\\"Levels\\\\/XP2_Skybar\\\\/TeamDM\\":true,\\"gameconfigurations\\\\/game\\":true,\\"Levels\\\\/XP2_Skybar\\\\/XP2_Skybar\\":true,\\"Levels\\\\/XP2_Skybar\\\\/DeathMatch\\":true}","timeStamp":1608906842811,"id":1,"mapName":"XP2_Skybar","gameModeName":"TeamDeathMatchC0","projectName":"1"}}'
		};
	}

	private RequestDeleteProjectMessage() {
		const save = [
			{
				id: 1,
				projectName: 'debugProject',
				mapName: 'XP2_Skybar',
				gameModeName: 'ConquestLargeC0',
				requiredBundles: 'none',
				timeStamp: 1592245943322
			},
			{
				id: 2,
				projectName: 'debugProject',
				mapName: 'XP2_Skybar',
				gameModeName: 'ConquestLargeC0',
				requiredBundles: 'none',
				timeStamp: 1592245944322
			},
			{
				id: 4,
				projectName: 'debugProject',
				mapName: 'XP2_Skybar',
				gameModeName: 'ConquestLargeC0',
				requiredBundles: 'none',
				timeStamp: 1592245946322
			},
			{
				id: 5,
				projectName: 'NewdebugProject',
				mapName: 'XP2_Skybar',
				gameModeName: 'ConquestLargeC0',
				requiredBundles: 'none',
				timeStamp: 1592245947322
			},
			{
				id: 6,
				projectName: 'NewdebugProject',
				mapName: 'XP2_Skybar',
				gameModeName: 'ConquestLargeC0',
				requiredBundles: 'none',
				timeStamp: 1592245948322
			}
		];
		return { type: 'SetProjectHeaders', payload: save };
	}

	private CreateGroup(commandActionResult: CommandActionResult) {
		return {
			type: 'CreatedGroup',
			sender: commandActionResult.sender,

			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid.toString(),
				name: commandActionResult.gameObjectTransferData.name
			}
		};
	}

	private DestroyGroup(command: any) {
		LogError('NotImplemented');
	}

	private SpawnGameObject(commandActionResult: CommandActionResult) {
		// Spawn blueprint at coordinate
		// Blueprint spawns, we get a list of entities
		// We send the whole thing to web again.
		// command.gameObjectTransferData.transform = command.gameObjectTransferData.transform.toTable();
		return {
			sender: commandActionResult.sender,
			type: 'SpawnedGameObject',
			gameObjectTransferData: {
				transform: commandActionResult.gameObjectTransferData.transform.toTable(),
				blueprintCtrRef: commandActionResult.gameObjectTransferData.blueprintCtrRef.toTable(),
				gameEntities: [
					{
						transform: {
							left: {
								x: 1,
								y: 0,
								z: 0
							},
							up: {
								x: 0,
								y: 1,
								z: 0
							},
							forward: {
								x: 0,
								y: 0,
								z: 1
							},
							trans: {
								x: 0,
								y: 0,
								z: 0
							}
						},
						instanceId: 3815363904,
						indexInBlueprint: 1,
						isSpatial: true,
						typeName: 'ClientStaticModelEntity',
						aabb: {
							transform: {
								left: {
									x: 1,
									y: 0,
									z: 0
								},
								up: {
									x: 0,
									y: 1,
									z: 0
								},
								forward: {
									x: 0,
									y: 0,
									z: 1
								},
								trans: {
									x: 0,
									y: 0,
									z: 0
								}
							},
							min: {
								x: -1,
								y: -1,
								z: -1
							},
							max: {
								x: 1,
								y: 1,
								z: 1
							}
						}
					},
					{
						instanceId: 3815363904,
						indexInBlueprint: 1,
						isSpatial: false,
						typeName: 'WhateverEntity'
					}
				],
				guid: commandActionResult.gameObjectTransferData.guid.toString(),
				parentData: commandActionResult.gameObjectTransferData.parentData.toTable(),
				name: commandActionResult.gameObjectTransferData.name,
				variation: commandActionResult.gameObjectTransferData.variation
			}
		};
	}

	private SetTransform(commandActionResult: CommandActionResult) {
		return {
			type: 'SetTransform',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid.toString(),
				transform: commandActionResult.gameObjectTransferData.transform.toTable()
			}
		};
	}

	private DestroyGameObject(commandActionResult: CommandActionResult) {
		// Delete all children of blueprint
		return {
			type: 'DeletedGameObject',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid.toString()
			}
		};
	}

	private SetObjectName(commandActionResult: CommandActionResult) {
		return {
			type: 'SetObjectName',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid.toString(),
				name: commandActionResult.gameObjectTransferData.name
			}
		};
	}

	private SetVariation(commandActionResult: CommandActionResult) {
		return {
			type: 'SetVariation',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid.toString(),
				variation: commandActionResult.gameObjectTransferData.variation
			}
		};
	}

	private EnableGameObject(commandActionResult: CommandActionResult) {
		return {
			type: 'EnabledBlueprint',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid.toString()
			}
		};
	}

	private DisableGameObject(commandActionResult: CommandActionResult) {
		return {
			type: 'DisabledBlueprint',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid.toString()
			}
		};
	}

	private SetEBXField(commandActionResult: CommandActionResult) {
		return {
			type: 'SetField',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid.toString(),
				overrides: commandActionResult.gameObjectTransferData.overrides
			}
		};
	}

	private SetScreenToWorldPositionMessage(args: SetScreenToWorldTransformMessage) {
		// const raycaster = new THREE.Raycaster();
		// raycaster.setFromCamera(args.coordinates, editor.threeManager.camera);
		// const intersects = raycaster.intersectObjects(editor.threeManager.scene.children, true);
		// if (intersects.length > 0) {
		// 	for (const intersect of intersects) {
		// 		if (intersect.object.name === 'groundPlane') {
		// 			return {
		// 				type: 'SetScreenToWorldPositionMessage',
		// 				position: intersect.point
		// 			};
		// 		}
		// 	}
		// }
		return null;
	}

	private MoveObjectMessage(args: MoveObjectMessage) {
		return null;
	}

	private UIReloaded() {
		// Real level from WebX, falling back to the canned XP2SKybar sample if it cannot be
		// reached -- so the UI still boots offline, which is what this debug data was for.
		void VEXTemulator.LoadWebXLevel().catch((e: any) => {
			console.warn('WebX unavailable (' + e.message + '); falling back to sample data');
			(window as any).vext.HandleResponse(JSON.parse(XP2SKybar));
			(window as any).vext.RegisterBlueprints(XP2SKybarBlueprints);
			setTimeout(() => {
				editor.Select(new Guid('ED170122-0000-0000-0000-001325353053'), false, true, true);
			}, 1);
		});
	}

	/** Keep asking for geometry that was not extracted yet, backing off as it converges. */
	private static async FillPendingMeshes(meshes: MeshManager, ui: any, level: string, objects: number): Promise<void> {
		// Keep going past the point where geometry is complete: textures land later still.
		for (let attempt = 0; attempt < 60; attempt++) {
			await new Promise((resolve) => setTimeout(resolve, 4000));

			const filled = await meshes.retryPending();
			meshes.repaint();

			if (filled > 0) {
				ui.setStatus(level.split('/')[1] + ': ' + objects + ' objects, ' + meshes.stats.attached + ' meshes');
			}
		}

		console.log('WebX: geometry settled at ' + meshes.stats.attached + ' meshes (' +
			meshes.pendingCount + ' without one)');
	}

	/**
	 * Load a real level into the standalone editor.
	 *
	 * Exposed on `window.loadLevel(path, game)` so a level can be swapped from the console before
	 * there is a picker in the UI.
	 */
	public static async LoadWebXLevel(levelPath?: string, game?: string): Promise<number> {
		const requested = requestedLevel();
		const level = levelPath === undefined ? requested.level : levelPath;
		const forGame = game === undefined ? requested.game : game;

		const started = performance.now();
		const source = new WebXSource(forGame);
		const ui = new StandaloneUI();

		// Start the meshes BEFORE loading, so geometry attaches to objects as they arrive rather
		// than needing a second pass over the level.
		const meshes = new MeshManager(level);
		const haveMeshes = await meshes.start();

		if (!haveMeshes) {
			console.log('WebX: no exported meshes -- run tools/meshes/export_level_meshes.py to draw geometry');
		}

		(window as any).meshes = meshes;

		await source.open();

		new MobileLayout().install();
		ui.mount(source, { game: forGame, level: level });
		ui.setStatus('loading ' + level.split('/')[1] + '…');

		console.log('WebX: ' + source.size + ' partitions indexed for ' + forGame);

		const loaded = await new LevelLoader(source).load(level, (batch) => {
			// One subtree per call: HandleResponse flushes the hierarchy queue on the batch's last
			// element, and the root is last.
			(window as any).vext.HandleResponse(batch, true);
		});

		console.log(
			'WebX: ' + level + ' -> ' + loaded + ' objects in ' + Math.round(performance.now() - started) + 'ms'
		);

		// The camera starts at (10,10,10) looking at the origin and a BF3 map is nowhere near it,
		// so without framing the level the viewport shows empty space and reads as a failed load.
		enableCameraControls();
		enableMeshPicking();
		frameLevel();

		ui.setStatus(level.split('/')[1] + ': ' + loaded + ' objects');

		if (haveMeshes) {
			const stats = meshes.stats;
			console.log('WebX: ' + stats.attached + ' meshes attached (' + stats.meshes + ' in the manifest)');
		}

		// The baked statics, whose transforms live in the level's Havok data rather than EBX. Runs
		// after the EBX walk so duplicates can be recognised and skipped.
		const statics = await new StaticModels(source, meshes).load(level, (batch) => {
			(window as any).vext.HandleResponse(batch, true);
		});

		if (statics > 0) {
			console.log('Rime: ' + statics + ' baked statics placed');
			ui.setStatus(level.split('/')[1] + ': ' + (loaded + statics) + ' objects');
			frameLevel();
		}

		// The level's own sun and sky, rather than a rig invented here.
		if (await new Lighting(source).apply(level)) {
			console.log('WebX: lit from the level\'s VisualEnvironment');
		}

		// The ground. Objects sit on it, so a level without it reads as floating.
		const patches = await new Terrain(level).load(meshes.groundMaterial);

		if (patches > 0) {
			console.log('Rime: terrain built from ' + patches + ' heightfield patches');
			(window as any).editor.threeManager.setPendingRender();
		}

		// Fill in geometry as the server finishes extracting it. Nothing is lost if this never
		// converges -- the objects are all there, some just have no mesh yet.
		if (haveMeshes) {
			void VEXTemulator.FillPendingMeshes(meshes, ui, level, loaded + statics);
		}

		return loaded;
	}
}
