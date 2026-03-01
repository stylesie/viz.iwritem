# Developer Notes

## Tech Stack
- **Vite + React 19 + TypeScript** (`verbatimModuleSyntax` -- always use `import type` for type-only imports)
- **Rough.js** -- Hand-drawn shape rendering on `<canvas>`
- **@use-gesture/react** -- Pan, zoom, pinch, drag gestures
- **Zustand** -- Single store for all state (`src/store/diagramStore.ts`)
- **ELK.js** -- Auto-layout engine (with Dagre fallback in `src/core/layout.ts`)
- **vite-plugin-pwa** -- Service worker and manifest generation

## Project Structure

```
src/
  core/
    model.ts          Shape/Line/Diagram types, createShape factory
    autoResize.ts     Text measurement and auto-resize logic
    layout.ts         ELK.js layout runner
  store/
    diagramStore.ts   Zustand store -- all state and actions
  components/
    Canvas/
      DiagramCanvas.tsx   Main canvas: grid, shapes, lines, gestures, hit testing
    Toolbar/
      Toolbar.tsx         Shape tools, undo/redo, layout lock, file ops, export, theme
    PropertyPanel/
      PropertyPanel.tsx   Color palette, icons, "Set as Default" buttons
    TextEditor/
      TextEditor.tsx      Inline text editing overlay
  export/
    excalidraw.ts     Excalidraw JSON export
    png.ts            Canvas-based PNG export (2x DPI)
    svg.ts            SVG string export
    download.ts       Blob/text download helpers
  utils/
    geometry.ts       Hit testing, edge points, polygon vertices
```

## Key Architecture

### State Management
All mutable state lives in a single Zustand store. Components subscribe to individual selectors to minimize re-renders. No props drilling -- components read directly from the store.

### Rendering
Shapes are rendered on a single `<canvas>` element using Rough.js. The render loop runs via `requestAnimationFrame` triggered by state changes. No React DOM elements are used for shapes -- everything is drawn imperatively.

### Cylinder Body Fill
The cylinder shape is composed of separate Rough.js primitives (ellipse, lines, arc). Since Rough.js draws each piece independently, the body area between the top ellipse and bottom arc must be filled with a plain `ctx.fillRect()` + `ctx.ellipse()` arc *before* the Rough.js strokes. This is done in both `DiagramCanvas.tsx` (on-screen) and `png.ts` (export). The SVG export uses a `<rect>` element instead.

### Auto-Layout
`triggerLayout()` is called after `addLine()`, `deleteSelected()`, and `updateShapeText()`. It only lays out shapes that are connected by at least one line. Unconnected shapes are left in place.

The layout result is offset so the center of mass of connected shapes stays constant -- this prevents the diagram from jumping to the origin.

When `layoutLocked` is true, `triggerLayout()` is a no-op. `forceLayout()` bypasses the lock and always runs (used by the Arrange button). Force layout pushes history first so it's undoable.

### Default Palette
`DefaultPalette` stores per-shape-type color defaults and line color defaults. Stored in localStorage as JSON under `idrawm-defaults`. The `createShape()` factory accepts an optional colors override; the store passes palette defaults when calling it from `addShape()`.

### Hit Testing
`geometry.ts` provides `hitTestShape()` which dispatches to shape-specific logic (rect bounds, ellipse equation, polygon point-in-polygon). `getPolygonVertices()` is shared across diamond, triangle, parallelogram, and hexagon for both rendering and hit testing.

### Transparent Colors
`'transparent'` is a valid fill/stroke/text color value. The color picker (`<input type="color">`) is hidden when the current value is transparent since it doesn't support it. Rough.js handles `fill: 'transparent'` correctly with `fillStyle: 'solid'`.

## Build & Check

```bash
npx tsc --noEmit      # Type-check
npx vite build        # Production build
npm run dev           # Dev server with HMR
```

The ELK.js chunk is ~1.4MB (450KB gzipped). It's loaded lazily on first layout trigger.

## Conventions
- No morphing -- shape type is fixed after creation
- Old shape types (`square`, `circle`, `oval`) are migrated to `rectangle`/`ellipse` on file load
- Shape IDs use format `el_{counter}_{timestamp_base36}`
- History is capped at 50 entries; undo/redo operates on full shape+line snapshots
