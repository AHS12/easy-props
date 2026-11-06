/**
 * The Details panel: the whole prop, or the one part selected.
 *
 * The controls come from the generator, so it always offers exactly what the
 * generator understands. A filter finds any of them by name or by what its help
 * says, and which groups are open is remembered per kind of prop.
 */

import {ChevronRight, Dices, LayoutGrid, Search, Trash2, X} from 'lucide-react'
import {createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode} from 'react'
import {ColourRow} from '../components/ColourRow'
import {PaletteMenu} from '../components/PaletteMenu'
import {Select} from '../components/controls'
import {PropertyRow, ResetButton, Row} from '../components/PropertyRow'
import {findComponentGenerator} from '../assets/component-generators'
import {findPropGenerator, shownControls} from '../assets/prop-generators'
import {treeParameterSpecs} from '../assets/trees/branching-tree-generator'
import {familyOfPreset, PROP_FAMILIES} from '../assets/trees/presets'
import {BARK_COLOURS, LEAF_COLOURS} from '../assets/style/materials'
import {
    COLOUR_KEYS,
    COLOUR_LABELS,
    controlsForTree,
    isPaintedPart,
    resolvePalette,
    sectionsForPart,
    validatePaintedTreeParameters,
    type Palette,
} from '../assets/trees/painted'
import {describeComponent} from '../assets/shared/component-types'
import type {ParameterSpec} from '../assets/shared/parameters'
import {requestRemovePart} from '../core/commands/commands'
import {createSceneFromPreset} from '../core/scene/initial-scene'
import {findComponent} from '../core/scene/scene-model'
import {useEditorStore} from '../store/editor-store'
import {useSettingsStore} from '../store/settings-store'
import {useUiStore} from '../store/ui-store'
import {ownColoursPatch, paletteChoiceFor} from './palette-choice'
import {TRUNK_TREE_KEYS} from './trunk-controls'

/** Parts that stand for the whole prop, or hang off its plan, so they stay where they are. */
const WHOLE_PARTS = ['painted-limb', 'painted-bark', 'rock-body']

/** What opens first, so a first look is not thirty sliders. */
const DEFAULT_OPEN = ['Trunk', 'Leaves', 'Shape', 'Colours', 'Fronds', 'This part', 'Position', 'Turn']

const FLASH_MS = 1400

const FilterContext = createContext('')

/** Whether a control answers the filter, by its name, group or help. */
const answers = (filter: string, ...texts: readonly (string | undefined)[]) =>
    !filter || texts.some((text) => text?.toLowerCase().includes(filter))

/** The value each control came with, for its Reset, cached per preset. */
const presetBases = new Map<string, Readonly<Record<string, unknown>>>()

function presetBase(presetId: string): Readonly<Record<string, unknown>> {
    let base = presetBases.get(presetId)

    if (!base) {
        base = createSceneFromPreset(presetId).assets[0]?.parameters ?? {}
        presetBases.set(presetId, base)
    }

    return base
}

/** What a colour choice needs to offer palettes: every control, and a way to set several at once. */
interface PaletteSupport {
    readonly specs: readonly ParameterSpec[]
    onPatch(patch: Readonly<Record<string, string>>, label: string): void
}

