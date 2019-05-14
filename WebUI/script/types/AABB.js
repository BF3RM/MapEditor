class AABB {
    constructor(min, max, transform) {
        this.min = min;
        this.max = max;
        this.transform = transform;
    }

    setFromTable(table) {
        this.min = new Vec3().setFromString(table.min);
        this.max = new Vec3().setFromString(table.max);
        this.transform = new LinearTransform().setFromTable(table.transform);

        return this;
    }
}