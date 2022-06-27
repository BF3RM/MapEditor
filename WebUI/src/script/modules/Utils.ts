export function hasLowerCase(str: string) {
	return /[a-z]/.test(str);
}

export function hasUpperCase(str: string) {
	return /[A-Z]/.test(str);
}

export function getPaths(path: string) {
	const paths = path.split('/');
	paths.pop();
	return paths;
}

export function getFilename(path: string) {
	return path
		.split('/')
		.filter((value) => {
			return value && value.length;
		})
		.reverse()[0];
}
export function isPrintable(type: string) {
	type = type.toLowerCase();
	return (
		type === 'cstring' ||
		type === 'single' ||
		type === 'float8' ||
		type === 'float16' ||
		type === 'float32' ||
		type === 'float64' ||
		type === 'int8' ||
		type === 'int16' ||
		type === 'int32' ||
		type === 'int64' ||
		type === 'uint8' ||
		type === 'uint16' ||
		type === 'uint32' ||
		type === 'uint64' ||
		type === 'lineartransform' ||
		type === 'vec2' ||
		type === 'vec3' ||
		type === 'vec4' ||
		type === 'boolean' ||
		type === 'guid' ||
		type === 'sbyte'
	);
}
