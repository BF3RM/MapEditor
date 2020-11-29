export function capitalize(string: string): string {
	return `${string.charAt(0).toUpperCase()}${string.slice(1)}`;
}

export function removeExtension(string: string): string {
	if (!string.includes('.')) {
		return string;
	}

	const i = string.lastIndexOf('.');
	return string.slice(0, i);
}
