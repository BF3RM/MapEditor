import * as THREE from 'three';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import { AxisAlignedBoundingBox } from '@/script/types/AxisAlignedBoundingBox';
import { IGameEntity } from '@/script/interfaces/IGameEntity';
import { Vector3 } from 'three';
import { Vec3 } from '@/script/types/primitives/Vec3';

export class SpatialGameEntity extends THREE.Mesh implements IGameEntity {
	private static SELECTED_COLOR: number = 0xFF0000;
	private static HIGHLIGHTED_COLOR: number = 0x999999;
	private readonly aabb: THREE.LineSegments;
	private instanceId: number;
	public transform: LinearTransform;
	private box: THREE.Box3;

	constructor(instanceId: number, transform: LinearTransform, aabb: AxisAlignedBoundingBox) {
		const pointsGeom = new THREE.Geometry();
		pointsGeom.vertices.push(
			aabb.min,
			aabb.max
		);

		const center = new THREE.Vector3().copy(pointsGeom.vertices[0]).add(pointsGeom.vertices[1]).multiplyScalar(0.5);

		let vmax = aabb.max;
		if (vmax.x > 100000 || vmax.y > 100000 || vmax.z > 10000) {
			vmax = new Vec3(1, 1, 1);
		}
		let vmin = aabb.min;
		if (vmin.x > 100000 || vmin.y > 100000 || vmin.z > 10000) {
			vmin = new Vec3(0, 0, 0);
		}
		const boxGeom = new THREE.BoxGeometry(
			vmax.x - vmin.x,
			vmax.y - vmin.y,
			vmax.z - vmin.z
		);
		boxGeom.translate(center.x, center.y, center.z);

		super(boxGeom, new THREE.MeshBasicMaterial({
			color: SpatialGameEntity.SELECTED_COLOR,
			wireframe: true,
			visible: true
		}));

		const color = SpatialGameEntity.SELECTED_COLOR;

		const indices = new Uint16Array([0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7]);
		const positions = new Float32Array(8 * 3);

		const geometry = new THREE.BufferGeometry();
		geometry.setIndex(new THREE.BufferAttribute(indices, 1));
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

		// this.aabb = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color }));
		// this.add(this.aabb);

		this.instanceId = instanceId;
		this.transform = transform;
		this.matrixAutoUpdate = false;

		this.visible = false;
		this.box = new THREE.Box3(
			aabb.min,
			aabb.max);
		this.updateMatrix();
		this.update();
	}

	public updateTransform() {
		const matrix = new THREE.Matrix4();
		matrix.set(
			this.transform.left.x, this.transform.up.x, this.transform.forward.x, this.transform.trans.x,
			this.transform.left.y, this.transform.up.y, this.transform.forward.y, this.transform.trans.y,
			this.transform.left.z, this.transform.up.z, this.transform.forward.z, this.transform.trans.z,
			0, 0, 0, 1);

		// As the position is local, we have to detach the object from its parent first
		const parent = this.parent;

		// remove child from parent and add it to scene
		if (parent !== null) {
			editor.threeManager.attachToScene(this);
		}

		matrix.decompose(this.position, this.quaternion, this.scale);

		editor.threeManager.setPendingRender();

		// remove child from scene and add it to parent
		if (parent !== null) {
			parent.attach(this);
		}
		editor.threeManager.setPendingRender();
	}

	public update() {
		if (this.box.isEmpty()) {
			return;
		}

		const min = this.box.min;
		const max = this.box.max;

		/*
		  5____4
		1/___0/|
		| 6__|_7
		2/___3/
		0: max.x, max.y, max.z
		1: min.x, max.y, max.z
		2: min.x, min.y, max.z
		3: max.x, min.y, max.z
		4: max.x, max.y, min.z
		5: min.x, max.y, min.z
		6: min.x, min.y, min.z
		7: max.x, min.y, min.z
		*/

		/* if (!(this.aabb.geometry instanceof THREE.Geometry)) {
			const position = this.aabb.geometry.attributes.position;
			const array = position.array as any[];

			array[0] = max.x;
			array[1] = max.y;
			array[2] = max.z;
			array[3] = min.x;
			array[4] = max.y;
			array[5] = max.z;
			array[6] = min.x;
			array[7] = min.y;
			array[8] = max.z;
			array[9] = max.x;
			array[10] = min.y;
			array[11] = max.z;
			array[12] = max.x;
			array[13] = max.y;
			array[14] = min.z;
			array[15] = min.x;
			array[16] = max.y;
			array[17] = min.z;
			array[18] = min.x;
			array[19] = min.y;
			array[20] = min.z;
			array[21] = max.x;
			array[22] = min.y;
			array[23] = min.z;

			// position.needsUpdate = true;
		}
		 */

		// this.aabb.geometry.computeBoundingBox();
	}

	public onHighlight() {
		this.SetColor(SpatialGameEntity.HIGHLIGHTED_COLOR);
		this.visible = true;
	}

	public onUnhighlight() {
		this.visible = false;
	}

	public onDeselect() {
		this.visible = false;
	}

	public onSelect() {
		this.SetColor(SpatialGameEntity.SELECTED_COLOR);
		this.visible = true;
	}

	public SetColor(color: number) {
		// (this.aabb.material as THREE.LineBasicMaterial).color.setHex(color);
		editor.threeManager.setPendingRender();
	}
}
