import {useEffect, useRef, useState} from 'react'
import * as THREE from 'three'
import type {SpinePoint} from '../assets/shared/geometry-utils'
import {unTwistPosition} from '../assets/trees/components/trunk'
import type {Scene} from '../core/scene/scene-model'
import {useEditorStore} from '../store/editor-store'
import {createViewportScene, type ViewportScene} from './scene/create-scene'
import {createHandles, type HandleSet} from './scene/handles'
import {createPicker, pickIndex, pointerOnPlane} from './scene/picking'
import {applySelectionVisuals} from './scene/selection-visuals'

/** A pointer that moves more than this counts as an orbit, not a click. */
const CLICK_THRESHOLD_PX = 5

interface DragState {
    /** The index of the spine point being dragged. */
    readonly index: number
    /** The height of the drag plane, which is the handle's own height. */
    readonly height: number
    /** The twist, needed to turn a world position back into a spine offset. */
    readonly twist: number
    /** The spine as it was when the drag started. */
    readonly spine: SpinePoint[]
    /** The scene before the drag, so one undo step reverses the whole drag. */
    readonly before: ReturnType<typeof useEditorStore.getState>['scene']
}

/** The trunk's spine, when the trunk is the component that is selected. */
function selectedTrunkSpine(
    scene: ReturnType<typeof useEditorStore.getState>['scene'],
    componentId: string | null,
): {spine: SpinePoint[]; height: number; twist: number} | null {
    if (!componentId) {
        return null
    }

    const asset = scene.assets[0]
    const trunk = asset?.components.find(
        (component) => component.id === componentId && component.type === 'trunk',
    )

    if (!trunk) {
        return null
    }

    const spine = trunk.parameters.spine as SpinePoint[] | undefined
    if (!Array.isArray(spine) || spine.length < 2) {
        return null
    }

    return {
        spine,
        height: typeof trunk.parameters.height === 'number' ? trunk.parameters.height : 4,
        twist: typeof trunk.parameters.twist === 'number' ? trunk.parameters.twist : 0,
    }
}

