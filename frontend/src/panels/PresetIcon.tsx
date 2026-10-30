/**
 * Preset icons.
 *
 * A preset card shows the shape of its tree rather than a render of it. A
 * render of every preset costs a WebGL context each, and the icons read
 * more clearly at a glance anyway: the silhouette is the point.
 */

const BARK = 'var(--thumb-bark)'
const LEAF = 'var(--thumb-leaf)'
const LEAF_DARK = 'var(--thumb-leaf-dark)'

interface PresetIconProps {
    presetId: string
}

export function PresetIcon({presetId}: PresetIconProps) {
    return (
        <svg
            width="100%"
            height="100%"
            viewBox="0 0 48 48"
            fill="none"
            aria-hidden="true"
            style={{display: 'block'}}
        >
            {presetId === 'round-canopy' ? (
                <>
                    <path d="M21 44c0-8 0-14 1-20h4c1 6 1 12 1 20z" fill={BARK} />
                    <circle cx="24" cy="16" r="13" fill={LEAF} />
                    <path d="M24 3a13 13 0 0 0-11 20 11 11 0 0 1 11-20z" fill={LEAF_DARK} />
                </>
            ) : null}

            {presetId === 'wide-canopy' ? (
                <>
                    <path d="M22 44c0-6 0-11 1-16h3c1 5 1 10 1 16z" fill={BARK} />
                    <ellipse cx="24" cy="20" rx="19" ry="10" fill={LEAF} />
                    <path d="M5 20a19 10 0 0 1 38 0 19 10 0 0 0-38 0z" fill={LEAF_DARK} />
                </>
            ) : null}

            {presetId === 'tall-narrow' ? (
                <>
                    <path d="M22 44c0-9 0-16 1-22h3c1 6 1 13 1 22z" fill={BARK} />
                    <ellipse cx="24" cy="13" rx="9" ry="13" fill={LEAF} />
                    <path d="M24 0a9 13 0 0 0-7 20 7 13 0 0 1 7-20z" fill={LEAF_DARK} />
                </>
            ) : null}

            {presetId === 'twisted-fantasy' ? (
                <>
                    <path
                        d="M26 44c-4-6 2-9-1-14s3-8 1-13l-4 1 3 5c-2 5 3 7 1 12s1 7 3 9z"
                        fill={BARK}
                    />
                    <circle cx="30" cy="11" r="7" fill={LEAF} />
                    <circle cx="18" cy="15" r="5" fill={LEAF_DARK} />
                </>
            ) : null}

            {presetId === 'exposed-root-ancient' ? (
                <>
                    <path d="M19 44c0-8 1-14 2-19h7c1 5 2 11 2 19z" fill={BARK} />
                    <path
                        d="M19 44c-4 1-7-1-10-3m12 3c4 2 8 0 11 2m-9-2c-1 2-3 3-5 3"
                        stroke={BARK}
                        strokeWidth="2"
                        strokeLinecap="round"
                    />
                    <ellipse cx="23" cy="18" rx="18" ry="9" fill={LEAF} />
                    <path d="M5 18a18 9 0 0 1 36 0 18 9 0 0 0-36 0z" fill={LEAF_DARK} />
                </>
            ) : null}

            {presetId === 'coconut-palm' ? (
                <>
                    <path d="M21 44c0-9 2-16 6-22l3 2c-4 5-5 12-5 20z" fill={BARK} />
                    <g stroke={LEAF} strokeWidth="2" strokeLinecap="round">
                        <path d="M28 23c-3-6-7-10-12-12" />
                        <path d="M29 23c3-6 7-10 12-12" />
                        <path d="M28 22c-1-5-2-9-3-13" />
                        <path d="M29 22c1-5 2-9 3-13" />
                    </g>
                    <g stroke={LEAF_DARK} strokeWidth="2" strokeLinecap="round">
                        <path d="M28 24c-5 1-10 4-13 7" />
                        <path d="M29 24c5 1 10 4 13 7" />
                    </g>
                    <circle cx="26" cy="26.5" r="2.2" fill={BARK} />
                    <circle cx="31" cy="27" r="1.8" fill={BARK} />
                </>
            ) : null}

            {presetId === 'tropical-palm' ? (
                <>
                    <path d="M21 44c0-7 1-12 2-16h4c1 4 2 9 2 16z" fill={BARK} />
                    <g stroke={LEAF} strokeWidth="2" strokeLinecap="round">
                        <path d="M24 28c-3-6-6-10-11-12" />
                        <path d="M26 28c3-6 6-10 11-12" />
                        <path d="M25 27c-1-6 0-11 1-16" />
                        <path d="M24 29c-5-2-11-2-15 1" />
                        <path d="M26 29c5-2 11-2 15 1" />
                    </g>
                    <g stroke={LEAF_DARK} strokeWidth="2" strokeLinecap="round">
                        <path d="M24 30c-4 3-8 6-11 10" />
                        <path d="M26 30c4 3 8 6 11 10" />
                    </g>
                </>
            ) : null}
        </svg>
    )
}
