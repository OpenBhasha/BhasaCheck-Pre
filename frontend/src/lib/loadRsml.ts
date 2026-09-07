/**
 * Loads the `rsml` package's RSMLAnnotator as a real browser <script>,
 * deliberately bypassing npm/Vite.
 *
 * Why: `rsml`'s package.json declares "type": "module", but rsml.js itself
 * is a plain UMD script with no import/export syntax. When Vite/esbuild
 * bundles `import RSMLAnnotator from 'rsml'`, it detects the UMD wrapper's
 * `module.exports` check and treats the file as CommonJS, injecting a fake
 * `module` object — so the UMD wrapper's `module.exports = factory()`
 * branch fires instead of its intended `root.RSMLAnnotator = factory()`
 * browser-global branch. `rsml.esm.js` (the package's own ESM shim) only
 * ever reads `window.RSMLAnnotator`, which never gets set under bundling,
 * so `import RSMLAnnotator from 'rsml'` silently resolves to `undefined`.
 *
 * Loading the exact same file as a genuine <script type="module"> sidesteps
 * this entirely: browsers execute it as written, with no `module` global at
 * all, so the UMD wrapper correctly falls through to the browser-global
 * branch. This also matches how the package's own README documents browser
 * usage, and how the library itself loads CodeMirror internally (from
 * esm.sh) — an external script load, not a bundled dependency.
 */

export interface RSMLAnnotatorOptions {
  textarea: HTMLTextAreaElement | string;
  output: HTMLElement | string;
  tags?: string[];
  entities?: Record<string, string>;
  languages?: Record<string, string>;
  demoText?: boolean;
}

export interface RSMLAnnotatorInstance {
  destroy(): void;
  setValue(value: string): void;
  getValue(): string;
  undo(): void;
  redo(): void;
}

export type RSMLAnnotatorClass = new (opts: RSMLAnnotatorOptions) => RSMLAnnotatorInstance;

declare global {
  interface Window {
    RSMLAnnotator?: RSMLAnnotatorClass;
  }
}

// Pinned, not @latest — this widget is loaded from a CDN at runtime, so an
// unpinned version could change behavior under us without a deploy.
const RSML_VERSION = '3.1.1';
const RSML_CDN_URL = `https://cdn.jsdelivr.net/npm/rsml@${RSML_VERSION}/rsml.esm.js`;
const READY_EVENT = 'rsml-annotator-ready';

let loadPromise: Promise<RSMLAnnotatorClass> | null = null;

export function loadRsmlAnnotator(): Promise<RSMLAnnotatorClass> {
  if (window.RSMLAnnotator) return Promise.resolve(window.RSMLAnnotator);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const onReady = () => {
      window.removeEventListener(READY_EVENT, onReady);
      if (window.RSMLAnnotator) {
        resolve(window.RSMLAnnotator);
      } else {
        reject(new Error('rsml script loaded but did not set window.RSMLAnnotator'));
      }
    };
    window.addEventListener(READY_EVENT, onReady);

    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = `
      import RSMLAnnotator from ${JSON.stringify(RSML_CDN_URL)};
      window.RSMLAnnotator = RSMLAnnotator;
      window.dispatchEvent(new Event(${JSON.stringify(READY_EVENT)}));
    `;
    script.onerror = () => reject(new Error(`Failed to load RSML annotator from ${RSML_CDN_URL}`));
    document.head.appendChild(script);
  });

  return loadPromise;
}
