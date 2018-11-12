
class Vec3 extends THREE.Vector3{
    constructor(x,y,z) {
	    super(x,y,z);
    }

    Clone() {
        return new Vec3(this.x, this.y, this.z)
    }

    fromObject(object) {
        this.x = Number(object.x);
	    this.y = Number(object.y);
	    this.z = Number(object.z);
	    return this;
    }
	fromString(matrixString) {
		matrixString = matrixString.replace(/[(]/g,"");
		matrixString = matrixString.replace(/[)]/g,", ");
		let matrix = matrixString.split(",");
		this.x = Number(matrix[0]);
		this.y = Number(matrix[1]);
		this.z = Number(matrix[2]);
		return this;
	}
}

/**
 * @return {boolean}
 */
function Vec3Equals(vecA, vecB) {
    return(vecA.x === vecB.x && vecA.y === vecB.y && vecA.z === vecB.z);
}

function MatrixEquals(a, b) {

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

    toMatrix() {
        return [this.left.x, this.left.y, this.left.z, 0,this.up.x, this.up.y, this.up.z, 0, this.forward.x, this.forward.y, this.forward.z, 0, this.trans.x, this.trans.y, this.trans.z, 1];
    }
	toString() {
		return "(" + this.left.x + ", " + this.left.y  + ", " + this.left.z + ")" +
			"(" + this.up.x + ", " + this.up.y  + ", " + this.up.z + ")" +
			"(" + this.forward.x + ", " + this.forward.y  + ", " + this.forward.z + ")" +
			"(" + this.trans.x + ", " + this.trans.y  + ", " + this.trans.z + ")";
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