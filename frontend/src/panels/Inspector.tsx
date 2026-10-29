import {useState} from 'react'
import {ColourPicker} from '../components/ColourPicker'
import {Segmented} from '../components/Segmented'
import {Select} from '../components/Select'
import {Slider} from '../components/Slider'
import {findComponentGenerator} from '../assets/trees/component-generators'
import {treeParameterSpecs} from '../assets/trees/branching-tree-generator'
import {BARK_COLOURS, LEAF_COLOURS} from '../assets/style/materials'
import {describeComponent, type SurfacePush} from '../assets/shared/component-types'
import type {NumberParameter, ParameterSpec} from '../assets/shared/parameters'
import {findComponent} from '../core/scene/scene-model'
import {useEditorStore} from '../store/editor-store'
import {TRUNK_TREE_KEYS} from './trunk-controls'

function formatValue(value: number, spec: NumberParameter): string {
    const decimals = spec.step < 1 ? 2 : 0
    return `${value.toFixed(decimals)}${spec.unit && spec.unit !== 'count' ? ` ${spec.unit}` : ''}`
}

/**
 * Renders the controls for a set of parameters.
 *
 * The specs come from the generator, so the inspector always offers exactly
 * what the generator understands.
 */
function ParameterControls({
    specs,
    values,
    onChange,
}: {
    specs: readonly ParameterSpec[]
    values: Readonly<Record<string, unknown>>
    onChange: (key: string, value: number | string) => void
}) {
    return (
        <>
            {specs.map((spec) => {
                if (spec.kind === 'number') {
                    const raw = values[spec.key]
                    const value = typeof raw === 'number' ? raw : spec.default

                    return (
                        <Slider
                            key={spec.key}
                            label={spec.label}
                            value={value}
                            min={spec.min}
                            max={spec.max}
                            step={spec.step}
                            unit={spec.unit === 'count' ? undefined : spec.unit}
                            minLabel={formatValue(spec.min, spec)}
                            maxLabel={formatValue(spec.max, spec)}
                            onChange={(next) => onChange(spec.key, next)}
                        />
                    )
                }

                const raw = values[spec.key]
                const value = typeof raw === 'string' ? raw : spec.default

                return (
                    <div className="field" key={spec.key}>
                        <div className="field__label">
                            <span>{spec.label}</span>
                        </div>
                        {spec.options.length > 3 ? (
                            <Select
                                label={spec.label}
                                value={value}
                                onChange={(next) => onChange(spec.key, next)}
                                options={spec.options.map((option) => ({
                                    value: option.value,
                                    label: option.label,
                                }))}
                            />
                        ) : (
                            <Segmented
                                label={spec.label}
                                wide
                                value={value}
                                onChange={(next) => onChange(spec.key, next)}
                                options={spec.options.map((option) => ({
                                    value: option.value,
                                    label: option.label,
                                }))}
                            />
                        )}
                    </div>
                )
            })}
        </>
    )
}

/** A plain number field, for values that have no sensible range. */
function NumberField({
    label,
    value,
    onChange,
}: {
    label: string
    value: number
    onChange: (next: number) => void
}) {
    return (
        <label className="num">
            <span className="num__label">{label}</span>
            <input
                className="num__input"
                type="number"
                step={0.05}
                value={Number(value.toFixed(3))}
                onChange={(event) => {
                    const next = Number(event.target.value)

                    if (Number.isFinite(next)) {
                        onChange(next)
                    }
                }}
            />
        </label>
    )
}

function Group({
    title,
    help,
    children,
}: {
    title: string
    help?: string
    children: React.ReactNode
}) {
    const [open, setOpen] = useState(true)

    return (
        <section className="group" data-open={open}>
            <h3 className="group__heading">
                <button
                    type="button"
                    className="group__head"
                    aria-expanded={open}
                    onClick={() => setOpen((current) => !current)}
                >
                    <span>{title}</span>
                    <span className="group__chevron" aria-hidden="true">
                        ▼
                    </span>
                </button>
            </h3>
            <div className="group__body">
                {help ? <p className="group__help">{help}</p> : null}
                {children}
            </div>
        </section>
    )
}

/**
 * The trunk's shape is the tree's shape.
 *
 * The trunk's panel shows the tree's values for the five controls they share
 * and writes them to the tree, so the two panels can never disagree and a
 * change made with the trunk selected does not move the trunk out from under
 * its branches. Only the point count is the part's own.
 */
