const GoogleFontsPlugin = require('google-fonts-webpack-plugin');
module.exports = {
	configureWebpack: {
		plugins: [
			new GoogleFontsPlugin({
				fonts: [
					{ family: 'Overpass Mono' },
					{ family: 'Roboto' }
				]
			})
		]
	}
};
