import { useDiagramStore } from '../../store/diagramStore'
import type { TextZone, IconAlign } from '../../store/diagramStore'
import type { ShapeType } from '../../core/model'
import './PropertyPanel.css'

const PALETTE = [
  'transparent',
  '#2d3436', '#636e72', '#b2bec3', '#dfe6e9', '#ffffff',
  '#d63031', '#e17055', '#fdcb6e', '#ffeaa7', '#fab1a0',
  '#00b894', '#00cec9', '#0984e3', '#6c5ce7', '#a29bfe',
  '#e8f4f8', '#dff9fb', '#c7ecee', '#ffecd2', '#fcf3cf',
  '#55efc4', '#81ecec', '#74b9ff', '#a3d8f4', '#fd79a8',
]

interface IconEntry { icon: string; label: string }
interface IconPalette { id: string; name: string; icons: IconEntry[] }

const NETWORKING_PALETTE: IconPalette = {
  id: 'networking',
  name: 'Networking & Computers',
  icons: [
    { icon: '', label: 'None' },
    // Devices
    { icon: '\u{1F5A5}', label: 'Desktop' },        // 🖥
    { icon: '\u{1F4BB}', label: 'Laptop' },          // 💻
    { icon: '\u{1F4F1}', label: 'Mobile' },          // 📱
    { icon: '\u{1F5A8}', label: 'Printer' },         // 🖨
    // Infrastructure
    { icon: '\u{1F5B3}', label: 'Server' },          // 🖳 (old PC)
    { icon: '\u{1F4BE}', label: 'Storage' },         // 💾
    { icon: '\u{1F4BF}', label: 'Disk' },            // 💿
    // Networking
    { icon: '\u{1F310}', label: 'Globe' },           // 🌐
    { icon: '\u{1F4E1}', label: 'Antenna' },         // 📡
    { icon: '\u{1F4F6}', label: 'Signal' },          // 📶
    { icon: '\u{1F50C}', label: 'Plug' },            // 🔌
    { icon: '\u26A1', label: 'Lightning' },          // ⚡
    // Security
    { icon: '\u{1F512}', label: 'Lock' },            // 🔒
    { icon: '\u{1F513}', label: 'Unlock' },          // 🔓
    { icon: '\u{1F6E1}', label: 'Shield' },          // 🛡
    { icon: '\u{1F511}', label: 'Key' },             // 🔑
    // Cloud & services
    { icon: '\u2601', label: 'Cloud' },              // ☁
    { icon: '\u{1F4E6}', label: 'Package' },         // 📦
    { icon: '\u{1F4C1}', label: 'Folder' },          // 📁
    { icon: '\u{1F4C4}', label: 'Document' },        // 📄
    { icon: '\u{1F4CB}', label: 'Clipboard' },       // 📋
    // Status
    { icon: '\u2714', label: 'Check' },              // ✔
    { icon: '\u2718', label: 'Error' },              // ✘
    { icon: '\u26A0', label: 'Warning' },            // ⚠
    { icon: '\u2139', label: 'Info' },               // ℹ
    { icon: '\u2699', label: 'Gear' },               // ⚙
    { icon: '\u{1F527}', label: 'Wrench' },          // 🔧
    // People
    { icon: '\u{1F464}', label: 'User' },            // 👤
    { icon: '\u{1F465}', label: 'Group' },           // 👥
    { icon: '\u{1F4BC}', label: 'Briefcase' },       // 💼
    // Communication
    { icon: '\u260E', label: 'Phone' },              // ☎
    { icon: '\u2709', label: 'Email' },              // ✉
    { icon: '\u{1F4AC}', label: 'Message' },         // 💬
    // Misc networking
    { icon: '\u{1F517}', label: 'Link' },            // 🔗
    { icon: '\u{1F504}', label: 'Sync' },            // 🔄
  ],
}

const ICONS = NETWORKING_PALETTE.icons

const ALIGN_OPTIONS: { value: IconAlign; label: string; symbol: string }[] = [
  { value: 'left', label: 'Left', symbol: '\u25C0' },    // ◀
  { value: 'center', label: 'Center', symbol: '\u25CF' }, // ●
  { value: 'right', label: 'Right', symbol: '\u25B6' },   // ▶
]

const ICON_ZONES: { zone: TextZone; label: string }[] = [
  { zone: 'header', label: 'Header' },
  { zone: 'body', label: 'Body' },
  { zone: 'footer', label: 'Footer' },
]

function ColorSwatch({ color, selected, onClick }: {
  color: string
  selected: boolean
  onClick: () => void
}) {
  const isTransparent = color === 'transparent'
  return (
    <button
      className={`color-swatch ${selected ? 'selected' : ''} ${isTransparent ? 'transparent' : ''}`}
      style={isTransparent ? undefined : { backgroundColor: color }}
      onClick={onClick}
      title={isTransparent ? 'Transparent' : color}
    />
  )
}

function SetDefaultButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="set-default-btn" onClick={onClick} title="Use this color for all new shapes of this type">
      Set as Default
    </button>
  )
}

