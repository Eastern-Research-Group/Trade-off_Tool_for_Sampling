/** @jsxImportSource @emotion/react */

import { createRoot } from 'react-dom/client';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import esriTheme from '@arcgis/core/assets/esri/themes/light/main.css?inline';
// types
import type { EmotionCache } from '@emotion/cache';
import type { ReactNode } from 'react';
import type { Root } from 'react-dom/client';

// Overrides for esri's own markup. The views render in a shadow root that document
// styles don't reach, so these are used twice: interpolated into the global styles
// for the widgets in the light dom, and adopted into each view's shadow root.
export const esriStyles = `
  .esri-popup__main-container {
    min-width: 460px !important;
  }

  .esri-popup__action-text {
    display: none;
  }

  .esri-widget:focus,
  .esri-widget--button:focus {
    outline: none;
  }

  .esri-sketch {
    margin-bottom: 10px;
  }

  .esri-sketch__info-section,
  .esri-sketch__feature-count-badge {
    width: 100%;
  }

  .esri-sketch__info-section:last-of-type {
    display: none !important;
  }
`;

let sheets: CSSStyleSheet[] | null = null;

function toSheet(css: string) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);

  return sheet;
}

// The view components carry the styles for the view, its ui and popups, but not
// for the widgets themselves. Widgets and popup content render in the shadow root,
// where neither the esri theme nor the page's own styles reach, so both go in
// here. Order follows the document: theme, page, then our overrides.
function esriSheets() {
  if (!sheets) {
    // popup content leans on the epa template's element styles, i.e. buttons
    const pageStyles =
      document.getElementById('tots-global-styles')?.textContent;

    sheets = [
      toSheet(esriTheme),
      ...(pageStyles ? [toSheet(pageStyles)] : []),
      toSheet(esriStyles),
    ];
  }

  return sheets;
}

// Adopting last puts these after the component's own styles, so they win ties.
export function adoptEsriStyles(root: ShadowRoot | null) {
  if (!root) return;

  const adopting = esriSheets().filter(
    (sheet) => !root.adoptedStyleSheets.includes(sheet),
  );
  if (adopting.length === 0) return;

  root.adoptedStyleSheets = [...root.adoptedStyleSheets, ...adopting];
}

const caches = new WeakMap<ShadowRoot, EmotionCache>();

// Emotion puts its style tags in document.head, which a shadow root can't see, so
// react rendered inside a view needs a cache pointed at that root. The node has to
// be connected already (a detached node has no shadow root to find).
function getShadowCache(node: Node) {
  const root = node.getRootNode();
  if (!(root instanceof ShadowRoot)) return null;

  let cache = caches.get(root);
  if (!cache) {
    cache = createCache({ key: 'tots-map', container: root });
    caches.set(root, cache);
  }

  return cache;
}

function withShadowCache(node: Node, content: ReactNode) {
  const cache = getShadowCache(node);
  if (!cache) return content;

  return <CacheProvider value={cache}>{content}</CacheProvider>;
}

// esri decides when to put this in the view, so waiting for it to connect is what
// makes the shadow root it lands in knowable.
class TotsReactContent extends HTMLElement {
  content: ReactNode = null;
  private reactRoot: Root | null = null;

  connectedCallback() {
    // esri moves these nodes around, so only mount on the first connect
    if (this.reactRoot) return;

    this.style.display = 'block';
    this.reactRoot = createRoot(this);
    this.reactRoot.render(withShadowCache(this, this.content));
  }
}

if (!customElements.get('tots-react-content')) {
  customElements.define('tots-react-content', TotsReactContent);
}

// Wraps react content for esri, whether it goes in a popup or the view's ui.
export function createReactContent(content: ReactNode) {
  const container = document.createElement(
    'tots-react-content',
  ) as TotsReactContent;
  container.content = content;

  return container;
}
