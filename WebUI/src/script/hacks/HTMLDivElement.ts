// Prevents GoldenLayout from complaining about missing functions because it checks the containers too early.
// @ts-ignore
HTMLDivElement.prototype.width = () => {
	return 0;
};

// @ts-ignore
HTMLDivElement.prototype.height = () => {
	return 0;
};
