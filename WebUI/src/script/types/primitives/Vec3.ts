import { Color, Vector3 } from 'three';

export interface IVec3 {
	x: number;
	y: number;
	z: number;
}

export class Vec3 extends Vector3 {
	constructor(x?: number, y?: number, z?: number) {
		super(x, y, z);
	}

	public static Zero = new Vec3(0, 0, 0);

	public clone(): any {
		return new Vec3(this.x, this.y, this.z);
	}

	public static setFromTable(object: IVec3) {
		return new this(Number(object.x), Number(object.y), Number(object.z));
	}

	static fromJSON(json: EBX.JSON.Vec3): Vec3 {
		return new Vec3().set(json.x.$value, json.y.$value, json.z.$value);
	}

	public toTable(): IVec3 {
		return {
			x: this.x,
			y: this.y,
			z: this.z
		};
	}

	public toString(): string {
		return '(' + this.x + ',' + this.y + ',' + this.z + ')';
	}

	public static setFromString(matrixString: string) {
		matrixString = matrixString.replace(/[(]/g, '');
		matrixString = matrixString.replace(/[)]/g, ', ');
		const matrix = matrixString.split(',');
		return new this(Number(matrix[0]), Number(matrix[1]), Number(matrix[3]));
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
