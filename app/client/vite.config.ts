import { defineConfig, loadEnv } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';
import Icons from 'unplugin-icons/vite';
import istanbul from 'vite-plugin-istanbul';
import react from '@vitejs/plugin-react';
import { version } from './package.json';

// https://vitejs.dev/config/
export default ({ mode }) => {
  process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };
  const { VITE_SUBPATH } = process.env;

  const productionOnlyPlugins = [];
  if (mode === 'production') {
    productionOnlyPlugins.push(
      createHtmlPlugin({
        minify: {
          collapseWhitespace: true,
          removeComments: true,
          removeRedundantAttributes: true,
          collapseBooleanAttributes: true,
          removeEmptyAttributes: true,
          minifyCSS: true,
          minifyJS: true,
        },
      }),
    );
  }

  return defineConfig({
    base: VITE_SUBPATH ? `${VITE_SUBPATH}/` : '/',
    build: {
      outDir: '../server/app/public',
      emptyOutDir: false,
      sourcemap: true,
      rolldownOptions: {
        output: {
          entryFileNames: `static/js/[name]-[hash].${version}.js`,
          chunkFileNames: `static/js/[name]-[hash].${version}.js`,
          assetFileNames: ({ names }) => {
            const name = names?.[0] || '';
            const css = /\.(css)$/.test(name);
            const font = /\.(woff|woff2|eot|ttf|otf)$/.test(name ?? '');
            const media = /\.(png|jpe?g|gif|svg|webp|webm|mp3)$/.test(name ?? ""); // prettier-ignore
            const type = css ? 'css/' : font ? 'fonts/' : media ? 'media/' : '';
            return `static/${type}[name]-[hash].${version}[extname]`;
          },
          // Group specific arcgis chunks to avoid large number of tiny files
          codeSplitting: {
            groups: [
              {
                name: 'calcite',
                test: /node_modules\/@esri\/calcite-components/i,
              },
              {
                name: 'arcgis-views-3d',
                test: /node_modules\/@arcgis\/core\/views\/(3d|SceneView)/,
              },
              {
                name: 'arcgis-views-2d',
                test: /node_modules\/@arcgis\/core\/views\/(2d|MapView|View2D)/,
              },
              {
                name: 'arcgis-views-ui',
                test: /node_modules\/@arcgis\/core\/views\/ui/,
              },
              {
                name: 'arcgis-views-core',
                test: /node_modules\/@arcgis\/core\/views/,
              },
              {
                name: 'arcgis-layers',
                test: /node_modules\/@arcgis\/core\/layers/,
              },
              {
                name: 'arcgis-geometry',
                test: /node_modules\/@arcgis\/core\/geometry/,
              },
              {
                name: 'arcgis-core',
                test: /node_modules\/@arcgis\/core/,
              },
            ],
          },
        },
      },
    },
    define: {
      'process.env': {},
    },
    optimizeDeps: {
      include: ['react', 'react-dom'],
    },
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [
      react({
        jsxImportSource: '@emotion/react',
      }),
      Icons({
        compiler: 'jsx',
        jsx: 'react',
      }),
      istanbul({
        cypress: true,
        requireEnv: false,
      }),
      ...productionOnlyPlugins,
    ],
    server: {
      port: 3000,
    },
  });
};
