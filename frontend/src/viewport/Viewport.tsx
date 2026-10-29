import {useEffect, useRef, useState} from 'react'
import {useEditorStore} from '../store/editor-store'
import {createViewportScene, type ViewportScene} from './scene/create-scene'
import {createPicker} from './scene/picking'
import {readPlaceholderParameters} from './scene/placeholder'
import {applySelectionVisuals} from './scene/selection-visuals'

/** A pointer that moves more than this counts as an orbit, not a click. */
const CLICK_THRESHOLD_PX = 5

export function Viewport() {
    const containerRef = useRef<HTMLDivElement>(null)
    const sceneRef = useRef<ViewportScene | null>(null)
    const pointerDownRef = useRef<{x: number; y: number} | null>(null)
    const [faces, setFaces] = useState(0)

    useEffect(() => {
        const container = containerRef.current
        if (!container) {
            return
        }

        const store = useEditorStore
        const viewport = createViewportScene(
            container,
            store.getState().style,
            readPlaceholderParameters(store.getState().scene),
        )
        sceneRef.current = viewport

        const canvas = viewport.renderer.domElement
        container.appendChild(canvas)

        const picker = createPicker(viewport.camera, canvas, () => [viewport.content])

        let frame = 0
        const render = () => {
            frame = requestAnimationFrame(render)
            viewport.controls.update()
            viewport.renderer.render(viewport.scene, viewport.camera)
        }
        frame = requestAnimationFrame(render)

        const observer = new ResizeObserver(() => viewport.resize())
        observer.observe(container)

        const onPointerMove = (event: PointerEvent) => {
            if (pointerDownRef.current) {
                return
            }

            store.getState().setHover(picker.pick(event.clientX, event.clientY))
        }

        const onPointerDown = (event: PointerEvent) => {
            pointerDownRef.current = {x: event.clientX, y: event.clientY}
        }

        const onPointerUp = (event: PointerEvent) => {
            const start = pointerDownRef.current
            pointerDownRef.current = null

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

        const unsubscribe = store.subscribe((state, previous) => {
            if (state.selection !== previous.selection) {
                applySelectionVisuals(viewport, state.selection)
            }

            if (state.style !== previous.style) {
                viewport.setStyle(state.style)
                applySelectionVisuals(viewport, state.selection)
                setFaces(viewport.countFaces())
            }

            if (state.scene !== previous.scene) {
                viewport.updateGeometry(readPlaceholderParameters(state.scene))
                applySelectionVisuals(viewport, state.selection)
                setFaces(viewport.countFaces())
            }
        })

        applySelectionVisuals(viewport, store.getState().selection)
        setFaces(viewport.countFaces())

        return () => {
            cancelAnimationFrame(frame)
            observer.disconnect()
            unsubscribe()

            canvas.removeEventListener('pointermove', onPointerMove)
            canvas.removeEventListener('pointerdown', onPointerDown)
            canvas.removeEventListener('pointerup', onPointerUp)
            canvas.removeEventListener('pointerleave', onPointerLeave)

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
