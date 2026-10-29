import {useEffect, useMemo, useState} from 'react'
import {
    CATEGORY_LABELS,
    LIBRARY_CATEGORIES,
    LIBRARY_PARTS,
} from '../assets/library/library'
import {useEditorStore} from '../store/editor-store'
import {buildLibraryThumbnails, getThumbnail} from '../viewport/thumbnailer'

function PartGlyph() {
    return (
        <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--border-strong)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M12 21v-7" />
            <path d="M12 15c0-4 3-6 6-6 0 4-3 6-6 6z" />
            <path d="M12 17c0-3-2.5-5-5-5 0 3 2.5 5 5 5z" />
        </svg>
    )
}

export function PartsPanel() {
    const [search, setSearch] = useState('')
    const [thumbnails, setThumbnails] = useState<ReadonlyMap<string, string>>(
        () => new Map(LIBRARY_PARTS.map((part) => [part.id, getThumbnail(part.id) ?? ''])),
    )

    const style = useEditorStore((state) => state.style)
    const addLibraryPart = useEditorStore((state) => state.addLibraryPart)

    useEffect(() => {
        let cancelled = false

        // The renders happen off the paint, so the panel appears immediately.
        requestAnimationFrame(() => {
            const built = buildLibraryThumbnails(LIBRARY_PARTS, style)
            if (!cancelled) {
                setThumbnails(new Map(built))
            }
        })

        return () => {
            cancelled = true
        }
    }, [style])

    const filtered = useMemo(() => {
        const needle = search.trim().toLowerCase()

        if (!needle) {
            return LIBRARY_PARTS
        }

        return LIBRARY_PARTS.filter(
            (part) =>
                part.name.toLowerCase().includes(needle) ||
                part.description.toLowerCase().includes(needle),
        )
    }, [search])

    return (
        <>
            <input
                className="search"
                type="search"
                placeholder="Search parts"
                aria-label="Search parts"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
            />

            {filtered.length === 0 ? (
                <div className="empty">
                    <PartGlyph />
                    <h4>Nothing matches that</h4>
                    <p>Try a shorter word, such as "branch" or "leaf".</p>
                </div>
            ) : (
                LIBRARY_CATEGORIES.map((category) => {
                    const parts = filtered.filter((part) => part.category === category)

                    if (parts.length === 0) {
                        return null
                    }

                    return (
                        <section className="lib-group" key={category}>
                            <h3 className="lib-group__title">{CATEGORY_LABELS[category]}</h3>

                            {parts.map((part) => {
                                const thumbnail = thumbnails.get(part.id)

                                return (
                                    <button
                                        key={part.id}
                                        type="button"
                                        className="lib-row"
                                        title={part.description}
                                        onClick={() => addLibraryPart(part)}
                                    >
                                        <span className="lib-row__thumb">
                                            {thumbnail ? (
                                                <img
                                                    className="lib-row__image"
                                                    src={thumbnail}
                                                    alt=""
                                                />
                                            ) : (
                                                <PartGlyph />
                                            )}
                                        </span>

                                        <span className="lib-row__meta">
                                            <span className="lib-row__name">{part.name}</span>
                                            <span className="lib-row__note">{part.attachment}</span>
                                        </span>
                                    </button>
                                )
                            })}
                        </section>
                    )
                })
            )}
        </>
    )
}