function ParameterControls({
    specs,
    values,
    base,
    palettes,
    onChange,
}: {
    specs: readonly ParameterSpec[]
    values: Readonly<Record<string, unknown>>
    /** What Reset returns to. Otherwise each spec's default. */
    base?: Readonly<Record<string, unknown>>
    palettes?: PaletteSupport
    onChange(key: string, value: number | string): void
}) {
    const filter = useContext(FilterContext)

    return (
        <>
            {specs
                .filter((spec) => answers(filter, spec.label, spec.help, spec.group))
                .map((spec) => {
                    if (spec.kind === 'number') {
                        const raw = values[spec.key]
                        const from = base?.[spec.key]

                        return (
                            <PropertyRow
                                key={spec.key}
                                controlKey={spec.key}
                                label={spec.label}
                                help={spec.help}
                                value={typeof raw === 'number' ? raw : spec.default}
                                min={spec.min}
                                max={spec.max}
                                step={spec.step}
                                unit={spec.unit === 'count' ? undefined : spec.unit}
                                resetTo={typeof from === 'number' ? from : spec.default}
                                onChange={(next) => onChange(spec.key, next)}
                            />
                        )
                    }

                    if (spec.kind === 'colour') {
                        const raw = values[spec.key]

                        return (
                            <ColourRow
                                key={spec.key}
                                controlKey={spec.key}
                                label={spec.label}
                                value={typeof raw === 'string' ? raw : spec.default}
                                presets={spec.swatches}
                                onChange={(next) => onChange(spec.key, next)}
                            />
                        )
                    }

                    const raw = values[spec.key]
                    const value = typeof raw === 'string' ? raw : spec.default
                    const from = base?.[spec.key]
                    const resetTo = typeof from === 'string' ? from : spec.default
                    const choice = palettes ? paletteChoiceFor(spec, palettes.specs, values) : null

                    if (choice && palettes) {
                        return (
                            <Row key={spec.key} label={spec.label} help={spec.help} controlKey={spec.key}>
                                <PaletteMenu
                                    choice={choice}
                                    ownAllowed={spec.options.some((option) => option.value === 'custom')}
                                    onPick={(next) => onChange(spec.key, next)}
                                    onUseColours={(palette) => palettes.onPatch(ownColoursPatch(choice, palette.colours), 'use palette')}
                                />
                                <ResetButton label={spec.label} visible={value !== resetTo} onReset={() => onChange(spec.key, resetTo)} />
                            </Row>
                        )
                    }

                    return (
                        <Row key={spec.key} label={spec.label} help={spec.help} controlKey={spec.key}>
                            <Select
                                label={spec.label}
                                value={value}
                                onChange={(next) => onChange(spec.key, next)}
                                options={spec.options}
                            />
                            <ResetButton
                                label={spec.label}
                                visible={value !== resetTo}
                                onReset={() => onChange(spec.key, resetTo)}
                            />
                        </Row>
                    )
                })}
        </>
    )
}

function Group({
    title,
    open,
    onToggle,
    empty,
    children,
}: {
    title: string
    open: boolean
    onToggle(): void
    /** Filtered down to nothing, so it hides. */
    empty?: boolean
    children: ReactNode
}) {
    if (empty) {
        return null
    }

    return (
        <section className="group" data-open={open} data-group={title}>
            <h3 className="group__heading">
                <button type="button" className="group__head" aria-expanded={open} onClick={onToggle}>
                    <ChevronRight className="group__chevron" size={13} aria-hidden="true" />
                    <span>{title}</span>
                </button>
            </h3>
            {open ? <div className="group__body">{children}</div> : null}
        </section>
    )
}

/** The palette a painted tree is using right now, from its stored values. */
function currentPalette(values: Readonly<Record<string, unknown>>): Palette {
    const palette = resolvePalette(validatePaintedTreeParameters(values).parameters)

    return Object.fromEntries(COLOUR_KEYS.map((key) => [key, palette[key]])) as unknown as Palette
}

/** Picking a colour starts from the current palette, so the other four are kept. */
function PaletteColours({
    keys,
    values,
    onColours,
}: {
    keys: readonly (keyof Palette)[]
    values: Readonly<Record<string, unknown>>
    onColours(patch: Readonly<Record<string, string>>): void
}) {
    const filter = useContext(FilterContext)
    const palette = currentPalette(values)

    return (
        <>
            {keys
                .filter((key) => answers(filter, COLOUR_LABELS[key], 'colour'))
                .map((key) => (
                    <ColourRow
                        key={key}
                        label={COLOUR_LABELS[key]}
                        value={palette[key]}
                        presets={key.startsWith('bark') ? BARK_COLOURS : LEAF_COLOURS}
                        onChange={(value) => onColours({...palette, [key]: value, palette: 'custom'})}
                    />
                ))}
        </>
    )
}

