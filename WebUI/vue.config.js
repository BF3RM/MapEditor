const { VextPackPlugin } = require('vextpack');

const GoogleFontsPlugin = require('@beyonk/google-fonts-webpack-plugin');
module.exports = {
	configureWebpack: {
		plugins: [
			new GoogleFontsPlugin({
				fonts: [
					{ family: 'Overpass Mono' },
					{ family: 'Roboto' }
				]
			}),
			new VextPackPlugin({
				// OPTIONAL: Specify the location of the vuic compiler (not included in this package!)
				/// defaults to process.env.VUICC_PATH
				compilerPath: '../../../',

				// OPTIONAL: Custom file name of the compiler, defaults to 'vuicc.exe'
				compilerFile: 'vuicc.exe',

				// OPTIONAL: Specify the location where the ui.vuic should be placed, defaults to '../'
				outputPath: '../'
			})
		]
	}
};