export function Viewport() {
    const containerRef = useRef<HTMLDivElement>(null)
    const sceneRef = useRef<ViewportScene | null>(null)
    const pointerDownRef = useRef<{x: number; y: number} | null>(null)
    const dragRef = useRef<DragState | null>(null)
    const [faces, setFaces] = useState(0)

    useEffect(() => {
        const container = containerRef.current
        if (!container) {
            return
        }

        const store = useEditorStore
        const viewport = createViewportScene(container, store.getState().style)
        sceneRef.current = viewport

        const canvas = viewport.renderer.domElement
        container.appendChild(canvas)

        const handles: HandleSet = createHandles()
        viewport.scene.add(handles.group)

        const picker = createPicker(viewport.camera, canvas, () => [
            viewport.components.group,
        ])

        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
        const hit = new THREE.Vector3()

        let frame = 0
        const render = () => {
            frame = requestAnimationFrame(render)
            viewport.controls.update()
            viewport.renderer.render(viewport.scene, viewport.camera)
            handles.updateScale(viewport.camera, viewport.renderer.domElement.clientHeight)
        }
        frame = requestAnimationFrame(render)

        const observer = new ResizeObserver(() => viewport.resize())
        observer.observe(container)

        /** Keeps the handles in step with the selected trunk. */
        const refreshHandles = () => {
            const state = store.getState()
            const trunk = selectedTrunkSpine(state.scene, state.selection.selectedId)

            if (!trunk) {
                handles.visible = false
                handles.setPositions([])
                return
            }

            const positions = trunk.spine.map((point) => {
                const twist = (trunk.twist * Math.PI) / 180
                return new THREE.Vector3(
                    point.x * Math.cos(twist * point.t) + point.z * Math.sin(twist * point.t),
                    point.t * trunk.height,
                    -point.x * Math.sin(twist * point.t) + point.z * Math.cos(twist * point.t),
                )
            })

            handles.setPositions(positions)
            handles.visible = true
        }

        const onPointerMove = (event: PointerEvent) => {
            const drag = dragRef.current

            if (drag) {
                plane.constant = -drag.height

                const point = pointerOnPlane(
                    event.clientX,
                    event.clientY,
                    viewport.camera,
                    canvas,
                    plane,
                    hit,
                )

                if (!point) {
                    return
                }

                const untwisted = unTwistPosition(point, drag.spine[drag.index].t, drag.twist)

                const spine = drag.spine.map((existing, index) =>
                    index === drag.index
                        ? {...existing, x: untwisted.x, z: untwisted.z}
                        : existing,
                )

                dragRef.current = {...drag, spine}
                store.getState().previewTrunkSpine(spine)
                return
            }

            if (pointerDownRef.current) {
                return
            }

            store.getState().setHover(picker.pick(event.clientX, event.clientY))
        }

        const onPointerDown = (event: PointerEvent) => {
            pointerDownRef.current = {x: event.clientX, y: event.clientY}

            if (event.button !== 0) {
                return
            }

            const state = store.getState()
            const trunk = selectedTrunkSpine(state.scene, state.selection.selectedId)

            if (!trunk) {
                return
            }

            const index = pickIndex(
                event.clientX,
                event.clientY,
                viewport.camera,
                canvas,
                handles.meshes,
            )

            if (index < 0) {
                return
            }

            dragRef.current = {
                index,
                height: trunk.spine[index].t * trunk.height,
                twist: trunk.twist,
                spine: trunk.spine.map((point) => ({...point})),
                before: state.scene,
            }

            // The camera must not orbit while a handle is being dragged.
            viewport.controls.enabled = false
        }

        const onPointerUp = (event: PointerEvent) => {
            const start = pointerDownRef.current
            const drag = dragRef.current
            pointerDownRef.current = null
            dragRef.current = null
            viewport.controls.enabled = true

            if (drag) {
                store.getState().commitTrunkShape(drag.before, drag.spine)
                return
            }

            if (!start || event.button !== 0) {
                return
            }

            const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y)
            if (moved > CLICK_THRESHOLD_PX) {
                return
            }

            const componentId = picker.pick(event.clientX, event.clientY)

            if (componentId) {
                store.getState().select(componentId)
            } else {
                store.getState().deselect()
            }
        }

        const onPointerLeave = () => {
            pointerDownRef.current = null
            store.getState().setHover(null)
        }

        canvas.addEventListener('pointermove', onPointerMove)
        canvas.addEventListener('pointerdown', onPointerDown)
        canvas.addEventListener('pointerup', onPointerUp)
        canvas.addEventListener('pointerleave', onPointerLeave)

        /**
         * Reframes the camera when the tree's height changes enough that it
         * would otherwise leave the frame.
         */
        let framedHeight = 0
        const reframeIfNeeded = (scene: Scene) => {
            const asset = scene.assets[0]
            const height = typeof asset?.parameters.height === 'number' ? asset.parameters.height : 0

            if (Math.abs(height - framedHeight) > framedHeight * 0.2) {
                framedHeight = height
                viewport.frameScene(scene)
            }
        }

        const unsubscribe = store.subscribe((state, previous) => {
            if (state.scene !== previous.scene) {
                viewport.syncScene(state.scene)
                setFaces(viewport.countFaces())
                reframeIfNeeded(state.scene)
            }

            if (state.style !== previous.style) {
                viewport.setStyle(state.style)
                viewport.syncScene(state.scene)
                setFaces(viewport.countFaces())
            }

            if (state.selection !== previous.selection) {
                applySelectionVisuals(viewport, state.selection)
                refreshHandles()
            }
        })

        viewport.syncScene(store.getState().scene)
        applySelectionVisuals(viewport, store.getState().selection)
        refreshHandles()
        setFaces(viewport.countFaces())
        reframeIfNeeded(store.getState().scene)

        return () => {
            cancelAnimationFrame(frame)
            observer.disconnect()
            unsubscribe()

            canvas.removeEventListener('pointermove', onPointerMove)
            canvas.removeEventListener('pointerdown', onPointerDown)
            canvas.removeEventListener('pointerup', onPointerUp)
            canvas.removeEventListener('pointerleave', onPointerLeave)

            handles.dispose()
            viewport.dispose()
            sceneRef.current = null
        }
    }, [])

    return (
        <div className="viewport">
            <div ref={containerRef} style={{position: 'absolute', inset: 0}} />
            <div className="viewport__hint">
                Left drag to orbit · right drag to pan · scroll to zoom
            </div>
            <div className="viewport__faces">{faces.toLocaleString()} faces</div>
            <div className="viewport__gizmo" aria-hidden="true">
                <svg width="34" height="34" viewBox="-17 -17 34 34">
                    <line x1="0" y1="0" x2="-7" y2="13" stroke="#d16a5a" strokeWidth="2" strokeLinecap="round" />
                    <line x1="0" y1="0" x2="0" y2="-15" stroke="#8cc46a" strokeWidth="2" strokeLinecap="round" />
                    <line x1="0" y1="0" x2="8" y2="9" stroke="#5f8fd1" strokeWidth="2" strokeLinecap="round" />
                </svg>
            </div>
        </div>
    )
}