function useGroupMemory(family: string) {
    const saved = useSettingsStore((state) => state.openGroups[family])
    const setOpenGroups = useSettingsStore((state) => state.setOpenGroups)
    const [forced, setForced] = useState<string | null>(null)

    const isOpen = (title: string) => title === forced || (saved ? saved.includes(title) : DEFAULT_OPEN.includes(title))

    return {
        isOpen,
        forceOpen: setForced,
        toggle: (title: string, known: readonly string[]) => {
            const current = known.filter(isOpen)

            setOpenGroups(family, isOpen(title) ? current.filter((name) => name !== title) : [...current, title])
        },
    }
}

function NumberField({label, value, onChange}: {label: string; value: number; onChange(next: number): void}) {
    const [draft, setDraft] = useState<string | null>(null)
    const shown = value.toFixed(3).replace(/\.?0+$/, '') || '0'

    return (
        <label className="axis" data-axis={label}>
            <span className="axis__label">{label}</span>
            <input
                className="axis__input tabular"
                value={draft ?? shown}
                inputMode="decimal"
                onFocus={(event) => {
                    setDraft(shown)
                    event.currentTarget.select()
                }}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => {
                    const next = Number(draft)

                    setDraft(null)

                    if (draft !== null && draft.trim() !== '' && Number.isFinite(next) && next !== value) {
                        onChange(next)
                    }
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.currentTarget.blur()
                    }
                }}
            />
        </label>
    )
}

