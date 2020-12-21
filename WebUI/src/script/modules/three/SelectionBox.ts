import { Camera, Frustum, Mesh, Object3D, Scene, Vector3 } from 'three';

export default class SelectionBox {
	camera: Camera;
	collection: Object3D[];
	deep: number;
	endPoint: Vector3;
	scene: Scene;
	startPoint: Vector3;

	frustum = new Frustum();
	center = new Vector3();

	tmpPoint = new Vector3();

	vecNear = new Vector3();
	vecTopLeft = new Vector3();
	vecTopRight = new Vector3();
	vecDownRight = new Vector3();
	vecDownLeft = new Vector3();

	vecFarTopLeft = new Vector3();
	vecFarTopRight = new Vector3();
	vecFarDownRight = new Vector3();
	vecFarDownLeft = new Vector3();

	vectemp1 = new Vector3();
	vectemp2 = new Vector3();
	vectemp3 = new Vector3();

	constructor(camera: Camera, scene: Scene, deep?: number) {
		this.camera = camera;
		this.scene = scene;
		this.startPoint = new Vector3();
		this.endPoint = new Vector3();
		this.collection = [];
		this.deep = deep || Number.MAX_VALUE;
	}

	select(startPoint?: Vector3, endPoint?: Vector3): Object3D[] {
		this.startPoint = startPoint || this.startPoint;
		this.endPoint = endPoint || this.endPoint;
		this.collection = [];

		this.updateFrustum(this.startPoint, this.endPoint);
		this.searchChildInFrustum(this.frustum, this.scene);

		return this.collection;
	}

	updateFrustum(startPoint: Vector3, endPoint: Vector3): void {
		startPoint = startPoint || this.startPoint;
		endPoint = endPoint || this.endPoint;

		// Avoid invalid frustum

		if (startPoint.x === endPoint.x) {
			endPoint.x += Number.EPSILON;
		}

		if (startPoint.y === endPoint.y) {
			endPoint.y += Number.EPSILON;
		}

		// @ts-ignore
		this.camera.updateProjectionMatrix();
		this.camera.updateMatrixWorld();

		// @ts-ignore
		if (this.camera.isPerspectiveCamera) {
			this.tmpPoint.copy(startPoint);
			this.tmpPoint.x = Math.min(startPoint.x, endPoint.x);
			this.tmpPoint.y = Math.max(startPoint.y, endPoint.y);
			endPoint.x = Math.max(startPoint.x, endPoint.x);
			endPoint.y = Math.min(startPoint.y, endPoint.y);

			this.vecNear.setFromMatrixPosition(this.camera.matrixWorld);
			this.vecTopLeft.copy(this.tmpPoint);
			this.vecTopRight.set(endPoint.x, this.tmpPoint.y, 0);
			this.vecDownRight.copy(endPoint);
			this.vecDownLeft.set(this.tmpPoint.x, endPoint.y, 0);

			this.vecTopLeft.unproject(this.camera);
			this.vecTopRight.unproject(this.camera);
			this.vecDownRight.unproject(this.camera);
			this.vecDownLeft.unproject(this.camera);

			this.vectemp1.copy(this.vecTopLeft).sub(this.vecNear);
			this.vectemp2.copy(this.vecTopRight).sub(this.vecNear);
			this.vectemp3.copy(this.vecDownRight).sub(this.vecNear);
			this.vectemp1.normalize();
			this.vectemp2.normalize();
			this.vectemp3.normalize();

			this.vectemp1.multiplyScalar(this.deep);
			this.vectemp2.multiplyScalar(this.deep);
			this.vectemp3.multiplyScalar(this.deep);
			this.vectemp1.add(this.vecNear);
			this.vectemp2.add(this.vecNear);
			this.vectemp3.add(this.vecNear);

			const planes = this.frustum.planes;

			planes[0].setFromCoplanarPoints(this.vecNear, this.vecTopLeft, this.vecTopRight);
			planes[1].setFromCoplanarPoints(this.vecNear, this.vecTopRight, this.vecDownRight);
			planes[2].setFromCoplanarPoints(this.vecDownRight, this.vecDownLeft, this.vecNear);
			planes[3].setFromCoplanarPoints(this.vecDownLeft, this.vecTopLeft, this.vecNear);
			planes[4].setFromCoplanarPoints(this.vecTopRight, this.vecDownRight, this.vecDownLeft);
			planes[5].setFromCoplanarPoints(this.vectemp3, this.vectemp2, this.vectemp1);
			planes[5].normal.multiplyScalar(-1);
		} else { // @ts-ignore
			if (this.camera.isOrthographicCamera) {
				const left = Math.min(startPoint.x, endPoint.x);
				const top = Math.max(startPoint.y, endPoint.y);
				const right = Math.max(startPoint.x, endPoint.x);
				const down = Math.min(startPoint.y, endPoint.y);

				this.vecTopLeft.set(left, top, -1);
				this.vecTopRight.set(right, top, -1);
				this.vecDownRight.set(right, down, -1);
				this.vecDownLeft.set(left, down, -1);

				this.vecFarTopLeft.set(left, top, 1);
				this.vecFarTopRight.set(right, top, 1);
				this.vecFarDownRight.set(right, down, 1);
				this.vecFarDownLeft.set(left, down, 1);

				this.vecTopLeft.unproject(this.camera);
				this.vecTopRight.unproject(this.camera);
				this.vecDownRight.unproject(this.camera);
				this.vecDownLeft.unproject(this.camera);

				this.vecFarTopLeft.unproject(this.camera);
				this.vecFarTopRight.unproject(this.camera);
				this.vecFarDownRight.unproject(this.camera);
				this.vecFarDownLeft.unproject(this.camera);

				const planes = this.frustum.planes;

				planes[0].setFromCoplanarPoints(this.vecTopLeft, this.vecFarTopLeft, this.vecFarTopRight);
				planes[1].setFromCoplanarPoints(this.vecTopRight, this.vecFarTopRight, this.vecFarDownRight);
				planes[2].setFromCoplanarPoints(this.vecFarDownRight, this.vecFarDownLeft, this.vecDownLeft);
				planes[3].setFromCoplanarPoints(this.vecFarDownLeft, this.vecFarTopLeft, this.vecTopLeft);
				planes[4].setFromCoplanarPoints(this.vecTopRight, this.vecDownRight, this.vecDownLeft);
				planes[5].setFromCoplanarPoints(this.vecFarDownRight, this.vecFarTopRight, this.vecFarTopLeft);
				planes[5].normal.multiplyScalar(-1);
			} else {
				console.error('THREE.SelectionBox: Unsupported camera type.');
			}
		}
	}

	searchChildInFrustum(frustum: Frustum, object: Object3D): void {
		// @ts-ignore
		if (object.isMesh || object.isLine || object.isPoints) {
			// @ts-ignore
			if (object.material !== undefined) {
				// @ts-ignore
				if (object.geometry.boundingSphere === null) object.geometry.computeBoundingSphere();

				// @ts-ignore
				this.center.copy(object.geometry.boundingSphere.center);

				this.center.applyMatrix4(object.matrixWorld);

				if (frustum.containsPoint(this.center)) {
					this.collection.push(object);
				}
			}
		}

		if (object.children.length > 0) {
			for (let x = 0; x < object.children.length; x++) {
				this.searchChildInFrustum(frustum, object.children[x]);
			}
		}
	}
}

export { SelectionBox };
