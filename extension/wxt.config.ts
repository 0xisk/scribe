import { defineConfig } from 'wxt'
import { statebuilder } from 'statebuilder/compiler'
import tsconfigPaths from 'vite-tsconfig-paths'

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/public',
  modulesDir: 'src/modules',
  outDir: './dist',
  vite: (env) => ({
    plugins: [
      tsconfigPaths(),
      statebuilder({
        autoKey: true,
        dev: env.mode === 'development',
      }) as any,
    ],
  }),
  // only on linux/macOS
  webExt: {
    chromiumArgs: ['--user-data-dir=./.wxt/chrome-data'],
    startUrls: ['https://github.com/riccardoperra/better-writer-for-github'],
  },

  zip: {
    name: 'scribe',
  },

  modules: ['@wxt-dev/module-solid'],

  manifest: {
    name: 'Scribe',
    description:
      'A better GitHub comment box — block-based WYSIWYG Markdown editor with per-line review tags (nit, non-blocking, followup, question, blocking) and color-coded classification.',
    author: {
      email: 'riccardo.perra@icloud.com',
    },
    web_accessible_resources: [
      {
        resources: ['editor-content.js', 'worker.js', 'iframe-worker.html'],
        matches: ['*://github.com/*'],
      },
    ],
    content_scripts: [
      {
        css: ['assets/main.css', 'assets/editor-content.css'],
        matches: ['*://github.com/*'],
        exclude_matches: ['https://*/login/*'],
      },
    ],
  },
})