export function Details() {
    const presetId = useEditorStore((state) => state.presetId)
    const family = familyOfPreset(presetId)
    const scene = useEditorStore((state) => state.scene)
    const familyLabel = PROP_FAMILIES.find(({id}) => id === family)!.label
    const selectedId = useEditorStore((state) => state.selection.selectedId)
    const updateTreeParameters = useEditorStore((state) => state.updateTreeParameters)
    const updateComponentParameters = useEditorStore((state) => state.updateComponentParameters)
    const updateMaterials = useEditorStore((state) => state.updateMaterials)
    const randomizeTree = useEditorStore((state) => state.randomizeTree)
    const copyComponent = useEditorStore((state) => state.copyComponent)
    const restoreComponent = useEditorStore((state) => state.restoreComponent)
    const restoreTree = useEditorStore((state) => state.restoreTree)
    const moveComponent = useEditorStore((state) => state.moveComponent)
    const deselect = useEditorStore((state) => state.deselect)
    const revealed = useUiStore((state) => state.revealedControl)
    const revealControl = useUiStore((state) => state.revealControl)

    const [query, setQuery] = useState('')
    const filter = query.trim().toLowerCase()
    const groups = useGroupMemory(family)
    const body = useRef<HTMLDivElement>(null)

    const asset = scene.assets[0]
    const component = selectedId ? findComponent(scene, selectedId) : undefined
    const treeSpecs = useMemo(
        () => (asset ? findPropGenerator(asset.generatorId)?.parameters : undefined) ?? treeParameterSpecs,
        [asset],
    )

    // The palette pointed at a control: open its group, go to it, and flash it.
    useEffect(() => {
        if (!revealed) {
            return
        }

        const spec = treeSpecs.find(({key}) => key === revealed)
        const shownGroup = shownControls(asset?.generatorId, treeSpecs, asset?.parameters ?? {}).find(({key}) => key === revealed)?.group

        setQuery('')
        groups.forceOpen(shownGroup ?? spec?.group ?? 'Shape')

        const frame = requestAnimationFrame(() => {
            const row = body.current?.querySelector<HTMLElement>(`[data-control="${revealed}"]`)

            if (row) {
                row.scrollIntoView({block: 'center'})
                row.dataset.flash = 'true'
                row.querySelector<HTMLElement>('input, button')?.focus()
                window.setTimeout(() => delete row.dataset.flash, FLASH_MS)
            }

            revealControl(null)
        })

        return () => cancelAnimationFrame(frame)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per request.
    }, [revealed])

    const filterBox = (
        <div className="filter">
            <Search size={13} aria-hidden="true" className="filter__icon" />
            <input
                className="filter__input"
                placeholder="Filter controls"
                aria-label="Filter controls"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Escape' && query) {
                        event.stopPropagation()
                        setQuery('')
                    }
                }}
            />
            {query ? (
                <button type="button" className="filter__clear" aria-label="Clear filter" onClick={() => setQuery('')}>
                    <X size={12} aria-hidden="true" />
                </button>
            ) : null}
        </div>
    )

    const noMatches = filter ? (
        <p className="filter__none">
            Nothing else matches. Try a shorter word, or select the whole {familyLabel.toLowerCase()}.
        </p>
    ) : null

    // Nothing selected means the prop itself. A part has a panel of its own.
    if (!component) {
        const values = asset?.parameters ?? {}
        const base = presetBase(presetId)
        const shown = shownControls(asset?.generatorId, treeSpecs, values)
        const paints = asset ? findPropGenerator(asset.generatorId)?.paintsOwnColours : false
        const grouped = shown.some((spec) => spec.group)
        const titles = grouped ? [...new Set(shown.map((spec) => spec.group ?? 'Shape'))] : ['Shape']
        const allTitles = paints ? titles : [...titles, 'Colours']
        const onChange = (key: string, value: number | string) => updateTreeParameters({[key]: value}, `change ${key}`)
        const onColours = (patch: Readonly<Record<string, string>>) => updateTreeParameters(patch, 'change colours')
        const palettes: PaletteSupport = {specs: treeSpecs, onPatch: updateTreeParameters}

        const groupEmpty = (title: string) =>
            filter !== '' &&
            !shown.some((spec) => (spec.group ?? 'Shape') === title && answers(filter, spec.label, spec.help, spec.group)) &&
            !(title === 'Colours' && (answers(filter, 'colour', 'colours', 'palette', 'trunk', 'leaves') || COLOUR_KEYS.some((key) => answers(filter, COLOUR_LABELS[key]))))

        return (
            <aside className="panel details" aria-label="Details" data-coach="details">
                <header className="details__head">
                    <div className="details__title-row">
                        <h2 className="details__title">{asset ? familyLabel : 'Details'}</h2>
                        <span className="details__scope">Whole prop</span>
                        <button type="button" className="icon-text-button" onClick={randomizeTree} title="Try a different one with the same shape (R)">
                            <Dices size={13} aria-hidden="true" />
                            Surprise me
                        </button>
                        <button
                            type="button"
                            className="icon-button"
                            onClick={() => useUiStore.getState().setVariationsOpen(true)}
                            title="Show me more: nine versions side by side"
                            aria-label="Show me more"
                        >
                            <LayoutGrid size={13} aria-hidden="true" />
                        </button>
                    </div>
                    {filterBox}
                </header>

                <FilterContext.Provider value={filter}>
                    <div className="details__body" ref={body}>
                        {titles.map((title) => (
                            <Group
                                key={title}
                                title={title}
                                open={filter !== '' || groups.isOpen(title)}
                                empty={groupEmpty(title)}
                                onToggle={() => groups.toggle(title, allTitles)}
                            >
                                <ParameterControls
                                    specs={shown.filter((spec) => (spec.group ?? 'Shape') === title)}
                                    values={values}
                                    base={base}
                                    palettes={palettes}
                                    onChange={onChange}
                                />
                                {title === 'Colours' ? (
                                    <PaletteColours keys={COLOUR_KEYS} values={values} onColours={onColours} />
                                ) : null}
                            </Group>
                        ))}

                        {paints ? null : (
                            <Group
                                title="Colours"
                                open={filter !== '' || groups.isOpen('Colours')}
                                empty={groupEmpty('Colours')}
                                onToggle={() => groups.toggle('Colours', allTitles)}
                            >
                                <ColourRow
                                    label="Trunk"
                                    value={asset?.materials.bark ?? '#6b4e35'}
                                    presets={BARK_COLOURS}
                                    onChange={(value) => updateMaterials({bark: value}, 'change trunk colour')}
                                />
                                <ColourRow
                                    label="Leaves"
                                    value={asset?.materials.leaves ?? '#4e7d3e'}
                                    presets={LEAF_COLOURS}
                                    onChange={(value) => updateMaterials({leaves: value}, 'change leaf colour')}
                                />
                            </Group>
                        )}
                        {noMatches}
                    </div>
                </FilterContext.Provider>

                <footer className="details__foot">
                    <button type="button" className="text-button" onClick={restoreTree}>
                        Restore to preset
                    </button>
                </footer>
            </aside>
        )
    }

    const generator = findComponentGenerator(component.generatorId)
    const isFrond = component.parameters.kind === 'frond'
    // A low-poly clump is a few flat faces, not leaf cards, so it has no leaves to thin or size.
    const cardless = asset?.parameters.build === 'low-poly' && component.generatorId === 'painted-clump' && !isFrond
    // A frond has no lumps, and its Flatness is how hard it arches.
    const specs = (generator?.parameters ?? [])
        .filter((spec) => !isFrond || spec.key !== 'lumpinessScale')
        .filter((spec) => !cardless || (spec.key !== 'fullnessScale' && spec.key !== 'leafSizeScale'))
        .map((spec) => (isFrond && spec.key === 'flattenScale' ? {...spec, label: 'Arch'} : spec))
    const painted = isPaintedPart(component.generatorId)
    const isTrunk = component.type === 'trunk' && !painted
    // A painted limb hangs off the tree's plan, and its trunk is the tree.
    const canMove = !isTrunk && !WHOLE_PARTS.includes(component.generatorId)
    // A painted branch or root turns around its base, taking what grows on it along.
    const canTurn = component.generatorId === 'painted-limb' && component.parameters.key !== 't'
    const turn = (Array.isArray(component.parameters.turn) ? component.parameters.turn : [0, 0, 0]) as readonly number[]
    const canRemove = !isTrunk && component.type !== 'trunk' && component.generatorId !== 'painted-bark' && component.generatorId !== 'rock-body'

    // The trunk's shape is the tree's shape: its shared controls read and write
    // the tree, so the two panels can never disagree.
    const values = isTrunk
        ? {
              ...component.parameters,
              ...Object.fromEntries(
                  Object.entries(TRUNK_TREE_KEYS).map(([key, treeKey]) => [
                      key,
                      asset?.parameters[treeKey] ?? component.parameters[key],
                  ]),
              ),
          }
        : component.parameters

    const change = (key: string, value: number | string) => {
        const treeKey = isTrunk ? TRUNK_TREE_KEYS[key] : undefined

        if (treeKey) {
            updateTreeParameters({[treeKey]: value}, `change ${treeKey}`)
            return
        }

        updateComponentParameters(component.id, {[key]: value}, `change ${key}`)
    }

    const sections = sectionsForPart(component.generatorId, component.type)
    const partTitles = ['This part', 'Position', 'Turn', ...sections.map(({title}) => title)]
    const title = isFrond ? 'Frond' : describeComponent(component.type)

    return (
        <aside className="panel details" aria-label="Details" data-coach="details">
            <header className="details__head">
                <div className="details__title-row">
                    <h2 className="details__title details__title--part">{title}</h2>
                    <span className="details__scope">Selected part</span>
                    <button type="button" className="icon-text-button" onClick={deselect}>
                        Whole prop
                    </button>
                </div>
                {filterBox}
            </header>

            <FilterContext.Provider value={filter}>
                <div className="details__body" ref={body}>
                    {/* The bark has no controls of its own: it is all its limbs. */}
                    {specs.length === 0 ? null : (
                        <Group
                            title="This part"
                            open={filter !== '' || groups.isOpen('This part')}
                            empty={filter !== '' && !specs.some((spec) => answers(filter, spec.label, spec.help))}
                            onToggle={() => groups.toggle('This part', partTitles)}
                        >
                            <ParameterControls specs={specs} values={values} onChange={change} />
                            {component.generatorId === 'painted-clump' ? (
                                <ColourRow
                                    label="Colour"
                                    value={
                                        typeof component.parameters.colour === 'string'
                                            ? component.parameters.colour
                                            : currentPalette(asset?.parameters ?? {}).leafMid
                                    }
                                    presets={LEAF_COLOURS}
                                    onChange={(value) => change('colour', value)}
                                />
                            ) : null}
                            {component.generatorId === 'painted-limb' ? (
                                <p className="group__help">Drag the white handles in the view to reshape it.</p>
                            ) : null}
                        </Group>
                    )}

                    {/* The trunk is the base, so moving it would take everything with it. */}
                    {!canMove || filter ? null : (
                        <Group title="Position" open={groups.isOpen('Position')} onToggle={() => groups.toggle('Position', partTitles)}>
                            <div className="axes">
                                {(['x', 'y', 'z'] as const).map((axis, index) => (
                                    <NumberField
                                        key={axis}
                                        label={axis.toUpperCase()}
                                        value={component.transform.position[index]}
                                        onChange={(next) => moveComponent(component.id, axis, next)}
                                    />
                                ))}
                            </div>
                        </Group>
                    )}

                    {!canTurn || filter ? null : (
                        <Group title="Turn" open={groups.isOpen('Turn')} onToggle={() => groups.toggle('Turn', partTitles)}>
                            <div className="axes">
                                {(['X', 'Y', 'Z'] as const).map((axis, index) => (
                                    <NumberField
                                        key={axis}
                                        label={axis}
                                        value={turn[index] ?? 0}
                                        onChange={(next) => {
                                            const angles = [0, 1, 2].map((i) => (i === index ? next : (turn[i] ?? 0)))

                                            updateComponentParameters(component.id, {turn: angles}, 'turn part')
                                        }}
                                    />
                                ))}
                            </div>
                            <p className="group__help">Degrees around its base. Its branches and leaves turn with it.</p>
                        </Group>
                    )}

                    {sections
                        // A section whose every control is hidden on this tree, such as bark detail on a low-poly one, is left out.
                        .filter((section) => section.colours.length > 0 || controlsForTree(section.specs, asset?.parameters ?? {}).length > 0)
                        .map((section) => (
                            <Group
                                key={section.title}
                                title={section.title}
                                open={filter !== '' || groups.isOpen(section.title)}
                                empty={
                                    filter !== '' &&
                                    !section.specs.some((spec) => answers(filter, spec.label, spec.help)) &&
                                    !section.colours.some((key) => answers(filter, COLOUR_LABELS[key], 'colour'))
                                }
                                onToggle={() => groups.toggle(section.title, partTitles)}
                            >
                                <ParameterControls
                                    specs={controlsForTree(section.specs, asset?.parameters ?? {})}
                                    values={asset?.parameters ?? {}}
                                    base={presetBase(presetId)}
                                    palettes={{specs: treeSpecs, onPatch: updateTreeParameters}}
                                    onChange={(key, value) => updateTreeParameters({[key]: value}, `change ${key}`)}
                                />
                                <PaletteColours
                                    keys={section.colours}
                                    values={asset?.parameters ?? {}}
                                    onColours={(patch) => updateTreeParameters(patch, 'change colours')}
                                />
                            </Group>
                        ))}
                    {noMatches}
                </div>
            </FilterContext.Provider>

            <footer className="details__foot">
                {component.generatorId === 'painted-bark' ? null : (
                    <button
                        type="button"
                        className="text-button"
                        onClick={() => (isTrunk ? restoreTree() : restoreComponent(component.id))}
                    >
                        Restore this part
                    </button>
                )}
                <span className="details__foot-spacer" />
                {painted || !canRemove ? null : (
                    <button type="button" className="text-button" onClick={() => copyComponent(component.id)}>
                        Copy
                    </button>
                )}
                {canRemove ? (
                    <button
                        type="button"
                        className="text-button text-button--danger"
                        onClick={() => requestRemovePart(useEditorStore.getState(), component.id)}
                    >
                        <Trash2 size={13} aria-hidden="true" />
                        Remove
                    </button>
                ) : null}
            </footer>
        </aside>
    )
}
