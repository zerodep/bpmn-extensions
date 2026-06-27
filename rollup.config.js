import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';

/**
 * Bundle the ESM source into a self-contained CommonJS file for `require` consumers.
 *
 * feelin (and its dependencies) are ESM-only, so they are bundled in. bpmn-elements is a
 * peer dependency and stays external — consumers bring their own.
 */
/**
 * The root package.json is `type: module`, so a `.js` file under it would be loaded as ESM.
 * Emit a `dist/package.json` marking the bundle as CommonJS for `require` consumers.
 */
function commonjsPackageJson() {
  return {
    name: 'commonjs-package-json',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'package.json', source: JSON.stringify({ type: 'commonjs' }, null, 2) + '\n' });
    },
  };
}

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/index.js',
    format: 'cjs',
    exports: 'named',
    esModule: false,
  },
  external: [/^bpmn-elements/, /^node:/],
  plugins: [nodeResolve({ preferBuiltins: true }), commonjs(), commonjsPackageJson()],
};
