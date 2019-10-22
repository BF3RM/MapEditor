const webpackConfig = require('./webpack.base');

webpackConfig
    .mode('production')
    .devtool('source-map')

// TODO: Minify js/css

module.exports = webpackConfig.toConfig();