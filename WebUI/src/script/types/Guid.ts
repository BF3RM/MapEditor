// https://github.com/NicolasDeveloper/guid-typescript/blob/12d4415d770c6ba746cbd85c852acde0eec19f62/lib/guid.ts
// Modified toJSON
export class Guid {
	public static EMPTY = '00000000-0000-0000-0000-000000000000';

	public static isGuid(guid: any) {
		const value: string = guid.toString();
		return guid && (guid instanceof Guid || Guid.validator.test(value));
	}

	public static create(guid?: string): Guid {
		if (!guid) { guid = [Guid.gen(2), Guid.gen(1), Guid.gen(1), Guid.gen(1), Guid.gen(3)].join('-'); }
		return new Guid(guid);
	}

	public static createEmpty(): Guid {
		return new Guid();
	}

	private static validator = new RegExp('^[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}$', 'i');

	private static gen(count: number) {
		let out: string = '';
		for (let i: number = 0; i < count; i++) {
			// tslint:disable-next-line:no-bitwise
			out += (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
		}
		return out;
	}

	private value: string = Guid.EMPTY;
	private key: string = Guid.EMPTY;

	private constructor(guid?: string) {
		if (guid && Guid.isGuid(guid)) {
			this.value = guid;
			this.key = guid;
		}
	}

	public static parse(guid: string) {
		return new Guid(guid);
	}

	/** Compares one Guid instance with another */
	public equals(other: Guid): boolean {
		return Guid.isGuid(other) && this.value === other.toString();
	}

	public isEmpty(): boolean {
		return this.value === Guid.EMPTY;
	}

	public toString(): string {
		return this.value;
	}

	public toJSON(): any {
		return this.value;
	}
}
