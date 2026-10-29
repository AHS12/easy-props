import {useState} from 'react'
import {ColourPicker} from '../components/ColourPicker'
import {Segmented} from '../components/Segmented'
import {Select} from '../components/Select'
import {Slider} from '../components/Slider'
import {findComponentGenerator} from '../assets/trees/component-generators'
import {treeParameterSpecs} from '../assets/trees/branching-tree-generator'
import {BARK_COLOURS, LEAF_COLOURS} from '../assets/style/materials'
import {describeComponent} from '../assets/shared/component-types'
import type {NumberParameter, ParameterSpec} from '../assets/shared/parameters'
import {findComponent} from '../core/scene/scene-model'
import {useEditorStore} from '../store/editor-store'

const COMING_SOON = 'Coming soon'

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

export function Inspector() {
    const scene = useEditorStore((state) => state.scene)
    const selectedId = useEditorStore((state) => state.selection.selectedId)
    const updateTreeParameters = useEditorStore((state) => state.updateTreeParameters)
    const updateComponentParameters = useEditorStore((state) => state.updateComponentParameters)
    const updateMaterials = useEditorStore((state) => state.updateMaterials)
    const randomizeTree = useEditorStore((state) => state.randomizeTree)

    const asset = scene.assets[0]
    const component = selectedId ? findComponent(scene, selectedId) : undefined

    // The trunk carries the tree's shape, so its controls are the tree's
    // controls. Everything else has its own.
    const isTreeLevel = !component || component.type === 'trunk'

    if (isTreeLevel) {
        const values = asset?.parameters ?? {}

        return (
            <aside className="inspector" data-coach="inspector">
                <div className="insp-head">
                    <div className="insp-title-row">
                        <div>
                            <div className="insp-title">Whole tree</div>
                            <div className="insp-sub">
                                {component ? describeComponent(component.type) : 'Nothing selected'}
                            </div>
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
                    <button type="button" className="btn btn--ghost btn--sm" disabled title={COMING_SOON}>
                        Restore default
                    </button>
                </div>
            </aside>
        )
    }

    const generator = findComponentGenerator(component.generatorId)
    const specs = generator?.parameters ?? []

    return (
        <aside className="inspector">
            <div className="insp-head">
                <div className="insp-title-row">
                    <div>
                        <div className="insp-title">{describeComponent(component.type)}</div>
                        <div className="insp-sub">Selected part</div>
                    </div>
                    <span className="chip chip--bark">Part</span>
                </div>
                <div className="insp-actions">
                    <button type="button" className="btn btn--secondary btn--sm" disabled title={COMING_SOON}>
                        Copy
                    </button>
                    <button type="button" className="btn btn--secondary btn--sm" disabled title={COMING_SOON}>
                        Delete
                    </button>
                </div>
            </div>

            <div className="insp-body">
                <Group title={generator?.label ?? 'Part'} help="What this part looks like.">
                    <ParameterControls
                        specs={specs}
                        values={component.parameters}
                        onChange={(key, value) =>
                            updateComponentParameters(
                                component.id,
                                {[key]: value},
                                `change ${key}`,
                            )
                        }
                    />
                </Group>
            </div>

            <div className="insp-foot">
                <button type="button" className="btn btn--ghost btn--sm" disabled title={COMING_SOON}>
                    Restore default
                </button>
            </div>
        </aside>
    )
}
