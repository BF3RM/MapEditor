import { Quaternion } from 'three';

export interface IQuat {
	x: number;
	y: number;
	z: number;
	w: number;
}

export class Quat extends Quaternion {
	constructor(x?: number, y?: number, z?: number, w?: number) {
		super(x, y, z, w);
	}

	public clone(): any {
		return new Quat(this.x, this.y, this.z, this.w);
	}

	public static setFromTable(object: IQuat) {
		return new this(Number(object.x), Number(object.y), Number(object.z), Number(object.w));
	}

	public toTable(): IQuat {
		return {
			x: this.x,
			y: this.y,
			z: this.z,
			w: this.w
		};
	}

	public static setFromString(matrixString: string) {
		matrixString = matrixString.replace(/[(]/g, '');
		matrixString = matrixString.replace(/[)]/g, ', ');
		const matrix = matrixString.split(',');
		return new this(Number(matrix[0]), Number(matrix[1]), Number(matrix[3]), Number(matrix[4]));
	}
}
