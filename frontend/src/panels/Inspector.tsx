import {useState} from 'react'
import {Slider} from '../components/Slider'
import {DEFAULT_PLACEHOLDER_PARAMETERS} from '../viewport/scene/placeholder'
import {describeComponent, findComponent} from '../core/scene/scene-model'
import {useEditorStore} from '../store/editor-store'

const COMING_SOON = 'Coming soon'

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
    const updateParameters = useEditorStore((state) => state.updateParameters)

    const component = selectedId ? findComponent(scene, selectedId) : undefined

    if (!component) {
        return (
            <aside className="inspector">
                <div className="insp-head">
                    <div className="insp-title-row">
                        <div>
                            <div className="insp-title">Untitled tree</div>
                            <div className="insp-sub">Whole tree</div>
                        </div>
                        <span className="chip chip--moss">Tree</span>
                    </div>
                </div>
                <div className="insp-body">
                    <div className="empty">
                        <h4>Nothing selected</h4>
                        <p>Click the tree in the viewport to see what you can change.</p>
                    </div>
                </div>
                <div className="insp-foot">
                    <button type="button" className="btn btn--ghost btn--sm" disabled title={COMING_SOON}>
                        Restore default
                    </button>
                </div>
            </aside>
        )
    }

    const parameters = component.parameters
    const height = typeof parameters.height === 'number' ? parameters.height : DEFAULT_PLACEHOLDER_PARAMETERS.height
    const thickness =
        typeof parameters.baseRadius === 'number'
            ? parameters.baseRadius
            : DEFAULT_PLACEHOLDER_PARAMETERS.baseRadius

    return (
        <aside className="inspector">
            <div className="insp-head">
                <div className="insp-title-row">
                    <div>
                        <div className="insp-title">{describeComponent(component)}</div>
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
                <Group title="Trunk" help="How tall and thick the trunk is.">
                    <Slider
                        label="Height"
                        value={height}
                        min={1}
                        max={8}
                        step={0.1}
                        unit="m"
                        minLabel="1 m"
                        maxLabel="8 m"
                        onChange={(value) => updateParameters(component.id, {height: value})}
                    />
                    <Slider
                        label="Thickness"
                        value={thickness}
                        min={0.1}
                        max={1}
                        step={0.01}
                        unit="m"
                        minLabel="0.10 m"
                        maxLabel="1.00 m"
                        onChange={(value) => updateParameters(component.id, {baseRadius: value})}
                    />
                </Group>
            </div>

            <div className="insp-foot">
                <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() =>
                        updateParameters(component.id, {
                            height: DEFAULT_PLACEHOLDER_PARAMETERS.height,
                            baseRadius: DEFAULT_PLACEHOLDER_PARAMETERS.baseRadius,
                        })
                    }
                >
                    Restore default
                </button>
            </div>
        </aside>
    )
}
