import { Vector4 } from 'three';

export interface IVec4 {
	x: number;
	y: number;
	z: number;
	w: number;
}

export class Vec4 extends Vector4 {
	constructor(x?: number, y?: number, z?: number, w?: number) {
		super(x, y, z, w);
	}

	public clone(): any {
		return new Vec4(this.x, this.y, this.z, this.w);
	}

	public static setFromTable(object: IVec4) {
		return new this(Number(object.x), Number(object.y), Number(object.z), Number(object.w));
	}

	public toTable(): IVec4 {
		return {
			x: this.x,
			y: this.y,
			z: this.z,
			w: this.w
		};
	}

	public toString(): string {
		return '(' + this.x + ',' + this.y + ',' + this.z + ',' + this.w + ')';
	}

	// Wire shape: { x: { $value }, y: { $value }, z: { $value }, w: { $value } }
	// (see PartitionSerializer:_EncodePrimitive).
	static fromJSON(json: any): Vec4 {
		return new Vec4().set(json.x.$value, json.y.$value, json.z.$value, json.w.$value);
	}
}
