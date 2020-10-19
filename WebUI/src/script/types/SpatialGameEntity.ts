import * as THREE from 'three';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import { AxisAlignedBoundingBox } from '@/script/types/AxisAlignedBoundingBox';
import { IGameEntity } from '@/script/interfaces/IGameEntity';
import { MeshBasicMaterial, Vector3 } from 'three';
import { Vec3 } from '@/script/types/primitives/Vec3';
import { RAYCAST_LAYER } from '@/script/types/Enums';

export class SpatialGameEntity extends THREE.Mesh implements IGameEntity {
	private static SELECTED_COLOR: THREE.Color = new THREE.Color(0xFF0000);
	private static HIGHLIGHTED_COLOR: THREE.Color = new THREE.Color(0x999999);
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
		this.type = 'SpatialGameEntity';

		const indices = new Uint16Array([0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7]);
		const positions = new Float32Array(8 * 3);

		const geometry = new THREE.BufferGeometry();
		geometry.setIndex(new THREE.BufferAttribute(indices, 1));
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

		this.instanceId = instanceId;
		this.transform = transform;
		this.matrixAutoUpdate = false;

		this.visible = false;
		this.box = new THREE.Box3(
			aabb.min,
			aabb.max);
		this.updateMatrix();

		this.layers.disable(RAYCAST_LAYER.GAMEOBJECT);
		this.layers.enable(RAYCAST_LAYER.GAMEENTITY);
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

	public SetColor(color: THREE.Color) {
		const material = this.material;
		if (!Array.isArray(material)) {
			(material as MeshBasicMaterial).color = color;
		}
		editor.threeManager.setPendingRender();
	}
}
