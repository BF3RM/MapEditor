import { Matrix4 } from 'three';
import { Vec3 } from '@/script/types/primitives/Vec3';

export class LinearTransform {
	public forward: Vec3;
	public left: Vec3;
	public trans: Vec3;
	public up: Vec3;

	constructor(left: Vec3 = new Vec3().left, up: Vec3 = new Vec3().up, forward: Vec3 = new Vec3().forward, trans: Vec3 = new Vec3()) {
		this.left = left;
		this.up = up;
		this.forward = forward;
		this.trans = trans;
		return this;
	}

	public toMatrix() {
		return new Matrix4().set(this.left.x, this.left.y, this.left.z, this.trans.x, this.up.x, this.up.y, this.up.z, this.trans.y, this.forward.x, this.forward.y, this.forward.z, this.trans.z, 0, 0, 0, 1);
	}

	public toString() {
		return '(' + this.left.x + ', ' + this.left.y + ', ' + this.left.z + ')' +
			'(' + this.up.x + ', ' + this.up.y + ', ' + this.up.z + ')' +
			'(' + this.forward.x + ', ' + this.forward.y + ', ' + this.forward.z + ')' +
			'(' + this.trans.x + ', ' + this.trans.y + ', ' + this.trans.z + ')';
	}

	public toTable() {
		return { left: this.left, up: this.up, forward: this.forward, trans: this.trans };
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
		return this;
	}

	public setFromTable(table: { left: { x: number, y: number, z: number }, up: { x: number, y: number, z: number }, forward: { x: number, y: number, z: number }, trans: { x: number, y: number, z: number } }) {
		this.left = new Vec3(table.left.x, table.left.y, table.left.z);
		this.up = new Vec3(table.up.x, table.up.y, table.up.z);
		this.forward = new Vec3(table.forward.x, table.forward.y, table.forward.z);
		this.trans = new Vec3(table.trans.x, table.trans.y, table.trans.z);
		return this;
	}

	public clone() {
		return new LinearTransform(this.left.clone(), this.up.clone(), this.forward.clone(), this.trans.clone());
	}
}
