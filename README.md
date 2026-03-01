# iDrawM

A touch-first auto-layout diagramming PWA. Inspired by Instaviz, built for the modern web.

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. Install as a PWA from the browser menu for offline use.

## Features

### Shapes
Nine shape types: Rectangle, Ellipse, Diamond, Triangle, Parallelogram, Rounded Rectangle, Hexagon, Cylinder, Cloud.

Click a shape tool in the toolbar, then click on the canvas to place it. Double-click a shape to edit its text.

Each shape has three text zones: **header**, **body**, and **footer**. Double-click opens the body zone by default.

### Connections
Select the **Connect** tool (or press `L`), then drag from one shape to another to create a directed arrow. Double-click a line to add a label.

### Auto-Layout
Connected shapes are automatically arranged using ELK.js when you add or remove connections. The layout preserves the center of mass so shapes don't jump across the screen.

**Layout Lock** -- Click the lock button in the toolbar to freeze positions. While locked, adding connections or editing text won't rearrange shapes, so you can fine-tune positions manually.

**Arrange** -- Click Arrange to manually trigger a re-layout. If layout is locked, you'll get a confirmation prompt since this overwrites manual positions. Arrange is undoable.

### Styling
Select a shape or line to open the property panel on the right:

- **Fill / Border / Text colors** -- Pick from the palette or use the color picker. The first swatch is transparent (checkerboard pattern).
- **Icons** -- Assign emoji icons to any text zone (header, body, footer) with left/center/right alignment.
- **Line color** -- Same palette, applied to the selected connection.

### Default Colors
Each "Set as Default" button saves the current color as the default for that shape type. New shapes of that type will use your chosen colors. Line defaults work the same way. Defaults persist across sessions.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `V` | Select tool |
| `R` | Rectangle |
| `E` | Ellipse |
| `D` | Diamond |
| `T` | Triangle |
| `P` | Parallelogram |
| `U` | Rounded Rectangle |
| `H` | Hexagon |
| `Y` | Cylinder |
| `K` | Cloud |
| `L` | Connect |
| `Delete` / `Backspace` | Delete selected |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Escape` | Cancel connection |

### Navigation
- **Pan** -- Drag on empty canvas
- **Zoom** -- Scroll wheel or pinch gesture
- **Move shapes** -- Drag a shape

### File Operations
- **Save / Load** -- Save diagrams as `.idrawm.json` files and load them back
- **Auto-save** -- Diagrams are automatically saved to IndexedDB and restored on reload

### Export
- **Excalidraw** (`.excalidraw`) -- Open in Excalidraw for further editing
- **PNG** -- 2x resolution raster image
- **SVG** -- Scalable vector graphic

### Theme
Toggle between light and dark mode with the theme button. Your preference persists across sessions.

## Persistence Summary

| Setting | Storage | Key |
|---------|---------|-----|
| Theme | localStorage | `idrawm-theme` |
| Default colors | localStorage | `idrawm-defaults` |
| Layout lock | localStorage | `idrawm-layout-locked` |
| Diagram auto-save | IndexedDB | `idrawm` / `autosave` |
