import { SpatialGameEntity } from '@/script/types/SpatialGameEntity';
import { signals } from '@/script/modules/Signals';
import { BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial } from 'three';

export default class InstanceManager {
	private static instance: InstanceManager;

	private instanceId = 0;
	private boxGeom = new BoxGeometry(
		1,
		1,
		1
	);

	private material = new MeshBasicMaterial({
		color: new Color(SpatialGameEntity.HIGHLIGHTED_COLOR),
		wireframe: true,
		visible: true
	});

	private instancedMesh = new InstancedMesh(this.boxGeom, this.material, 100000);

	private constructor() {
		this.boxGeom.translate(0, 0.5, 0);
		this.instancedMesh.instanceMatrix.setUsage(DynamicDrawUsage);
		editor.threeManager.scene.add(this.instancedMesh);
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
		if (!entity.visible) return;
		this.instancedMesh.setMatrixAt(entity.instanceId, entity.matrixWorld.clone().scale(entity.AABBScale));
		this.instancedMesh.instanceMatrix.needsUpdate = true;
		editor.threeManager.setPendingRender();
	}

	SetColor(entity: SpatialGameEntity, color: Color) {
		console.log('SET COLOR');
		this.instancedMesh.setColorAt(entity.instanceId, color);
		this.instancedMesh.instanceMatrix.needsUpdate = true;
		editor.threeManager.setPendingRender();
	}

	SetVisibility(entity: SpatialGameEntity, visible: boolean) {
		if (visible) {
			this.SetMatrixFromSpatialEntity(entity);
			return;
		}

		this.instancedMesh.setMatrixAt(entity.instanceId, new Matrix4());
		this.instancedMesh.instanceMatrix.needsUpdate = true;
		editor.threeManager.setPendingRender();
	}
}