function ShapeProperties() {
  const selection = useDiagramStore(s => s.selection)
  const shapes = useDiagramStore(s => s.shapes)
  const updateShapeColors = useDiagramStore(s => s.updateShapeColors)
  const updateShapeIcon = useDiagramStore(s => s.updateShapeIcon)
  const updateShapeIconAlign = useDiagramStore(s => s.updateShapeIconAlign)
  const setShapeDefault = useDiagramStore(s => s.setShapeDefault)

  if (!selection || selection.type !== 'shape') return null
  const shape = shapes.find(s => s.id === selection.id)
  if (!shape) return null

  const shapeType = shape.type as ShapeType

  return (
    <div className="property-panel">
      <div className="prop-section">
        <div className="prop-label">Fill</div>
        <div className="color-grid">
          {PALETTE.map(c => (
            <ColorSwatch
              key={`fill-${c}`}
              color={c}
              selected={shape.fillColor === c}
              onClick={() => updateShapeColors(shape.id, { fillColor: c })}
            />
          ))}
        </div>
        {shape.fillColor !== 'transparent' && (
          <input
            type="color"
            className="color-input"
            value={shape.fillColor}
            onChange={e => updateShapeColors(shape.id, { fillColor: e.target.value })}
          />
        )}
        <SetDefaultButton onClick={() => setShapeDefault(shapeType, { fillColor: shape.fillColor })} />
      </div>

      <div className="prop-section">
        <div className="prop-label">Border</div>
        <div className="color-grid">
          {PALETTE.map(c => (
            <ColorSwatch
              key={`stroke-${c}`}
              color={c}
              selected={shape.strokeColor === c}
              onClick={() => updateShapeColors(shape.id, { strokeColor: c })}
            />
          ))}
        </div>
        {shape.strokeColor !== 'transparent' && (
          <input
            type="color"
            className="color-input"
            value={shape.strokeColor}
            onChange={e => updateShapeColors(shape.id, { strokeColor: e.target.value })}
          />
        )}
        <SetDefaultButton onClick={() => setShapeDefault(shapeType, { strokeColor: shape.strokeColor })} />
      </div>

      <div className="prop-section">
        <div className="prop-label">Text</div>
        <div className="color-grid">
          {PALETTE.map(c => (
            <ColorSwatch
              key={`text-${c}`}
              color={c}
              selected={shape.textColor === c}
              onClick={() => updateShapeColors(shape.id, { textColor: c })}
            />
          ))}
        </div>
        {shape.textColor !== 'transparent' && (
          <input
            type="color"
            className="color-input"
            value={shape.textColor}
            onChange={e => updateShapeColors(shape.id, { textColor: e.target.value })}
          />
        )}
        <SetDefaultButton onClick={() => setShapeDefault(shapeType, { textColor: shape.textColor })} />
      </div>

      <div className="prop-section">
        <div className="prop-label">Icons</div>
        {ICON_ZONES.map(({ zone, label }) => {
          const iconKey = `${zone}Icon` as keyof typeof shape
          const alignKey = `${zone}IconAlign` as keyof typeof shape
          const currentIcon = shape[iconKey] as string
          const currentAlign = (shape[alignKey] as IconAlign) || 'left'
          return (
            <div key={zone} className="icon-zone-row">
              <div className="icon-zone-header">
                <span className="icon-zone-label">{label}</span>
                {currentIcon && (
                  <div className="icon-align-row">
                    {ALIGN_OPTIONS.map(({ value, label: alignLabel, symbol }) => (
                      <button
                        key={`${zone}-align-${value}`}
                        className={`icon-align-btn ${currentAlign === value ? 'selected' : ''}`}
                        onClick={() => updateShapeIconAlign(shape.id, zone, value)}
                        title={alignLabel}
                      >
                        {symbol}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="icon-grid">
                {ICONS.map(({ icon, label: iconLabel }) => (
                  <button
                    key={`${zone}-${iconLabel}`}
                    className={`icon-btn ${currentIcon === icon ? 'selected' : ''}`}
                    onClick={() => updateShapeIcon(shape.id, zone, icon)}
                    title={iconLabel}
                  >
                    {icon || '\u2013'}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LineProperties() {
  const selection = useDiagramStore(s => s.selection)
  const lines = useDiagramStore(s => s.lines)
  const updateLineColor = useDiagramStore(s => s.updateLineColor)
  const setLineDefault = useDiagramStore(s => s.setLineDefault)

  if (!selection || selection.type !== 'line') return null
  const line = lines.find(l => l.id === selection.id)
  if (!line) return null

  return (
    <div className="property-panel">
      <div className="prop-section">
        <div className="prop-label">Line Colour</div>
        <div className="color-grid">
          {PALETTE.slice(0, 16).map(c => (
            <ColorSwatch
              key={`line-${c}`}
              color={c}
              selected={line.color === c}
              onClick={() => updateLineColor(line.id, c)}
            />
          ))}
        </div>
        {line.color !== 'transparent' && (
          <input
            type="color"
            className="color-input"
            value={line.color}
            onChange={e => updateLineColor(line.id, e.target.value)}
          />
        )}
        <SetDefaultButton onClick={() => setLineDefault({ color: line.color })} />
      </div>
    </div>
  )
}

export default function PropertyPanel() {
  const selection = useDiagramStore(s => s.selection)
  if (!selection) return null

  return (
    <>
      <ShapeProperties />
      <LineProperties />
    </>
  )
}
