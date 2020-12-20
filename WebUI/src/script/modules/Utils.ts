
export function hasLowerCase(str: string) {
	return (/[a-z]/.test(str));
}

export function hasUpperCase(str: string) {
	return (/[A-Z]/.test(str));
}

export function getPaths(path: string) {
	const paths = path.split('/');
	paths.pop();
	return paths;
}

export function getFilename(path: string) {
	return path.split('/').filter((value) => {
		return value && value.length;
	}).reverse()[0];
}
export function isPrintable(type: string) {
	return (type === 'CString' ||
		type === 'Single' ||
		type === 'Float8' ||
		type === 'Float16' ||
		type === 'Float32' ||
		type === 'Float64' ||
		type === 'Int8' ||
		type === 'Int16' ||
		type === 'Int32' ||
		type === 'Int64' ||
		type === 'Uint8' ||
		type === 'Uint16' ||
		type === 'Uint32' ||
		type === 'Uint64' ||
		type === 'LinearTransform' ||
		type === 'Vec2' ||
		type === 'Vec3' ||
		type === 'Vec4' ||
		type === 'Boolean' ||
		type === 'Guid');
}
