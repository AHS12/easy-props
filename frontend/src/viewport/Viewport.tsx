import {useCallback, useEffect, useRef, useState} from 'react'
import {LEVEL_SHARES} from '../core/export/pipeline/types'
import {afterPaint} from '../core/export/pipeline/yield'
import * as THREE from 'three'
import type {SpineLike} from '../assets/shared/spines'
import type {Scene} from '../core/scene/scene-model'
import {useEditorStore} from '../store/editor-store'
import {useSetting, useSettingsStore, settingValue} from '../store/settings-store'
import {useUiStore} from '../store/ui-store'
import {applyCameraScheme, type CameraScheme} from './scene/camera-controls'
import {createViewportScene, type Backdrop, type ViewportScene} from './scene/create-scene'
import {registerViewport, type ViewAngle} from './viewport-bridge'
import {createHandles, type HandleSet} from './scene/handles'
import {createPicker, pickNearestAxis, pickNearestHandle, pointerOnAxis, pointerOnPlane} from './scene/picking'
import {applySelectionVisuals} from './scene/selection-visuals'
import {dragPlaneFor, movedSpine, selectedSpine, type PartSpine} from './scene/spine-drag'
import {createMoveGizmo, type MoveGizmo} from './scene/move-gizmo'
import {findComponent} from '../core/scene/scene-model'
import {Compass, type CompassAxis, type CompassHandle} from './Compass'
import type {LoadStep} from './load-steps'
import {ViewportLoading} from './ViewportLoading'
import {ViewportOverlay} from './ViewportOverlay'
import {presetThumbnailsDrawn} from '../panels/preset-thumbnails'

/** The longest the loading screen waits for the side panel's previews. */
const PREVIEWS_WAIT_MS = 20000
/** A pointer that moves more than this counts as an orbit, not a click. */
const CLICK_THRESHOLD_PX = 5

/** Which way the camera's up vector points when it looks down an axis. */
const UP: Record<CompassAxis, THREE.Vector3> = {
    x: new THREE.Vector3(0, 1, 0),
    y: new THREE.Vector3(0, 0, -1),
    z: new THREE.Vector3(0, 1, 0),
}

const isDemoScene = (backdrop: unknown) => backdrop === 'meadow' || backdrop === 'grove'

/** How a move drag is pinned to one axis. */
interface MoveState {
    readonly componentId: string
    readonly axis: number
    readonly origin: THREE.Vector3
    readonly direction: THREE.Vector3
    readonly start: number
    readonly position: readonly [number, number, number]
    readonly before: Scene
    latest: readonly [number, number, number] | null
}

interface DragState {
    readonly index: number
    /** The spine as it was when the drag started. */
    readonly spine: PartSpine
    /** The plane the point slides along, fixed for the whole drag. */
    readonly plane: THREE.Plane
    /** The scene before the drag, so one undo step reverses the whole drag. */
    readonly before: Scene
    /** The most recent result, which is what gets committed. */
    latest: readonly SpineLike[] | null
}

