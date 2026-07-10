/* eslint-env node */
const { VextPackPlugin } = require('vextpack');

module.exports = {
	// Gameface serves the WebUI from `webui://main/`, where an absolute asset
	// path like `/js/app.js` does NOT resolve to the packed vuic files, so the
	// script tags 404 and the app never boots. Use a relative publicPath so the
	// emitted tags are `js/app.js` (resolved against the page URL).
	publicPath: '',
	// Gameface (Coherent) does NOT execute `<script defer>` tags, so the default
	// Vue CLI output (`<script defer src=...>`) never runs and the app never
	// boots. Force blocking script tags -- matching the working Gameface mods.
	chainWebpack: (config) => {
		config.plugin('html').tap((args) => {
			if (args[0]) {
				args[0].scriptLoading = 'blocking';
			}
			return args;
		});
	},
	configureWebpack: {
		plugins: [
			new VextPackPlugin({
				hotReloadSupport: process.env.NODE_ENV !== 'production'
			})
		]
	}
};
