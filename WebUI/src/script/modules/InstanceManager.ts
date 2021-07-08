import { SpatialGameEntity } from '@/script/types/SpatialGameEntity';
import { BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, Vector3 } from 'three';

export default class InstanceManager {
	private static instance: InstanceManager;
	private readonly count = 1000;
	private instanceId = 0;
	private boxGeom = new BoxGeometry(
		1,
		1,
		1
	);

	private scale0Matrix = new Matrix4().scale(new Vector3(0, 0, 0));

	private material = new MeshBasicMaterial({
		color: new Color(SpatialGameEntity.HIGHLIGHTED_COLOR),
		wireframe: true,
		visible: true
	});

	private instancedMesh = new InstancedMesh(this.boxGeom, this.material, this.count);

	private constructor() {
		this.boxGeom.translate(0, 0.5, 0);
		this.instancedMesh.instanceMatrix.setUsage(DynamicDrawUsage);
		editor.threeManager.scene.add(this.instancedMesh);

		// Set all objects as invisible (scaled by 0) to start with
		for (let i = 0; i < this.count; i++) {
			this.instancedMesh.setMatrixAt(i, this.scale0Matrix);
		}
		this.instancedMesh.instanceMatrix.needsUpdate = true;
	}

	public static getInstance(): InstanceManager {
		if (!InstanceManager.instance) {
			InstanceManager.instance = new InstanceManager();
		}

		return InstanceManager.instance;
	}

	AddFromSpatialEntity(entity: SpatialGameEntity) {
		entity.instanceId = this.instanceId;
		this.instanceId++;
		this.SetMatrixFromSpatialEntity(entity);
	}

	SetMatrixFromSpatialEntity(entity: SpatialGameEntity) {
		// if (!entity.visible) return;
		this.instancedMesh.setMatrixAt(entity.instanceId, entity.matrixWorld.clone().scale(entity.AABBScale));
		this.instancedMesh.instanceMatrix.needsUpdate = true;
		editor.threeManager.setPendingRender();
	}

	SetColor(entity: SpatialGameEntity, color: Color) {
		this.instancedMesh.setColorAt(entity.instanceId, color);
		// @ts-ignore
		this.instancedMesh.instanceColor.needsUpdate = true;
		editor.threeManager.setPendingRender();
	}

	// All objects in the instancedMesh group are always visible, so in order to hide them we need to scale them to 0
	SetVisibility(entity: SpatialGameEntity, visible: boolean) {
		if (visible) {
			this.SetMatrixFromSpatialEntity(entity);
			// return;
		}

		// this.instancedMesh.setMatrixAt(entity.instanceId, this.scale0Matrix);
		// this.instancedMesh.instanceMatrix.needsUpdate = true;
		// editor.threeManager.setPendingRender();
	}
}