export function Inspector() {
    const scene = useEditorStore((state) => state.scene)
    const selectedId = useEditorStore((state) => state.selection.selectedId)
    const updateTreeParameters = useEditorStore((state) => state.updateTreeParameters)
    const updateComponentParameters = useEditorStore((state) => state.updateComponentParameters)
    const updateMaterials = useEditorStore((state) => state.updateMaterials)
    const randomizeTree = useEditorStore((state) => state.randomizeTree)
    const copyComponent = useEditorStore((state) => state.copyComponent)
    const deleteComponent = useEditorStore((state) => state.deleteComponent)
    const restoreComponent = useEditorStore((state) => state.restoreComponent)
    const restoreTree = useEditorStore((state) => state.restoreTree)
    const setPushes = useEditorStore((state) => state.setPushes)
    const moveComponent = useEditorStore((state) => state.moveComponent)

    const asset = scene.assets[0]
    const component = selectedId ? findComponent(scene, selectedId) : undefined

    // Nothing selected means the tree itself. A part, including the trunk,
    // has a panel of its own.
    if (!component) {
        const values = asset?.parameters ?? {}

        return (
            <aside className="inspector" data-coach="inspector">
                <div className="insp-head">
                    <div className="insp-title-row">
                        <div>
                            <div className="insp-title">Whole tree</div>
                            <div className="insp-sub">Nothing selected</div>
                        </div>
                        <span className="chip chip--moss">Tree</span>
                    </div>
                </div>

                <div className="insp-body">
                    <Group title="Shape" help="The overall size and shape of the tree.">
                        <ParameterControls
                            specs={treeParameterSpecs}
                            values={values}
                            onChange={(key, value) =>
                                updateTreeParameters({[key]: value}, `change ${key}`)
                            }
                        />
                    </Group>

                    <Group title="Colours" help="The colours the tree is painted with.">
                        <ColourPicker
                            label="Trunk"
                            value={asset?.materials.bark ?? '#6b4e35'}
                            presets={BARK_COLOURS}
                            onChange={(value) => updateMaterials({bark: value}, 'change trunk colour')}
                        />
                        <ColourPicker
                            label="Leaves"
                            value={asset?.materials.leaves ?? '#4e7d3e'}
                            presets={LEAF_COLOURS}
                            onChange={(value) =>
                                updateMaterials({leaves: value}, 'change leaf colour')
                            }
                        />
                    </Group>

                    <Group title="Variation" help="Try a different tree with the same shape.">
                        <button type="button" className="btn btn--secondary" onClick={randomizeTree}>
                            Surprise me
                        </button>
                    </Group>
                </div>

                <div className="insp-foot">
                    <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={restoreTree}
                    >
                        Restore default
                    </button>
                </div>
            </aside>
        )
    }

    const generator = findComponentGenerator(component.generatorId)
    const specs = generator?.parameters ?? []
    const isTrunk = component.type === 'trunk'
    const pushes = Array.isArray(component.parameters.pushes)
        ? (component.parameters.pushes as SurfacePush[])
        : []

    // A trunk's shared controls read from the tree, so the panel shows what is
    // actually driving the shape.
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

    return (
        <aside className="inspector">
            <div className="insp-head">
                <div className="insp-title-row">
                    <div>
                        <div className="insp-title">{describeComponent(component.type)}</div>
                        <div className="insp-sub">
                            {isTrunk ? "The tree's body" : 'Selected part'}
                        </div>
                    </div>
                    <span className="chip chip--bark">Part</span>
                </div>
                {/* The trunk cannot be copied or removed: it is the tree. */}
                {isTrunk ? null : (
                    <div className="insp-actions">
                        <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            onClick={() => copyComponent(component.id)}
                        >
                            Copy
                        </button>
                        <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            onClick={() => deleteComponent(component.id)}
                        >
                            Remove
                        </button>
                    </div>
                )}
            </div>

            <div className="insp-body">
                <Group title={generator?.label ?? 'Part'} help="What this part looks like.">
                    <ParameterControls specs={specs} values={values} onChange={change} />
                </Group>

                {/* The trunk is the tree's base, so moving it would take the
                    root of everything with it. */}
                {isTrunk ? null : (
                    <Group title="Position" help="Where the part sits, in metres.">
                        {(['x', 'y', 'z'] as const).map((axis, index) => (
                            <NumberField
                                key={axis}
                                label={axis.toUpperCase()}
                                value={component.transform.position[index]}
                                onChange={(next) => moveComponent(component.id, axis, next)}
                            />
                        ))}
                    </Group>
                )}

                {pushes.length > 0 ? (
                    <Group
                        title="Surface"
                        help="Pushes and pulls you have made on this part."
                    >
                        <div className="push-count">
                            <span>
                                {pushes.length} {pushes.length === 1 ? 'push' : 'pushes'}
                            </span>
                            <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                onClick={() => setPushes(component.id, pushes.slice(0, -1))}
                            >
                                Undo last
                            </button>
                            <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                onClick={() => setPushes(component.id, [])}
                            >
                                Clear
                            </button>
                        </div>
                    </Group>
                ) : null}
            </div>

            <div className="insp-foot">
                <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => (isTrunk ? restoreTree() : restoreComponent(component.id))}
                >
                    Restore default
                </button>
            </div>
        </aside>
    )
}
