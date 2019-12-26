import { GameObject } from '@/script/types/GameObject';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import { Guid } from '@/script/types/Guid';
import { signals } from '@/script/modules/Signals';
import * as THREE from 'three';

export class SelectionGroup extends GameObject {
	public children: GameObject[];

	constructor(update: boolean = true) {
		super();
		this.guid = Guid.create();
		this.type = 'SelectionGroup';
		this.name = 'Selection Group';
	}
}
