const { VextPackPlugin } = require('vextpack');

module.exports = {
	configureWebpack: {
		plugins: [
			new VextPackPlugin({
				compilerPath: '../Tools',
				hotReloadSupport: process.env.NODE_ENV !== 'production'
			})
		]
	}
};
