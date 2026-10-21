# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

iDrawM is a touch-first, auto-layout diagramming PWA (an Instaviz replacement) with Excalidraw/PNG/SVG export. Vite + React 19 + TypeScript, Zustand, Rough.js, @use-gesture/react, ELK.js, vite-plugin-pwa. Deployed to Netlify (`netlify.toml`, publishes `dist/`).

`DEVELOPER.md` is the detailed architecture reference and `README.md` documents user-facing behaviour. Keep both up to date when changing a feature (including the shortcut and persistence tables in README).

## Commands

```bash
npm run dev          # Vite dev server (http://localhost:5173)
npm run build        # tsc -b && vite build
npm run lint         # eslint .
npx tsc --noEmit -p tsconfig.app.json   # type-check only
```

There is no test suite. Verify changes with type-check + lint, then in the running app. For browser checks, the store can be reached from the page by importing the dev-served module:

```js
const url = performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('diagramStore.ts?t='));
const { useDiagramStore } = await import(url);
```

`verbatimModuleSyntax` is on: type-only imports must use `import type`.

## Architecture

- **One Zustand store** (`src/store/diagramStore.ts`) holds all state and actions: `shapes`, `lines` (connectors between shapes), `freeLines`, `texts`, camera, tool, selection, editing state, palette defaults, toggles, and history. Components read from it with selectors; there's no prop drilling.
- **Rendering is imperative.** `DiagramCanvas.tsx` draws everything onto a single `<canvas>` with Rough.js. Diagram elements aren't React DOM. The only DOM overlays are the `TextEditor` (inline editing) and the toolbar and property panel.
- **Four renderers must stay in sync.** Any change to how an element looks or which elements exist has to be made in the canvas (`DiagramCanvas.tsx`), `export/png.ts`, `export/svg.ts` and `export/excalidraw.ts`. Shared geometry comes from single sources: `routeLine()` (`core/routing.ts`) for connector paths, `getPolygonVertices()` / hit tests (`utils/geometry.ts`), `layoutTextBox()` (`core/textBox.ts`), and for PNG/SVG `exportBounds()` / `labelBox()` (`export/bounds.ts`).
- **Connector routes aren't stored in the diagram.** `routeLine()` derives them from live shape geometry (straight if clear, otherwise orthogonal A*) and caches them per `shapes` array (carried over when a new array has identical geometry), so never mutate a shapes array or a returned route in place: always produce new arrays, as the store does. Large diagrams (40+ shapes) freeze connectors not attached to a dragged shape until the drop.
- **Auto-layout** (`core/layout.ts`): ELK is lazy-loaded and runs in a Web Worker. `triggerLayout()` runs after line add/delete and text edits, only lays out connected shapes, keeps their centre of mass fixed, and does nothing when `layoutLocked` is on. `forceLayout()` (the Arrange button) ignores the lock and pushes history. A result that arrives after the shapes or connectors changed is dropped, and a layout requested mid-run is queued.
- **History**: snapshots of `shapes`, `lines`, `freeLines` and `texts`, capped at 50 entries. `pushHistory()` records the state *before* an action. Continuous interactions (drags, text editing sessions) push once per interaction, not per frame or keystroke. A new top-level element array has to be added to history snapshots, `saveDiagram`/`loadDiagram`, autosave and all exporters.
- **Loading is validated and versioned.** Files and the auto-save are parsed by `parseDiagram()` (`core/validate.ts`), which rejects malformed data before it reaches state and migrates older files (missing `freeLines`/`texts`, legacy shape types). Any new element field must be added there, with a default if older files lack it. Saved data carries `version` (`DIAGRAM_VERSION`): unversioned data gets `#2d3436` ink converted to `'auto'` via `migrateInk()`, versioned data doesn't. Bump the version for any similar migration that can't tell old defaults from deliberate choices.
- **Colours**: `'transparent'` and `AUTO_COLOR` (`'auto'`, which follows the theme) are valid colour values alongside hex. The canvas resolves `'auto'` with `resolveColor()`. Exporters resolve it to dark ink up front (`withResolvedColors()`) because export backgrounds are white.
- **Positioning**: shape `x`/`y` are top-left, but grid snapping and angle lock (`core/angleLock.ts`) work on shape **centres**, because `autoResizeShape()` resizes around the centre. Drags are computed from the drag-start origin every frame, not by accumulating deltas.
- **Cylinder** body fill is drawn with plain canvas `fillRect` + `ellipse` before the Rough.js strokes (canvas and PNG), and with a `<rect>` in SVG.

Persistence keys (localStorage `idrawm-*`, IndexedDB `idrawm`/`autosave`) are listed in README's "Persistence Summary".
