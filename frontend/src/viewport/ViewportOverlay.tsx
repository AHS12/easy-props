/**
 * The controls over the view: tools on the left, how it is drawn on the right.
 */

import {Dropdown, Popover} from '@heroui/react'
import {
    Box, Camera, ChevronDown, Frame, Grid2x2, Info, Layers, Maximize, Minimize, MousePointer2, Move, PersonStanding, Sun, TreePine, Wind,
} from 'lucide-react'
import {useEffect, useState, type ReactNode} from 'react'
import {PropertyRow} from '../components/PropertyRow'
import {Tooltip} from '../components/controls'
import {runCommand, findCommand, shortcutFor} from '../core/commands/commands'
import {LEVEL_SHARES} from '../core/export/pipeline/types'
import {SHADING_MODES, SHADING_MODE_HELP, SHADING_MODE_LABELS, type ShadingMode} from '../assets/style/shading'
import {TIME_OF_DAY, TIME_OF_DAY_LABELS, type TimeOfDay} from '../assets/style/lighting'
import {useEditorStore} from '../store/editor-store'
import {useSetting, useSettingsStore} from '../store/settings-store'
import {useUiStore} from '../store/ui-store'
import {SunDial} from './SunDial'
import {viewportHandle, type ViewAngle} from './viewport-bridge'

const STATS_REFRESH_MS = 500

const SHADING_ICONS: Readonly<Record<ShadingMode, typeof Sun>> = {lit: Sun, flat: Box, wireframe: Grid2x2, wind: Wind}

const SCENES: readonly {id: string; label: string; help: string}[] = [
    {id: 'sky', label: 'Studio', help: 'A plain place to work'},
    {id: 'studio-sky', label: 'Studio with sky', help: 'A plain place to work, in bright daylight under a blue sky'},
    {id: 'meadow', label: 'Meadow demo', help: 'Grass, flowers, bushes, rocks and a cliff around your prop'},
    {id: 'grove', label: 'Grove demo', help: 'The meadow, with trees as well'},
    {id: 'grey', label: 'Neutral grey', help: 'Best for judging colour'},
]

const ANGLES: readonly {id: ViewAngle; label: string}[] = [
    {id: 'perspective', label: 'Perspective'},
    {id: 'front', label: 'Front'},
    {id: 'side', label: 'Side'},
    {id: 'top', label: 'Top'},
]

/** The time of day the lighting exactly matches, if any. */
function matchingTime(azimuth: number, elevation: number): TimeOfDay | null {
    for (const [time, preset] of Object.entries(TIME_OF_DAY)) {
        if (Math.abs(preset.azimuth - azimuth) < 0.5 && Math.abs(preset.elevation - elevation) < 0.5) {
            return time as TimeOfDay
        }
    }

    return null
}

function ToolButton({
    label,
    keys,
    pressed,
    disabledReason,
    onPress,
    children,
}: {
    label: string
    keys?: string
    pressed?: boolean
    disabledReason?: string | null
    onPress(): void
    children: ReactNode
}) {
    const text = disabledReason ?? (keys ? `${label} (${keys.replace(/\+ $/, '+Space')})` : label)

    return (
        <Tooltip text={text} placement="bottom" always>
            <button
                type="button"
                className="tool"
                aria-label={label}
                aria-pressed={pressed}
                aria-disabled={disabledReason ? true : undefined}
                data-unavailable={disabledReason ? true : undefined}
                onClick={onPress}
            >
                {children}
            </button>
        </Tooltip>
    )
}

