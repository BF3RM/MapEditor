import { SpatialGameEntity } from '@/script/types/SpatialGameEntity';
import { BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, Vector3 } from 'three';

/***
 * Singleton that handles an InstancedMesh with all the SpatialEntities. The material and mesh is shared for all
 * instances and are scaled and positioned correctly with the AABB matrix. The array of instances is rearranged so
 * visible entities are first and the count property is the amount of visible instances, so invisible instances
 * aren't rendered.
 * */

export default class InstanceManager {
	private static instance: InstanceManager;
	private readonly maxCount = 10000;
	private entityIds: number[] = [];
	private boxGeom = new BoxGeometry(
		1,
		1,
		1
	);

	private material = new MeshBasicMaterial({
		color: SpatialGameEntity.HIGHLIGHTED_COLOR,
		wireframe: true,
		visible: true
	});

	public instancedMesh = new InstancedMesh(this.boxGeom, this.material, this.maxCount);

	private constructor() {
		// this.instancedMesh.instanceMatrix.setUsage(DynamicDrawUsage);
		editor.threeManager.scene.add(this.instancedMesh);
		this.instancedMesh.count = 0;
	}

	public static getInstance(): InstanceManager {
		if (!InstanceManager.instance) {
			InstanceManager.instance = new InstanceManager();
		}

		return InstanceManager.instance;
	}

	private swapInstances(index1: number, index2: number) {
		// Cache stuff in entityIds[index1]
		const cachedMatrix = new Matrix4();
		this.instancedMesh.getMatrixAt(index1, cachedMatrix);
		const cachedInstanceId = this.entityIds[index1];

		// Put entityIds[index2] info in entityIds[index1]
		const matrix = new Matrix4();
		this.instancedMesh.getMatrixAt(index2, matrix);
		this.instancedMesh.setMatrixAt(index1, matrix);
		this.entityIds[index1] = this.entityIds[index2];

		// Put cached info in entityIds[index2]
		this.instancedMesh.setMatrixAt(index2, cachedMatrix);
		this.entityIds[index2] = cachedInstanceId;
	}

	private setMatrixFromSpatialEntity(entity: SpatialGameEntity, index: number) {
		this.instancedMesh.setMatrixAt(index, entity.matrixWorld.clone().multiply(entity.AABBTransformMatrix).scale(entity.AABBScale));
		this.instancedMesh.instanceMatrix.needsUpdate = true;
	}

	AddFromSpatialEntity(entity: SpatialGameEntity) {
		this.entityIds.push(entity.instanceId);
		this.setMatrixFromSpatialEntity(entity, this.entityIds.length - 1);
		// Don't increase count because we assume is not visible yet.
	}

	DeleteSpatialEntity(entity: SpatialGameEntity) {
		const index = this.entityIds.findIndex((el) =>
			el === entity.instanceId
		);

		if (index === -1) {
			console.error('Tried to delete an entity that hasn\'t been registered in InstanceManager');
			return;
		}

		// Swap [index] and [length-1] instances and pop
		// instance
		this.swapInstances(this.entityIds.length - 1, index);
		this.entityIds.pop();

		if (index < this.instancedMesh.count) {
			// If it was visible decrease count by 1 as it got removed
			this.instancedMesh.count--;
		}
	}

	SetMatrixFromSpatialEntity(entity: SpatialGameEntity) {
		const n = this.entityIds.findIndex((el) =>
			el === entity.instanceId
		);
		this.setMatrixFromSpatialEntity(entity, n);
	}

	SetColor(entity: SpatialGameEntity, color: Color) {
		const n = this.entityIds.findIndex((el) =>
			el === entity.instanceId
		);
		this.instancedMesh.setColorAt(n, color);
		if (this.instancedMesh.instanceColor) {
			this.instancedMesh.instanceColor.needsUpdate = true;
		}
	}

	SetVisibility(entity: SpatialGameEntity, visible: boolean) {
		const n = this.entityIds.findIndex((el) =>
			el === entity.instanceId
		);
		if (n === -1) {
			console.error('Tried to set visibility of an entity that hasn\'t been registered in InstanceManager');
			return;
		}
		if (visible) {
			if (n < this.instancedMesh.count) {
				// Already visible
			} else {
				// Swap [n] and [count] instances and increase count by 1, so the new visible entity is the last visible
				// instance
				this.swapInstances(this.instancedMesh.count, n);

				// Increase count
				this.instancedMesh.count++;
				this.instancedMesh.instanceMatrix.needsUpdate = true;
			}
		} else {
			if (n < this.instancedMesh.count) {
				// Swap [n] with [count-1] instances and decrease count by 1, so the new invisible instance is after the
				// last visible instance
				this.swapInstances(this.instancedMesh.count - 1, n);

				// Decrease count
				this.instancedMesh.count--;
				this.instancedMesh.instanceMatrix.needsUpdate = true;
			} else {
				// Already invisible
			}
		}
	}
}
