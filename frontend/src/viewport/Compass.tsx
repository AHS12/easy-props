/**
 * The navigation compass.
 *
 * Like the gizmo in a 3D package: it turns as the camera orbits, so it always
 * says which way the tree is facing, and clicking an axis looks down it.
 *
 * The three axes are positioned by projecting their world direction into the
 * camera each frame. Letters stay upright, so the balls move but the text
 * never rotates.
 */

import {forwardRef, useImperativeHandle, useRef} from 'react'
import * as THREE from 'three'

export type CompassAxis = 'x' | 'y' | 'z'

export interface CompassHandle {
    /** Re-projects the axes. Called from the viewport's frame loop. */
    update(camera: THREE.Camera): void
}

interface CompassProps {
    /** Looks down the given axis. */
    onSnap(axis: CompassAxis, sign: 1 | -1): void
}

interface AxisSpec {
    readonly axis: CompassAxis
    readonly sign: 1 | -1
    readonly label: string
    readonly direction: readonly [number, number, number]
    readonly colour: string
    /** Only the positive axis carries a letter; the far end is a plain dot. */
    readonly named: boolean
}

const AXES: readonly AxisSpec[] = [
    {axis: 'x', sign: 1, label: 'X', direction: [1, 0, 0], colour: '#e0776a', named: true},
    {axis: 'y', sign: 1, label: 'Y', direction: [0, 1, 0], colour: '#9ed070', named: true},
    {axis: 'z', sign: 1, label: 'Z', direction: [0, 0, 1], colour: '#6f9ee0', named: true},
    {axis: 'x', sign: -1, label: '', direction: [-1, 0, 0], colour: '#e0776a', named: false},
    {axis: 'y', sign: -1, label: '', direction: [0, -1, 0], colour: '#9ed070', named: false},
    {axis: 'z', sign: -1, label: '', direction: [0, 0, -1], colour: '#6f9ee0', named: false},
]

/** How far from the centre an axis ball sits. */
const REACH = 30

export const Compass = forwardRef<CompassHandle, CompassProps>(function Compass(
    {onSnap},
    ref,
) {
    const groups = useRef<(SVGGElement | null)[]>([])
    const lines = useRef<(SVGLineElement | null)[]>([])
    const projected = useRef(new THREE.Vector3())

    useImperativeHandle(ref, () => ({
        update(camera) {
            AXES.forEach((spec, index) => {
                const group = groups.current[index]
                const line = lines.current[index]
                if (!group || !line) {
                    return
                }

                // Into the camera's own space: x is across, y is up on screen,
                // and z is towards the viewer.
                const direction = projected.current
                    .set(...spec.direction)
                    .transformDirection(camera.matrixWorldInverse)

                const x = direction.x * REACH
                const y = -direction.y * REACH

                // An axis pointing at the viewer is the one being looked
                // down, so it is the boldest; one pointing away fades back.
                const facing = (direction.z + 1) / 2

                group.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`)
                group.setAttribute('opacity', (0.34 + facing * 0.66).toFixed(3))

                line.setAttribute('x2', x.toFixed(2))
                line.setAttribute('y2', y.toFixed(2))
                line.setAttribute('opacity', (0.2 + facing * 0.5).toFixed(3))
            })
        },
    }))

    return (
        <div className="compass" data-coach="compass">
            <svg style={{width: '5.25rem', height: '5.25rem'}} viewBox="-42 -42 84 84" aria-hidden="true">
                <circle className="compass__face" r="36" />
                <circle className="compass__ring" r="36" />

                {AXES.map((spec, index) => (
                    <line
                        key={`line-${spec.axis}-${spec.sign}`}
                        ref={(element) => {
                            lines.current[index] = element
                        }}
                        className="compass__line"
                        x1="0"
                        y1="0"
                        stroke={spec.colour}
                        strokeLinecap="round"
                    />
                ))}

                {AXES.map((spec, index) => (
                    <g
                        key={`ball-${spec.axis}-${spec.sign}`}
                        ref={(element) => {
                            groups.current[index] = element
                        }}
                        className="compass__axis"
                        onClick={() => onSnap(spec.axis, spec.sign)}
                    >
                        <title>{`Look along ${spec.sign > 0 ? '+' : '-'}${spec.axis.toUpperCase()}`}</title>
                        {/* Generous target: the drawn ball is small. */}
                        <circle className="compass__hit" r="13" />
                        <circle
                            className="compass__ball"
                            r={spec.named ? 8 : 4.5}
                            fill={spec.colour}
                        />
                        {spec.named ? (
                            <text className="compass__label" x="0" y="0">
                                {spec.label}
                            </text>
                        ) : null}
                    </g>
                ))}

                <circle className="compass__origin" r="2" />
            </svg>
        </div>
    )
})
