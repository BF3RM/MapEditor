const webpackConfig = require('./webpack.base');

webpackConfig
  .mode('production')
  .devtool('source-map')

webpackConfig
  .plugin('define')
  .tap(() => [{
    'process.env': {
        'NODE_ENV': 'production'
    }
  }]);

webpackConfig.optimization
  .minimizer('terser')
    .use(require('terser-webpack-plugin'), [{}])
    .end()
  .minimizer('css')
    .use(require('optimize-css-assets-webpack-plugin'), [{}])

module.exports = webpackConfig.toConfig();