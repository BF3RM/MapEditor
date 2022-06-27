/* eslint-env node */
require('@rushstack/eslint-patch/modern-module-resolution');

module.exports = {
	extends: [
		'eslint:recommended',
		'plugin:vue/essential',
		'@vue/eslint-config-typescript',
		'@vue/eslint-config-prettier'
	],
	rules: {
		semi: ['error', 'always'],
		'vue/multi-word-component-names': 'off',
		'no-def': 'off'
	}
};
