import { Vector2 } from 'three';

export class Vec2 extends Vector2 {
	constructor(x?: number, y?: number) {
		super(x, y);
	}

	public clone(): any {
		return new Vec2(this.x, this.y);
	}

	public setFromTable(object: { x: number; y: number }) {
		this.x = Number(object.x);
		this.y = Number(object.y);
		return this;
	}

	public setFromString(matrixString: string) {
		matrixString = matrixString.replace(/[(]/g, '');
		matrixString = matrixString.replace(/[)]/g, ', ');
		const matrix = matrixString.split(',');
		this.x = Number(matrix[0]);
		this.y = Number(matrix[1]);
		return this;
	}
}
