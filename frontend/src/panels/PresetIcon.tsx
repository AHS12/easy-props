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
        </svg>
    )
}
