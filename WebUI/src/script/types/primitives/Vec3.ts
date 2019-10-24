import {Vector3} from "three";

export class Vec3 extends Vector3 {
	constructor(x?: number, y?: number, z?: number) {
		super(x, y, z);
	}

	public clone(): any {
		return new Vec3(this.x, this.y, this.z);
	}

	public setFromTable(object: {x: number, y: number, z: number}) {
		this.x = Number(object.x);
		this.y = Number(object.y);
		this.z = Number(object.z);
		return this;
	}

	public setFromString(matrixString: string) {
		matrixString = matrixString.replace(/[(]/g, '');
		matrixString = matrixString.replace(/[)]/g, ', ');
		const matrix = matrixString.split(',');
		this.x = Number(matrix[0]);
		this.y = Number(matrix[1]);
		this.z = Number(matrix[2]);
		return this;
	}
	get left() {
		return this.set(1, 0, 0);
	}

	get up() {
		return this.set(0, 1, 0);
	}

	get forward() {
		return this.set(0, 0, 1);
	}

}