function ToolMenu({
    label,
    trigger,
    items,
}: {
    label: string
    trigger: ReactNode
    items: readonly {id: string; label: string; help?: string; checked?: boolean; run(): void}[]
}) {
    return (
        <Dropdown>
            <Dropdown.Trigger className="tool tool--menu" aria-label={label}>
                {trigger}
                <ChevronDown size={11} aria-hidden="true" />
            </Dropdown.Trigger>
            <Dropdown.Popover className="menu-popover" placement="bottom end" offset={4}>
                <Dropdown.Menu className="menu-list" onAction={(id) => items.find((item) => item.id === id)?.run()}>
                    {items.map((item) => (
                        <Dropdown.Item key={item.id} id={item.id} textValue={item.label} className="menu-item" data-checked={item.checked}>
                            <span className="menu-item__tick" aria-hidden="true">
                                {item.checked ? '✓' : ''}
                            </span>
                            <span className="menu-item__stack">
                                <span className="menu-item__label">{item.label}</span>
                                {item.help ? <span className="menu-item__help">{item.help}</span> : null}
                            </span>
                        </Dropdown.Item>
                    ))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    )
}

function LightingButton() {
    const lighting = useEditorStore((state) => state.lighting)
    const setLighting = useEditorStore((state) => state.setLighting)
    const setTimeOfDay = useEditorStore((state) => state.setTimeOfDay)
    const activeTime = matchingTime(lighting.azimuth, lighting.elevation)

    return (
        <Popover>
            <Popover.Trigger>
                <Tooltip text="Sun and shadow" placement="bottom" always>
                    <button type="button" className="tool" aria-label="Sun and shadow">
                        <Sun size={14} aria-hidden="true" />
                    </button>
                </Tooltip>
            </Popover.Trigger>
            <Popover.Content className="sun-panel" placement="bottom end" offset={6}>
                <Popover.Dialog aria-label="Sun and shadow">
                    <div className="sun-panel__dial">
                        <SunDial lighting={lighting} onChange={setLighting} />
                        <p className="sun-panel__caption">Drag to move the sun</p>
                    </div>
                    <div className="time-grid" role="group" aria-label="Time of day">
                        {(Object.keys(TIME_OF_DAY) as TimeOfDay[]).map((time) => (
                            <button
                                key={time}
                                type="button"
                                className="time-button"
                                aria-pressed={activeTime === time}
                                onClick={() => setTimeOfDay(time)}
                            >
                                {TIME_OF_DAY_LABELS[time]}
                            </button>
                        ))}
                    </div>
                    <PropertyRow
                        label="Shadow"
                        value={lighting.shadowStrength}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(value) => setLighting({...lighting, shadowStrength: value})}
                    />
                </Popover.Dialog>
            </Popover.Content>
        </Popover>
    )
}

/** Off by default: faces per mesh, draw calls, and size in metres. */
function StatsOverlay() {
    const faceCounts = useEditorStore((state) => state.shownFaceCounts)
    const [stats, setStats] = useState(() => viewportHandle()?.stats() ?? null)

    useEffect(() => {
        const timer = window.setInterval(() => setStats(viewportHandle()?.stats() ?? null), STATS_REFRESH_MS)

        return () => window.clearInterval(timer)
    }, [])

    return (
        <dl className="stats tabular" aria-label="Stats">
            <dt>Wood</dt>
            <dd>{faceCounts.wood.toLocaleString()} faces</dd>
            <dt>Leaves</dt>
            <dd>{faceCounts.leaves.toLocaleString()} faces</dd>
            {stats ? (
                <>
                    <dt>Draw calls</dt>
                    <dd>{stats.drawCalls}</dd>
                    <dt>Size</dt>
                    <dd>{stats.size.map((value) => value.toFixed(1)).join(' × ')} m</dd>
                </>
            ) : null}
        </dl>
    )
}

