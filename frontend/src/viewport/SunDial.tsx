import {useRef, useState} from 'react'
import {
    sunDialPosition,
    sunDialToAngles,
    type SceneLighting,
} from '../assets/style/lighting'

interface SunDialProps {
    lighting: SceneLighting
    onChange: (lighting: SceneLighting) => void
}

const DIAL_SIZE = 84
const RADIUS = DIAL_SIZE / 2 - 6

/**
 * A top-down dial for placing the sun.
 *
 * The tree sits in the middle and the sun travels around it. The sun nearer
 * the centre is higher in the sky, which is how the sky looks from the
 * ground.
 */
export function SunDial({lighting, onChange}: SunDialProps) {
    const ref = useRef<SVGSVGElement>(null)
    const [dragging, setDragging] = useState(false)

    const position = sunDialPosition(lighting)
    const centre = DIAL_SIZE / 2

    const updateFromPointer = (clientX: number, clientY: number) => {
        const svg = ref.current
        if (!svg) {
            return
        }

        const rect = svg.getBoundingClientRect()
        const scale = rect.width / DIAL_SIZE

        const x = (clientX - rect.left - centre * scale) / (RADIUS * scale)
        const y = (clientY - rect.top - centre * scale) / (RADIUS * scale)

        const angles = sunDialToAngles(x, y)

        onChange({
            ...lighting,
            azimuth: angles.azimuth,
            elevation: Math.min(Math.max(angles.elevation, 4), 88),
        })
    }

    return (
        <svg
            ref={ref}
            className="sun-dial"
            style={{width: `${DIAL_SIZE / 16}rem`, height: `${DIAL_SIZE / 16}rem`}}
            viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
            role="slider"
            tabIndex={0}
            aria-label="Sun position"
            aria-valuetext={`${Math.round(lighting.azimuth)} degrees around, ${Math.round(
                lighting.elevation,
            )} degrees up`}
            onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                setDragging(true)
                updateFromPointer(event.clientX, event.clientY)
            }}
            onPointerMove={(event) => {
                if (dragging) {
                    updateFromPointer(event.clientX, event.clientY)
                }
            }}
            onPointerUp={(event) => {
                event.currentTarget.releasePointerCapture(event.pointerId)
                setDragging(false)
            }}
            onKeyDown={(event) => {
                const step = event.shiftKey ? 15 : 5

                if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
                    event.preventDefault()
                    onChange({
                        ...lighting,
                        azimuth: (lighting.azimuth - step + 360) % 360,
                        elevation: Math.max(lighting.elevation - step, 4),
                    })
                } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
                    event.preventDefault()
                    onChange({
                        ...lighting,
                        azimuth: (lighting.azimuth + step) % 360,
                        elevation: Math.min(lighting.elevation + step, 88),
                    })
                }
            }}
        >
            <circle
                className="sun-dial__sky"
                cx={centre}
                cy={centre}
                r={RADIUS}
            />
            <circle
                className="sun-dial__ring"
                cx={centre}
                cy={centre}
                r={RADIUS}
            />

            {/* The tree the sun is shining on. */}
            <g className="sun-dial__tree">
                <circle cx={centre} cy={centre - 4} r={6} />
                <line x1={centre} y1={centre - 1} x2={centre} y2={centre + 7} />
            </g>

            <circle
                className="sun-dial__sun"
                cx={centre + position.x * RADIUS}
                cy={centre + position.y * RADIUS}
                r={6}
            />
        </svg>
    )
}
