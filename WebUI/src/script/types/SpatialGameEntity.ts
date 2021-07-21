import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import { AxisAlignedBoundingBox } from '@/script/types/AxisAlignedBoundingBox';
import { IGameEntity } from '@/script/interfaces/IGameEntity';
import { Color, Matrix4, Object3D, Vector3 } from 'three';
import { CtrRef } from '@/script/types/CtrRef';
import InstanceManager from '@/script/modules/InstanceManager';

export class SpatialGameEntity extends Object3D implements IGameEntity {
	public static SELECTED_COLOR: Color = new Color(0xFF0000);
	public static HIGHLIGHTED_COLOR: Color = new Color(0x999999);
	public AABBScale: Vector3;
	public AABBTransformMatrix: Matrix4;

	constructor(public instanceId: number, public transform: LinearTransform, public initiatorRef: CtrRef, aabb: AxisAlignedBoundingBox) {
		super();
		this.AABBScale = aabb.max.clone().sub(aabb.min);
		// Calculate transformation matrix to offset AABB position to correct place
		const AABBCenter = new Vector3().copy(aabb.min).add(aabb.max).multiplyScalar(0.5);
		this.AABBTransformMatrix = new Matrix4().makeTranslation(AABBCenter.x, AABBCenter.y, AABBCenter.z);

		if (Math.max(...[aabb.max.x, aabb.max.y, aabb.max.z, aabb.min.x, aabb.min.y, aabb.min.z]) > 1000) {
			// Fix for wrong aabbs with sizes or offsets too large.
			this.AABBScale = new Vector3(1, 1, 1);
			this.AABBTransformMatrix = new Matrix4().identity();
		}

		this.type = 'SpatialGameEntity';
		this.matrixAutoUpdate = false;

		this.visible = false;
		this.updateMatrix();
		this.updateMatrixWorld();

		editor.threeManager.nextFrame(() => {
			InstanceManager.getInstance().AddFromSpatialEntity(this);
		});
	}

	public Delete() {
		InstanceManager.getInstance().DeleteSpatialEntity(this);
	}

	public onHighlight() {
		this.visible = true;
		InstanceManager.getInstance().SetVisibility(this, true);
		this.SetColor(SpatialGameEntity.HIGHLIGHTED_COLOR);
		editor.threeManager.setPendingRender();
	}

	public onUnhighlight() {
		this.visible = false;
		InstanceManager.getInstance().SetVisibility(this, false);
		editor.threeManager.setPendingRender();
	}

	public onDeselect() {
		this.visible = false;
		InstanceManager.getInstance().SetVisibility(this, false);
		editor.threeManager.setPendingRender();
	}

	public onSelect() {
		InstanceManager.getInstance().SetVisibility(this, true);
		this.visible = true;
		this.SetColor(SpatialGameEntity.SELECTED_COLOR);
		editor.threeManager.setPendingRender();
	}

	public SetColor(color: Color) {
		InstanceManager.getInstance().SetColor(this, color);
	}

	public updateTransform() {
		InstanceManager.getInstance().SetMatrixFromSpatialEntity(this);
	}
}
