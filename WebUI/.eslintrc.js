/* eslint-env node */
require('@rushstack/eslint-patch/modern-module-resolution');

module.exports = {
	env: {
		node: true
	},
	extends: [
		'eslint:recommended',
		'plugin:vue/essential',
		'@vue/eslint-config-typescript',
		'@vue/eslint-config-prettier'
	],
	rules: {
		semi: ['error', 'always'],
		'vue/multi-word-component-names': 'off'
	},
	overrides: [
		{
			// '@vue/eslint-config-typescript' only disables the core 'no-unused-vars' rule
			// (which misfires on TS-only syntax like type-only parameters) for *.ts/*.tsx,
			// not *.vue files with <script lang="ts">. Mirror that override here.
			files: ['*.vue'],
			rules: {
				'no-unused-vars': 'off'
			}
		}
	]
};
