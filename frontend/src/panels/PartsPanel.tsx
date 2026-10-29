import {useEffect, useMemo, useState} from 'react'
import {
    CATEGORY_LABELS,
    LIBRARY_CATEGORIES,
    LIBRARY_PARTS,
} from '../assets/library/library'
import {useEditorStore} from '../store/editor-store'
import {buildLibraryThumbnails, getThumbnail} from '../viewport/thumbnailer'

type Category = (typeof LIBRARY_CATEGORIES)[number]

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
    const [closed, setClosed] = useState<ReadonlySet<Category>>(new Set())
    const [thumbnails, setThumbnails] = useState<ReadonlyMap<string, string>>(
        () => new Map(LIBRARY_PARTS.map((part) => [part.id, getThumbnail(part.id) ?? ''])),
    )

    const style = useEditorStore((state) => state.style)
    const addLibraryPart = useEditorStore((state) => state.addLibraryPart)

    const toggleCategory = (category: Category) =>
        setClosed((current) => {
            const next = new Set(current)
            if (next.has(category)) {
                next.delete(category)
            } else {
                next.add(category)
            }

            return next
        })

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

                    // A search opens everything, so a match is never hidden
                    // behind a heading the user collapsed earlier.
                    const open = search.trim() !== '' || !closed.has(category)

                    return (
                        <section className="lib-group" key={category} data-open={open}>
                            <h3 className="lib-group__heading">
                                <button
                                    type="button"
                                    className="lib-group__head"
                                    aria-expanded={open}
                                    onClick={() => toggleCategory(category)}
                                >
                                    <span>{CATEGORY_LABELS[category]}</span>
                                    <span className="lib-group__count">{parts.length}</span>
                                    <span className="lib-group__chevron" aria-hidden="true">
                                        ▼
                                    </span>
                                </button>
                            </h3>

                            {open
                                ? parts.map((part) => {
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
                                                  <span className="lib-row__note">
                                                      {part.attachment}
                                                  </span>
                                              </span>
                                          </button>
                                      )
                                  })
                                : null}
                        </section>
                    )
                })
            )}
        </>
    )
}
