
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