export function Viewport() {
    const containerRef = useRef<HTMLDivElement>(null)
    const sceneRef = useRef<ViewportScene | null>(null)
    const pointerDownRef = useRef<{x: number; y: number} | null>(null)
    const dragRef = useRef<DragState | null>(null)
    const moveRef = useRef<MoveState | null>(null)
    const compassRef = useRef<CompassHandle>(null)
    const reportFaces = (viewport: ViewportScene) => {
        const counts = viewport.countFacesByMesh()

        useEditorStore.getState().setShownFaceCounts(counts)

        // A budget is about the full prop, whichever level is being looked at.
        if (useEditorStore.getState().previewLevel === 0) {
            useEditorStore.getState().setFaceCounts(counts)
        }
    }
    // The browser cannot change this on a live canvas, so a change rebuilds the view.
    const antialias = useSetting('antialias') === true
    const [loadStep, setLoadStep] = useState<LoadStep | null>('view')
    const [painted, setPainted] = useState(false)

    // Opening the editor stays quick on any computer: the page goes up first, with
    // the loading screen on it, and the slow work follows.
    useEffect(() => {
        let current = true

        void afterPaint().then(() => current && setPainted(true))

        return () => {
            current = false
        }
    }, [])

    /**
     * Looks down an axis, keeping the current distance from what the camera is
     * looking at, which is how the gizmo in a 3D package behaves.
     */
    const snapToAxis = useCallback((axis: CompassAxis, sign: 1 | -1) => {
        const viewport = sceneRef.current
        if (!viewport) {
            return
        }

        const target = viewport.controls.target
        const distance = Math.max(viewport.camera.position.distanceTo(target), 0.5)

        const direction = new THREE.Vector3()
        direction[axis] = sign

        viewport.camera.up.copy(UP[axis])
        viewport.camera.position.copy(target).addScaledVector(direction, distance)
        viewport.camera.lookAt(target)
        viewport.controls.update()
    }, [])

    useEffect(() => {
        const container = containerRef.current
        if (!container || !painted) {
            return
        }

        let stopped = false

        setLoadStep('view')

        const store = useEditorStore
        const viewport = createViewportScene(container, store.getState().style, antialias)
        sceneRef.current = viewport

        const canvas = viewport.renderer.domElement
        // Replace rather than append. React's strict mode mounts the effect
        // twice in development, and a leftover canvas from the first mount
        // would sit on top of the live one.
        container.replaceChildren(canvas)

        const handles: HandleSet = createHandles()
        viewport.scene.add(handles.group)

        const gizmo: MoveGizmo = createMoveGizmo()
        viewport.scene.add(gizmo.group)

        const picker = createPicker(viewport.camera, canvas, () => [
            viewport.components.group,
        ])

        const hit = new THREE.Vector3()

        let frame = 0
        let lastDrawn = 0
        const render = (now: number) => {
            frame = requestAnimationFrame(render)

            const limit = Number(settingValue('frameLimit'))

            // A small allowance, so a 60 limit on a 60 Hz display does not halve it.
            if (limit > 0 && now - lastDrawn < 1000 / limit - 2) {
                return
            }

            lastDrawn = now
            viewport.controls.update()
            viewport.renderer.render(viewport.scene, viewport.camera)
            handles.updateScale(viewport.camera, viewport.renderer.domElement.clientHeight)
            gizmo.updateScale(viewport.camera, viewport.renderer.domElement.clientHeight)
            compassRef.current?.update(viewport.camera)
        }

        const observer = new ResizeObserver(() => viewport.resize())
        observer.observe(container)

        /** Keeps the handles in step with the selected part's spine. */
        const refreshHandles = () => {
            const state = store.getState()
            const spine = selectedSpine(state.scene, state.selection.selectedId)

            if (!spine) {
                handles.visible = false
                handles.setPositions([])
                return
            }

            handles.setPositions(spine.positions)
            handles.visible = true
        }

        /** Puts the move gizmo on the selected part, or hides it. */
        const refreshGizmo = () => {
            const state = store.getState()
            const selected = state.selection.selectedId

            if (!state.moveTool || !selected) {
                gizmo.setOrigin(null)
                return
            }

            const component = findComponent(state.scene, selected)
            const fixed = component?.generatorId === 'painted-limb' || component?.generatorId === 'painted-bark' || component?.generatorId === 'rock-body'

            gizmo.setOrigin(
                component && !fixed ? new THREE.Vector3(...component.transform.position) : null,
            )
        }

        const onPointerMove = (event: PointerEvent) => {
            const move = moveRef.current

            if (move) {
                const t = pointerOnAxis(
                    event.clientX,
                    event.clientY,
                    viewport.camera,
                    canvas,
                    move.origin,
                    move.direction,
                )

                if (t === null) {
                    return
                }

                const delta = t - move.start
                const position: [number, number, number] = [
                    move.position[0] + move.direction.x * delta,
                    move.position[1] + move.direction.y * delta,
                    move.position[2] + move.direction.z * delta,
                ]

                move.latest = position
                store.getState().previewPosition(move.componentId, position)
                return
            }

            const drag = dragRef.current

            if (drag) {
                const point = pointerOnPlane(
                    event.clientX,
                    event.clientY,
                    viewport.camera,
                    canvas,
                    drag.plane,
                    hit,
                )

                if (!point) {
                    return
                }

                const spine = movedSpine(drag.spine, drag.index, point)
                drag.latest = spine
                store.getState().previewSpine(drag.spine.componentId, spine)
                return
            }

            if (pointerDownRef.current) {
                return
            }

            // With the move tool on, the arrow under the pointer lights up,
            // so the user can see what a drag is about to grab.
            if (store.getState().moveTool) {
                gizmo.setHovered(
                    pickNearestAxis(
                        event.clientX,
                        event.clientY,
                        viewport.camera,
                        canvas,
                        gizmo.segments(),
                    ),
                )
            }

            store.getState().setHover(picker.pick(event.clientX, event.clientY))
        }

        const onPointerDown = (event: PointerEvent) => {
            pointerDownRef.current = {x: event.clientX, y: event.clientY}

            if (event.button !== 0) {
                return
            }

            const state = store.getState()

            // A move drag comes first: the gizmo is what the pointer is on.
            if (state.moveTool && state.selection.selectedId) {
                const segments = gizmo.segments()
                const axis = pickNearestAxis(
                    event.clientX,
                    event.clientY,
                    viewport.camera,
                    canvas,
                    segments,
                )

                const component =
                    axis >= 0 ? findComponent(state.scene, state.selection.selectedId!) : undefined

                if (axis >= 0 && component) {
                    const origin = segments[axis].start
                    const direction = segments[axis].end.clone().sub(origin).normalize()
                    const start = pointerOnAxis(
                        event.clientX,
                        event.clientY,
                        viewport.camera,
                        canvas,
                        origin,
                        direction,
                    )

                    if (start !== null) {
                        moveRef.current = {
                            componentId: component.id,
                            axis,
                            origin,
                            direction,
                            start,
                            position: [...component.transform.position] as [
                                number,
                                number,
                                number,
                            ],
                            before: state.scene,
                            latest: null,
                        }

                        viewport.controls.enabled = false
                        return
                    }
                }
            }

            const spine = selectedSpine(state.scene, state.selection.selectedId)

            if (!spine) {
                return
            }

            const index = pickNearestHandle(
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
                spine,
                plane: dragPlaneFor(spine, index, viewport.camera),
                before: state.scene,
                latest: null,
            }

            // The camera must not orbit while a handle is being dragged.
            viewport.controls.enabled = false
        }

        const onPointerUp = (event: PointerEvent) => {
            const start = pointerDownRef.current
            const move = moveRef.current
            const drag = dragRef.current
            pointerDownRef.current = null
            dragRef.current = null
            moveRef.current = null
            viewport.controls.enabled = true

            if (move) {
                if (move.latest) {
                    store
                        .getState()
                        .commitPosition(move.before, move.componentId, move.latest)
                }

                return
            }

            if (drag) {
                if (drag.latest) {
                    store.getState().commitSpine(drag.before, drag.spine.componentId, drag.latest)
                }

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
         *
         * Never while the pointer is down: a camera that jumps during a drag
         * makes the tree seem to jump, so it waits for the release.
         */
        let framedHeight = 0
        let pointerHeld = false
        const reframeIfNeeded = (scene: Scene) => {
            const asset = scene.assets[0]
            const height = typeof asset?.parameters.height === 'number' ? asset.parameters.height : 0

            if (!pointerHeld && Math.abs(height - framedHeight) > framedHeight * 0.2) {
                framedHeight = height
                viewport.frameScene(scene)
            }
        }

        const onWindowPointerDown = () => {
            pointerHeld = true
        }
        const onWindowPointerUp = () => {
            pointerHeld = false
            reframeIfNeeded(store.getState().scene)
        }

        window.addEventListener('pointerdown', onWindowPointerDown, true)
        window.addEventListener('pointerup', onWindowPointerUp, true)
        window.addEventListener('pointercancel', onWindowPointerUp, true)

        const unsubscribe = store.subscribe((state, previous) => {
            if (state.scene !== previous.scene) {
                viewport.syncScene(state.scene)
                applySelectionVisuals(viewport, state.selection)
                reportFaces(viewport)
                reframeIfNeeded(state.scene)
                refreshHandles()
                // The gizmo sits on the part, so it moves with it. A drag
                // still measures against the axis as it was at the start.
                refreshGizmo()
            }

            if (state.style !== previous.style) {
                viewport.setStyle(state.style)
                viewport.syncScene(state.scene)
                reportFaces(viewport)
            }

            if (state.previewLevel !== previous.previewLevel) {
                viewport.setDetail(LEVEL_SHARES[state.previewLevel])
                viewport.syncScene(state.scene)
                reportFaces(viewport)
            }

            if (state.lighting !== previous.lighting) {
                viewport.setLighting(state.lighting)
            }

            if (state.shadingMode !== previous.shadingMode) {
                viewport.setShadingMode(state.shadingMode)
                viewport.syncScene(state.scene)
            }

            if (state.selection !== previous.selection) {
                applySelectionVisuals(viewport, state.selection)
                refreshHandles()
                refreshGizmo()
            }

            if (state.moveTool !== previous.moveTool) {
                refreshGizmo()
            }
        })

        registerViewport({
            frame: () => viewport.frameComponent(store.getState().selection.selectedId),
            frameDemo: () => {
                viewport.camera.up.set(0, 1, 0)
                viewport.camera.position.set(-10, 5, 15)
                viewport.controls.target.set(3, 3.5, -5)
                viewport.controls.update()
            },
            setView: (angle: ViewAngle) => {
                const target = viewport.controls.target
                const distance = Math.max(viewport.camera.position.distanceTo(target), 0.5)

                if (angle === 'perspective') {
                    viewport.camera.up.set(0, 1, 0)
                    viewport.camera.position
                        .copy(target)
                        .add(new THREE.Vector3(-0.62, 0.36, 0.62).normalize().multiplyScalar(distance))
                    viewport.controls.update()
                } else {
                    const [axis, sign] = ({front: ['z', 1], side: ['x', 1], top: ['y', 1]} as const)[angle]

                    snapToAxis(axis, sign)
                }
            },
            stats: () => ({
                drawCalls: viewport.renderer.info.render.calls,
                size: viewport.contentSize(),
            }),
        })

        // Settings apply at once. The scheme's listener has to be swapped, and the
        // rest only touch what changed.
        let schemeOff = () => undefined as void
        let demoSceneBuilt = isDemoScene(settingValue('backdrop'))
        const applySettings = () => {
            const values = useSettingsStore.getState().values

            // Built the first time it is wanted, which takes a moment, so say so first.
            if (isDemoScene(values.backdrop) && !demoSceneBuilt) {
                demoSceneBuilt = true
                setLoadStep('scene')
                void afterPaint().then(() => {
                    if (!stopped) {
                        applySettings()
                        setLoadStep(null)
                    }
                })

                return
            }

            const invert = values.invertZoom === true

            viewport.controls.rotateSpeed = Number(values.orbitSpeed)
            viewport.controls.zoomSpeed = Number(values.zoomSpeed) * (invert ? -1 : 1)
            viewport.setFieldOfView(Number(values.fov))
            viewport.setBackdrop(values.backdrop as Backdrop, String(values.backdropColour))
            viewport.setGridVisible(values.grid === true)
            viewport.setRenderScale(Number(values.renderScale) / 100)
            schemeOff()
            schemeOff = applyCameraScheme(viewport.controls, canvas, values.cameraScheme as CameraScheme)
        }

        applySettings()
        viewport.setShadowsAllowed(settingValue('shadows') === true)
        viewport.setScaleFigureVisible(useUiStore.getState().showScaleFigure)

        const unsubscribeSettings = useSettingsStore.subscribe((state, previous) => {
            if (state.values !== previous.values) {
                applySettings()

                if (state.values.shadows !== previous.values.shadows) {
                    viewport.setShadowsAllowed(state.values.shadows === true)
                }
            }
        })
        const unsubscribeUi = useUiStore.subscribe((state, previous) => {
            if (state.showScaleFigure !== previous.showScaleFigure) {
                viewport.setScaleFigureVisible(state.showScaleFigure)
            }
        })

        viewport.setOnContentArrived(() => {
            // Parts rebuilt just now have not been told whether they are selected.
            applySelectionVisuals(viewport, store.getState().selection)
            reportFaces(viewport)
        })
        viewport.setLighting(store.getState().lighting)
        viewport.setShadingMode(store.getState().shadingMode)

        const load = async () => {
            setLoadStep('prop')
            await afterPaint()

            if (stopped) {
                return
            }

            viewport.syncScene(store.getState().scene)
            applySelectionVisuals(viewport, store.getState().selection)
            refreshHandles()
            refreshGizmo()
            reportFaces(viewport)
            reframeIfNeeded(store.getState().scene)

            setLoadStep('draw')
            await afterPaint()

            if (stopped) {
                return
            }

            // The first draw is slow too: it is when the graphics card prepares its shaders.
            frame = requestAnimationFrame(render)
            await afterPaint()

            if (stopped) {
                return
            }

            // Each preview blocks the page while its tree is built, so they are drawn behind
            // this screen, not under someone's first drag. The limit is for a very slow computer:
            // what is left then is only some late pictures.
            setLoadStep('previews')
            await Promise.race([
                presetThumbnailsDrawn(),
                new Promise((resolve) => window.setTimeout(resolve, PREVIEWS_WAIT_MS)),
            ])

            if (!stopped) {
                setLoadStep(null)
            }
        }

        void load()

        return () => {
            stopped = true
            cancelAnimationFrame(frame)
            observer.disconnect()
            unsubscribe()
            unsubscribeSettings()
            unsubscribeUi()
            schemeOff()
            registerViewport(null)

            window.removeEventListener('pointerdown', onWindowPointerDown, true)
            window.removeEventListener('pointerup', onWindowPointerUp, true)
            window.removeEventListener('pointercancel', onWindowPointerUp, true)

            canvas.removeEventListener('pointermove', onPointerMove)
            canvas.removeEventListener('pointerdown', onPointerDown)
            canvas.removeEventListener('pointerup', onPointerUp)
            canvas.removeEventListener('pointerleave', onPointerLeave)

            handles.dispose()
            gizmo.dispose()
            viewport.dispose()
            canvas.remove()
            sceneRef.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- snapToAxis never changes.
    }, [antialias, painted])

    return (
        <div className="viewport" data-coach="viewport">
            <div ref={containerRef} style={{position: 'absolute', inset: 0}} />
            {loadStep ? <ViewportLoading step={loadStep} /> : null}
            <Compass ref={compassRef} onSnap={snapToAxis} />
            <ViewportOverlay />
        </div>
    )
}
