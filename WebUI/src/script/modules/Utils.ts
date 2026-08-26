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
/**
 * The EBX types that render as a plain value rather than as a nested instance.
 *
 * A Set, not a chain of comparisons: the chain was 20 `||` branches, scoring 21 on cyclomatic
 * complexity -- the metric counts every one as a decision point -- and adding a type meant adding
 * another branch. Same answer, same case-insensitivity, complexity 1.
 */
const PRINTABLE_TYPES = new Set([
	'cstring',
	'single',
	'float8', 'float16', 'float32', 'float64',
	'int8', 'int16', 'int32', 'int64',
	'uint8', 'uint16', 'uint32', 'uint64',
	'lineartransform',
	'vec2', 'vec3', 'vec4',
	'boolean',
	'guid',
	'sbyte'
]);

export function isPrintable(type: string) {
	return PRINTABLE_TYPES.has(String(type).toLowerCase());
}