export function ViewportOverlay() {
    const shadingMode = useEditorStore((state) => state.shadingMode)
    const setShadingMode = useEditorStore((state) => state.setShadingMode)
    const previewLevel = useEditorStore((state) => state.previewLevel)
    const setPreviewLevel = useEditorStore((state) => state.setPreviewLevel)
    const moveTool = useEditorStore((state) => state.moveTool)
    const setMoveTool = useEditorStore((state) => state.setMoveTool)
    const showStats = useUiStore((state) => state.showStats)
    const showScaleFigure = useUiStore((state) => state.showScaleFigure)
    const maximized = useUiStore((state) => state.maximized)
    const editor = useEditorStore()

    const moveReason = findCommand('tool-move')?.unavailable?.(editor) ?? null
    const ShadingIcon = SHADING_ICONS[shadingMode]
    const backdrop = String(useSetting('backdrop'))
    const command = (id: string) => () => {
        const found = findCommand(id)

        if (found) {
            runCommand(found)
        }
    }

    return (
        <>
            <div className="viewport-tools viewport-tools--left" role="toolbar" aria-label="Tools">
                <div className="tool-group">
                    <ToolButton label="Select" keys={shortcutFor('tool-select')} pressed={!moveTool} onPress={() => setMoveTool(false)}>
                        <MousePointer2 size={14} aria-hidden="true" />
                    </ToolButton>
                    <ToolButton
                        label="Move"
                        keys={shortcutFor('tool-move')}
                        pressed={moveTool}
                        disabledReason={moveTool ? null : moveReason}
                        onPress={command('tool-move')}
                    >
                        <Move size={14} aria-hidden="true" />
                    </ToolButton>
                </div>
            </div>

            <div className="viewport-tools viewport-tools--right" role="toolbar" aria-label="View">
                <div className="tool-group">
                    <ToolMenu
                        label={`Shading: ${SHADING_MODE_LABELS[shadingMode]}`}
                        trigger={
                            <>
                                <ShadingIcon size={14} aria-hidden="true" />
                                <span>{SHADING_MODE_LABELS[shadingMode]}</span>
                            </>
                        }
                        items={SHADING_MODES.map((mode) => ({
                            id: mode,
                            label: SHADING_MODE_LABELS[mode],
                            help: SHADING_MODE_HELP[mode],
                            checked: mode === shadingMode,
                            run: () => setShadingMode(mode),
                        }))}
                    />
                    <ToolMenu
                        label={`Detail level ${previewLevel}`}
                        trigger={
                            <>
                                <Layers size={14} aria-hidden="true" />
                                <span>LOD{previewLevel}</span>
                            </>
                        }
                        items={LEVEL_SHARES.map((share, level) => ({
                            id: String(level),
                            label: `Level ${level} (LOD${level})`,
                            help: level === 0 ? 'Full detail, seen up close' : `About ${Math.round(share * 100)}% of the faces, for further away`,
                            checked: level === previewLevel,
                            run: () => setPreviewLevel(level),
                        }))}
                    />
                </div>
                <div className="tool-group">
                    <span data-coach="scene" className="tool-coach">
                        <ToolMenu
                            label="Scene"
                            trigger={<TreePine size={14} aria-hidden="true" />}
                            items={SCENES.map(({id, label, help}) => ({
                                id,
                                label,
                                help,
                                checked: id === backdrop,
                                run: () => {
                                    useSettingsStore.getState().setValue('backdrop', id)

                                    if (id === 'meadow' || id === 'grove') {
                                        viewportHandle()?.frameDemo()
                                    }
                                },
                            }))}
                        />
                    </span>
                    <LightingButton />
                    <ToolMenu
                        label="Camera angle"
                        trigger={<Camera size={14} aria-hidden="true" />}
                        items={ANGLES.map(({id, label}) => ({id, label, run: () => viewportHandle()?.setView(id)}))}
                    />
                    <ToolButton label="Frame" keys={shortcutFor('frame')} onPress={command('frame')}>
                        <Frame size={14} aria-hidden="true" />
                    </ToolButton>
                    <ToolButton label="Stats" pressed={showStats} onPress={command('toggle-stats')}>
                        <Info size={14} aria-hidden="true" />
                    </ToolButton>
                    <ToolButton label="A person for scale" pressed={showScaleFigure} onPress={command('toggle-scale-figure')}>
                        <PersonStanding size={14} aria-hidden="true" />
                    </ToolButton>
                    <ToolButton label={maximized ? 'Restore the panels' : 'Maximize'} keys={shortcutFor('maximize')} pressed={maximized} onPress={command('maximize')}>
                        {maximized ? <Minimize size={14} aria-hidden="true" /> : <Maximize size={14} aria-hidden="true" />}
                    </ToolButton>
                </div>
            </div>

            {showStats ? <StatsOverlay /> : null}
        </>
    )
}
