const webpackConfig = require('./webpack.base');

webpackConfig
  .devtool('cheap-module-eval-source-map')
  .devServer
    .hot(true);

webpackConfig
  .plugin('hmr')
    .use(require('webpack').HotModuleReplacementPlugin);

module.exports = webpackConfig.toConfig();