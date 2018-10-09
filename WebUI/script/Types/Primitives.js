
class Vec3 {
    constructor(x,y,z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    Clone() {
        return new Vec3(this.x, this.y, this.z)
    }
}

class LinearTransform {
    constructor(left, up, forward, trans) {
        if(!arguments.length) {
            left = new Vec3(1, 0, 0);
            up = new Vec3(0, 1, 0);
            forward = new Vec3(0, 0, 1);
            trans = new Vec3(0, 0, 0);
        }
        this.left = left;
        this.up = up;
        this.forward = forward;
        this.trans = trans;
        return this;
    }

    getAsArray() {
        return [this.left.x, this.left.y, this.left.z, this.up.x, this.up.y, this.up.z, this.forward.x, this.forward.y, this.forward.z, this.trans.x, this.trans.y, this.trans.z];
    }

    setFromString(matrixString) {
    	matrixString = matrixString.replace(/[(]/g,"");
	    matrixString = matrixString.replace(/[)]/g,", ");
        let matrix = matrixString.split(",");
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
    setFromMatrix(matrix) {
        let matrixArray = matrix.toArray();

        this.left = new Vec3(
            matrixArray[0],
            matrixArray[1],
            matrixArray[2]);

        this.up = new Vec3(
            matrixArray[4],
            matrixArray[5],
            matrixArray[6]);

        this.forward = new Vec3(
            matrixArray[8],
            matrixArray[9],
            matrixArray[10]);

        this.trans = new Vec3(
            matrixArray[12],
            matrixArray[13],
            matrixArray[14]);
        return this;
    }
    Clone() {
        return new LinearTransform(this.left, this.up, this.forward, this.trans)
    }
}

class Variation {
    constructor(name, nameHash) {
        this.name = name;
        this.nameHash = nameHash;
    }
}