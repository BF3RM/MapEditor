/* eslint-env node */
const { VextPackPlugin } = require('vextpack');

module.exports = {
	configureWebpack: {
		plugins: [
			new VextPackPlugin({
				hotReloadSupport: process.env.NODE_ENV !== 'production'
			})
		]
	}
};
