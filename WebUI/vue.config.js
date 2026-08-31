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
	// WebX (webx.powback.com) serves the EBX the standalone editor loads levels from, and sends no
	// Access-Control-Allow-Origin, so the browser refuses to fetch it cross-origin from the dev
	// server. Proxy it under a prefix instead -- WebXSource always requests `/webx/...`, so dev and
	// a same-origin deployment use identical URLs and nothing on the WebX host has to change.
	devServer: {
		proxy: {
			// Level geometry, extracted from the game on demand by tools/meshes/mesh_server.py
			// (which keeps Rime mounted so a cache miss costs a fraction of a second, not the ~30s
			// a fresh mount would). Without it running, the editor simply draws no meshes.
			'/meshes': {
				target: 'http://127.0.0.1:8091',
				changeOrigin: false,
				pathRewrite: { '^/meshes': '' }
			},
			'/webx': {
				target: 'https://webx.powback.com',
				changeOrigin: true,
				pathRewrite: { '^/webx': '' }
			}
		}
	},
	configureWebpack: {
		plugins: [
			new VextPackPlugin({
				hotReloadSupport: process.env.NODE_ENV !== 'production'
			})
		]
	}
};
