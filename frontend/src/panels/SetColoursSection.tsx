/**
 * Export as a set: the set's name, the colours its props are matched to, and a small
 * picture of each prop in them, so a birch going brown is seen before it's exported.
 */

import {useEffect, useMemo, useState} from 'react'
import {getStyleProfile, type StyleProfileId} from '../assets/style/style-profiles'
import {choiceScenes, type BatchChoice} from '../core/export/batch-items'
import {afterPaint} from '../core/export/pipeline/yield'
import {colourGroups, inSetColours, usualColours, type ColourGroup, type SetColours} from '../core/export/set-colours'
import {renderTreeThumbnail} from '../core/export/tree-thumbnail'
import type {Scene} from '../core/scene/scene-model'
import {readTree} from '../platform/library'
import {Select} from '../components/controls'
import {Row} from '../components/PropertyRow'

const PREVIEW_SIZE = 72
/** Pictures beyond this many would only slow the panel: enough to see the colours. */
const PREVIEWS = 8

interface SetProp {
    readonly scene: Scene
    readonly style: StyleProfileId
}

/** The set's props, as their first version, read once per choice of props. */
function useSetProps(choices: readonly BatchChoice[], style: StyleProfileId): readonly SetProp[] {
    const [props, setProps] = useState<readonly SetProp[]>([])
    const key = JSON.stringify(choices.map((choice) => (choice.kind === 'versions' ? `versions:${choice.name}:${choice.versions.length}` : `${choice.kind}:${choice.id}`)))

    useEffect(() => {
        let current = true

        Promise.all(choices.map((choice) => choiceScenes(choice, {style, readInSavedProp: readTree}).catch(() => [])))
            .then((found) => current && setProps(found.flat()))
            .catch(() => current && setProps([]))

        return () => {
            current = false
        }
        // The choices are rebuilt every render; what they hold is in the key.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, style])

    return props
}

function Previews({props, colours}: {props: readonly SetProp[]; colours: SetColours}) {
    const [pictures, setPictures] = useState<readonly (string | null)[]>([])

    useEffect(() => {
        let stopped = false

        setPictures([])

        const draw = async () => {
            for (const {scene, style} of props.slice(0, PREVIEWS)) {
                await afterPaint()

                if (stopped) {
                    return
                }

                const url = await renderTreeThumbnail(inSetColours(scene, colours, style), {style: getStyleProfile(style), size: PREVIEW_SIZE})

                if (!stopped) {
                    setPictures((drawn) => [...drawn, url])
                }
            }
        }

        void draw()

        return () => {
            stopped = true
        }
    }, [props, colours])

    return (
        <ul className="set-previews" aria-label="The set in its colours" aria-busy={pictures.length < Math.min(props.length, PREVIEWS)}>
            {props.slice(0, PREVIEWS).map((_, index) => (
                <li key={index} className="set-previews__item">
                    {pictures[index] ? <img src={pictures[index]!} alt="" /> : null}
                </li>
            ))}
        </ul>
    )
}

export function SetColoursSection({
    choices,
    style,
    name,
    onName,
    onSet,
}: {
    choices: readonly BatchChoice[]
    style: StyleProfileId
    name: string
    onName(name: string): void
    /** The set as it now stands, whenever the colours or props change. */
    onSet(groups: readonly ColourGroup[], colours: SetColours): void
}) {
    const props = useSetProps(choices, style)
    const groups = useMemo(() => colourGroups(props.map(({scene}) => scene.assets[0]).filter(Boolean)), [props])
    const [picks, setPicks] = useState<SetColours>({})
    const colours = useMemo(() => {
        const usual = usualColours(groups)

        return Object.fromEntries(Object.entries(usual).map(([id, value]) => [id, picks[id] ?? value])) as SetColours
    }, [groups, picks])

    useEffect(() => onSet(groups, colours), [groups, colours, onSet])

    return (
        <>
            <Row label="Set name" help="The set's folder, and the start of every material's name, so an engine can share them.">
                <input
                    className="field"
                    aria-label="Set name"
                    value={name}
                    maxLength={60}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => onName(event.target.value)}
                />
            </Row>
            {groups.length > 0 ? <p className="dialog__hint">Set colours: every prop below is exported in these. Your saved props stay as they are.</p> : null}
            {groups.map((group) => (
                <Row key={group.id} label={group.label} help={`${group.props} ${group.props === 1 ? 'prop has' : 'props have'} this. It starts on the one most of them use.`}>
                    <Select
                        label={group.label}
                        value={colours[group.id]}
                        onChange={(next) => setPicks((now) => ({...now, [group.id]: next}))}
                        options={group.options.map(({value, label}) => ({value, label}))}
                    />
                </Row>
            ))}
            {props.length > 0 ? <Previews props={props} colours={colours} /> : null}
        </>
    )
}
