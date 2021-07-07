import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import { AxisAlignedBoundingBox } from '@/script/types/AxisAlignedBoundingBox';
import { IGameEntity } from '@/script/interfaces/IGameEntity';
import { Color, Object3D, Vector3 } from 'three';
import { RAYCAST_LAYER } from '@/script/types/Enums';
import { CtrRef } from '@/script/types/CtrRef';
import InstanceManager from '@/script/modules/InstanceManager';

export class SpatialGameEntity extends Object3D implements IGameEntity {
	public static SELECTED_COLOR: Color = new Color(0xFF0000);
	public static HIGHLIGHTED_COLOR: Color = new Color(0x999999);
	public AABBScale: Vector3;

	constructor(public instanceId: number, public transform: LinearTransform, public initiatorRef: CtrRef, aabb: AxisAlignedBoundingBox) {
		super();
		this.AABBScale = aabb.max.clone().sub(aabb.min);

		this.type = 'SpatialGameEntity';
		this.matrixAutoUpdate = false;

		this.visible = false;
		this.updateMatrix();

		this.layers.disable(RAYCAST_LAYER.GAMEOBJECT);
		this.layers.enable(RAYCAST_LAYER.GAMEENTITY);
		this.updateMatrixWorld();
		console.log(this.position);
		editor.threeManager.nextFrame(() => {
			InstanceManager.getInstance().AddFromSpatialEntity(this);
		});
	}

	public onHighlight() {
		this.SetColor(SpatialGameEntity.HIGHLIGHTED_COLOR);
		this.visible = true;
		InstanceManager.getInstance().SetVisibility(true);
	}

	public onUnhighlight() {
		this.visible = false;
		InstanceManager.getInstance().SetVisibility(false);
	}

	public onDeselect() {
		this.visible = false;
		InstanceManager.getInstance().SetVisibility(false);
	}

	public onSelect() {
		this.SetColor(SpatialGameEntity.SELECTED_COLOR);
		InstanceManager.getInstance().SetVisibility(true);
		this.visible = true;
	}

	public SetColor(color: Color) {
		/* const material = this.material;
		if (!Array.isArray(material)) {
			(material as MeshBasicMaterial).color = color;
		}
		 */
		InstanceManager.getInstance().SetColor(this, color);
		editor.threeManager.setPendingRender();
	}

	public updateTransform() {
		InstanceManager.getInstance().SetMatrixFromSpatialEntity(this);
	}
}
