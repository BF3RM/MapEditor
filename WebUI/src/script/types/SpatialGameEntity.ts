import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import { AxisAlignedBoundingBox } from '@/script/types/AxisAlignedBoundingBox';
import { IGameEntity } from '@/script/interfaces/IGameEntity';
import { Box3, BoxGeometry, Color, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { Vec3 } from '@/script/types/primitives/Vec3';
import { RAYCAST_LAYER } from '@/script/types/Enums';
import { CtrRef } from '@/script/types/CtrRef';

export class SpatialGameEntity extends Mesh implements IGameEntity {
	private static SELECTED_COLOR: Color = new Color(0xFF0000);
	private static HIGHLIGHTED_COLOR: Color = new Color(0x999999);
	private instanceId: number;
	public transform: LinearTransform;
	private box: Box3;
	private initiatorRef: CtrRef;

	constructor(instanceId: number, transform: LinearTransform, aabb: AxisAlignedBoundingBox, initiatorRef: CtrRef) {
		let vmax = aabb.max;
		if (vmax.x > 100000 || vmax.y > 100000 || vmax.z > 10000) {
			vmax = new Vec3(1, 1, 1);
		}
		let vmin = aabb.min;
		if (vmin.x > 100000 || vmin.y > 100000 || vmin.z > 10000) {
			vmin = new Vec3(0, 0, 0);
		}
		const boxGeom = new BoxGeometry(
			vmax.x - vmin.x,
			vmax.y - vmin.y,
			vmax.z - vmin.z
		);
		const center = new Vector3().copy(aabb.min).add(aabb.max).multiplyScalar(0.5);
		boxGeom.translate(center.x, center.y, center.z);

		super(boxGeom, new MeshBasicMaterial({
			color: SpatialGameEntity.SELECTED_COLOR,
			wireframe: true,
			visible: true
		}));
		this.type = 'SpatialGameEntity';

		this.instanceId = instanceId;
		this.transform = transform;
		this.matrixAutoUpdate = false;

		this.visible = false;
		this.box = new Box3(
			aabb.min,
			aabb.max);
		this.updateMatrix();

		this.layers.disable(RAYCAST_LAYER.GAMEOBJECT);
		this.layers.enable(RAYCAST_LAYER.GAMEENTITY);
		this.initiatorRef = initiatorRef;
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
