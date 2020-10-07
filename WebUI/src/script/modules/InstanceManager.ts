import * as THREE from 'three';
import { SpatialGameEntity } from '@/script/types/SpatialGameEntity';
import { signals } from '@/script/modules/Signals';

export default class InstanceManager {
	private instanceId = 0;
	public boxGeom = new THREE.BoxBufferGeometry(
		1,
		1,
		1
	);

	public material = new THREE.MeshBasicMaterial({
		color: new THREE.Color(0xFF0000),
		wireframe: true,
		visible: true
	});

	mesh = new THREE.InstancedMesh(this.boxGeom, new THREE.MeshNormalMaterial(), 100000);
	constructor() {
		signals.editor.Ready.connect(this.onEditorReady.bind(this));
	}

	private onEditorReady() {
		editor.threeManager.scene.add(this.mesh);
	}

	AddFromSpatialEntity(entity: SpatialGameEntity) {
		entity.instanceId = this.instanceId;
		this.instanceId++;
		this.SetMatrixFromSpatialEntity(entity);
	}

	SetMatrixFromSpatialEntity(entity: SpatialGameEntity) {
		this.mesh.setMatrixAt(entity.instanceId, entity.matrixWorld);
		this.mesh.instanceMatrix.needsUpdate = true;
	}
}
