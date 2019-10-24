const path = require('path');

const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const Config = require('webpack-chain');

const webpackConfig = new Config();

webpackConfig
  .mode('development')
  .devtool('inline-source-map')
  .entry('app')
    .add('./src/main.ts');

webpackConfig.output
    .path(path.resolve(__dirname, 'dist'))
    .filename('[name].js')
    .publicPath('/');

webpackConfig.resolve
  .extensions
    .add('.ts')
    .add('.js')
    .end()
  .modules
    .add('node_modules')
    .end()
  .alias
    .set("@", path.resolve(__dirname, 'src'),)
    .end();

webpackConfig.module
  .rule('ts')
    .test(/\.ts$/)
    .use('ts-loader')
      .loader('ts-loader') // TODO: Set to transpileOnly and add external type checker
      .end()
    .exclude
      .add(/node_modules/)

// static assets

webpackConfig.module
  .rule('images')
    .test(/\.(png|jpe?g|gif|webp)(\?.*)?$/)
    .use('url-loader')
      .loader('url-loader')
      .options({
        limit: 4096,
        fallback: {
          loader: 'file-loader',
          options: {
            name: 'img/[name].[hash:8].[ext]'
          }
        }
      });

webpackConfig.module
  .rule('svg')
    .test(/\.(svg)(\?.*)?$/)
    .use('file-loader')
      .loader('file-loader')
      .options({
        name: 'img/[name].[hash:8].[ext]'
      });

webpackConfig.module
  .rule('fonts')
    .test(/\.(woff2?|eot|ttf|otf)(\?.*)?$/i)
    .use('url-loader')
      .loader('url-loader')
      .options({
        limit: 4096,
        fallback: {
          loader: 'file-loader',
          options: {
            name: 'fonts/[name].[hash:8].[ext]'
          }
        }
      });

webpackConfig.module
  .rule('css')
    .test(/\.css$/)
    .use('extract-css-loader')
      .loader(require('mini-css-extract-plugin').loader)
      .options({
        hmr: process.env.NODE_ENV === 'development'
      })
      .end()
    .use('css-loader')
      .loader('css-loader')

// plugins

webpackConfig
  .plugin('define')
    .use(require('webpack').DefinePlugin, [{
      'process.env': {
        NODE_ENV: 'development'
      }
    }])

webpackConfig
  .plugin('extract-css')
    .use(require('mini-css-extract-plugin'), [{
      filename: 'css/[name].[contenthash:8].css'
    }])

webpackConfig
  .plugin('html')
    .use(require('html-webpack-plugin'), [{
      template: path.resolve(__dirname, 'static', 'index.html')
    }])

module.exports = webpackConfig;
