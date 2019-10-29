import { Vec3 } from '@/script/types/primitives/Vec3';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';

export class AABB {
    constructor(public min: Vec3, public max: Vec3, public transform: LinearTransform) {
    }

    public setFromTable(table: any) {
        this.min = new Vec3().setFromTable(table.min);
        this.max = new Vec3().setFromTable(table.max);
        this.transform = new LinearTransform().setFromTable(table.transform);
        return this;
    }
}
