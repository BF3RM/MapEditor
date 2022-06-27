/* eslint-env node */
require('@rushstack/eslint-patch/modern-module-resolution');

module.exports = {
	extends: ['plugin:vue/essential', '@vue/eslint-config-typescript', '@vue/eslint-config-prettier'],
	rules: {
		semi: ['error', 'always'],
		indent: ['error', 'tab'],
		'no-useless-constructor': 0,
		'no-console': 0,
		'vue/no-unused-vars': 0,
		'no-unused-vars': 0,
		'quote-props': 'off',
		'no-multi-spaces': ['error', { exceptions: { VariableDeclarator: false } }],
		'func-call-spacing': 'off'
	}
};
