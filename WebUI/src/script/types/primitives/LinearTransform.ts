import { Euler, Matrix4, Quaternion } from 'three';
import { IVec3, Vec3 } from '@/script/types/primitives/Vec3';
import { Quat } from '@/script/types/primitives/Quat';

export interface ILinearTransform {
	forward: IVec3;
	left: IVec3;
	trans: IVec3;
	up: IVec3;
}

export class LinearTransform {
	public forward: Vec3;
	public left: Vec3;
	public trans: Vec3;
	public up: Vec3;
	public _rotation: Quat = new Quat();
	public _scale: Vec3 = new Vec3(1, 1, 1);

	constructor(left: Vec3 = new Vec3().left, up: Vec3 = new Vec3().up, forward: Vec3 = new Vec3().forward, trans: Vec3 = new Vec3()) {
		this.left = left;
		this.up = up;
		this.forward = forward;
		this.trans = trans;
		this.UpdateMeta();
		return this;
	}

	public toMatrix() {
		const matrix = new Matrix4();
		matrix.elements = [this.left.x, this.left.y, this.left.z, 0, this.up.x, this.up.y, this.up.z, 0, this.forward.x, this.forward.y, this.forward.z, 0, this.trans.x, this.trans.y, this.trans.z, 1];
		return matrix;
	}

	public toString() {
		return '(' + this.left.x + ', ' + this.left.y + ', ' + this.left.z + ')' +
			'(' + this.up.x + ', ' + this.up.y + ', ' + this.up.z + ')' +
			'(' + this.forward.x + ', ' + this.forward.y + ', ' + this.forward.z + ')' +
			'(' + this.trans.x + ', ' + this.trans.y + ', ' + this.trans.z + ')';
	}

	public toTable() {
		return { left: this.left.toTable(), up: this.up.toTable(), forward: this.forward.toTable(), trans: this.trans.toTable() };
	}

	public setFromString(matrixString: string) {
		matrixString = matrixString.replace(/[(]/g, '');
		matrixString = matrixString.replace(/[)]/g, ', ');
		const matrix = matrixString.split(',');
		this.left = new Vec3(
			Number(matrix[0]),
			Number(matrix[1]),
			Number(matrix[2]));

		this.up = new Vec3(
			Number(matrix[3]),
			Number(matrix[4]),
			Number(matrix[5]));

		this.forward = new Vec3(
			Number(matrix[6]),
			Number(matrix[7]),
			Number(matrix[8]));

		this.trans = new Vec3(
			Number(matrix[9]),
			Number(matrix[10]),
			Number(matrix[11]));
		this.UpdateMeta();
		return this;
	}

	public setFromMatrix(matrix: Matrix4) {
		this.left = new Vec3(
			matrix.elements[0],
			matrix.elements[1],
			matrix.elements[2]);

		this.up = new Vec3(
			matrix.elements[4],
			matrix.elements[5],
			matrix.elements[6]);

		this.forward = new Vec3(
			matrix.elements[8],
			matrix.elements[9],
			matrix.elements[10]);

		this.trans = new Vec3(
			matrix.elements[12],
			matrix.elements[13],
			matrix.elements[14]);
		this.UpdateMeta();
		return this;
	}

	public set(linearTransform: LinearTransform) {
		this.left = linearTransform.left;
		this.up = linearTransform.up;
		this.forward = linearTransform.forward;
		return this;
	}

	public static setFromTable(table: ILinearTransform) {
		const left = Vec3.setFromTable(table.left);
		const up = Vec3.setFromTable(table.up);
		const forward = Vec3.setFromTable(table.forward);
		const trans = Vec3.setFromTable(table.trans);
		return new this(left, up, forward, trans);
	}

	public clone() {
		return new LinearTransform(this.left.clone(), this.up.clone(), this.forward.clone(), this.trans.clone());
	}

	public UpdateMeta() {
		this.toMatrix().decompose(this.position, this._rotation, this._scale);
	}

	get position(): Vec3 {
		return this.trans;
	}

	set position(value: Vec3) {
		this.trans = value;
	}

	get scale(): Vec3 {
		return this._scale;
	}

	set scale(value: Vec3) {
		const matrix = new Matrix4();
		this._scale = value;
		this.setFromMatrix(matrix.compose(this.trans, this.rotation, this._scale));
	}

	get rotation(): Quat {
		return this._rotation;
	}

	set rotation(value: Quat) {
		const matrix = new Matrix4();
		const pos = this.trans;
		const scale = this.scale;
		const rot = value;
		this.setFromMatrix(matrix.compose(pos, rot, scale));
		this._scale = scale;
		this._rotation = rot;
	}

	// get elements(): object[] {
	// 	const matrix = this.toMatrix();
	// 	return matrix.decompose();
	// }

	set elements(value: object[]) {
		this.position = value[0] as Vec3;
		this.rotation = (value[1] as Quat);
		this.scale = value[2] as Vec3;
	}

	get elements() {
		return [this.position, this.rotation, this.scale];
	}

	static fromJSON(json: EBX.JSON.LinearTransform): LinearTransform {
		const transform = new LinearTransform();
		if (json.right) {
			transform.left.copy(Vec3.fromJSON(json.right.$value)); // TODO: Confirm this
		}
		if (json.up) {
			transform.up.copy(Vec3.fromJSON(json.up.$value));
		}
		if (json.forward) {
			transform.forward.copy(Vec3.fromJSON(json.forward.$value));
		}
		if (json.trans) {
			transform.trans.copy(Vec3.fromJSON(json.trans.$value));
		}
		return transform;
	}
}
