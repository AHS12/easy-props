import {describe, expect, it} from 'vitest'
import {createSceneFromPreset, DEFAULT_PRESET_ID} from '../scene/initial-scene'
import {
    CURRENT_SCHEMA_VERSION,
    parseProject,
    ProjectFileError,
    serializeProject,
} from './project-document'

const scene = createSceneFromPreset(DEFAULT_PRESET_ID)

const document = (patch: Record<string, unknown> = {}) =>
    JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        generator: 'easy-props',
        createdAt: '2026-10-29T12:00:00.000Z',
        modifiedAt: '2026-10-29T12:34:56.000Z',
        style: 'low-poly',
        scene,
        ...patch,
    })

describe('the project file', () => {
    it('returns the scene it was given', () => {
        const loaded = parseProject(serializeProject({scene, style: 'low-poly'}))

        // Compared as the file sees it: the point is that the same bytes come
        // back, not that the objects share a prototype.
        expect(JSON.parse(JSON.stringify(loaded.scene))).toEqual(
            JSON.parse(JSON.stringify(scene)),
        )
        expect(loaded.style).toBe('low-poly')
    })

    it('keeps every edited parameter', () => {
        const edited = createSceneFromPreset(DEFAULT_PRESET_ID)
        const component = edited.assets[0].components[1]
        const withEdit = {
            ...edited,
            assets: [
                {
                    ...edited.assets[0],
                    components: edited.assets[0].components.map((candidate) =>
                        candidate.id === component.id
                            ? {
                                  ...candidate,
                                  edited: true,
                                  parameters: {...candidate.parameters, bend: 0.42},
                              }
                            : candidate,
                    ),
                },
            ],
        }

        const loaded = parseProject(serializeProject({scene: withEdit, style: 'detailed'}))
        const roundTripped = loaded.scene.assets[0].components.find(
            (candidate) => candidate.id === component.id,
        )

        expect(roundTripped?.edited).toBe(true)
        expect(roundTripped?.parameters.bend).toBe(0.42)
        expect(loaded.style).toBe('detailed')
    })

    it('records when it was saved, keeping the original creation time', () => {
        const text = serializeProject({
            scene,
            style: 'low-poly',
            extras: {createdAt: '2020-01-01T00:00:00.000Z'},
            now: new Date('2026-10-29T09:00:00.000Z'),
        })

        const saved = JSON.parse(text)

        expect(saved.createdAt).toBe('2020-01-01T00:00:00.000Z')
        expect(saved.modifiedAt).toBe('2026-10-29T09:00:00.000Z')
        expect(saved.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
        expect(saved.generator).toBe('easy-props')
    })

    it('keeps when it was made through opening and saving again', () => {
        const loaded = parseProject(document({createdAt: '2025-05-05T05:00:00.000Z'}))
        const saved = JSON.parse(
            serializeProject({scene: loaded.scene, style: loaded.style, extras: loaded.extras, now: new Date('2026-11-04T09:00:00.000Z')}),
        )

        expect(saved.createdAt).toBe('2025-05-05T05:00:00.000Z')
        expect(saved.modifiedAt).toBe('2026-11-04T09:00:00.000Z')
    })

    it('writes back keys it does not understand', () => {
        const text = serializeProject({
            scene,
            style: 'low-poly',
            extras: {camera: {position: [1, 2, 3]}},
        })

        expect(JSON.parse(text).camera).toEqual({position: [1, 2, 3]})
    })

    it('refuses a file from a newer build, and says which', () => {
        expect(() => parseProject(document({schemaVersion: CURRENT_SCHEMA_VERSION + 5}))).toThrow(
            ProjectFileError,
        )

        expect(() => parseProject(document({schemaVersion: 99}))).toThrow(/newer version/)
    })

    it('refuses a file that is not a project at all', () => {
        expect(() => parseProject('not json')).toThrow(ProjectFileError)
        expect(() => parseProject('"a string"')).toThrow(/not an easy-props project/)
        expect(() => parseProject('{}')).toThrow(/no schema version/)
    })

    it('names the part of the file that is wrong', () => {
        expect(() =>
            parseProject(document({scene: {id: 'scene-1', assets: 'nope'}})),
        ).toThrow(/scene\.assets/)
    })

    it('upgrades a version 1 file, which had no slot or edited flag', () => {
        const old = JSON.parse(document({schemaVersion: 1}))
        const legacy = {
            ...old,
            scene: {
                ...old.scene,
                assets: old.scene.assets.map((asset: {components: object[]}) => ({
                    ...asset,
                    components: asset.components.map((component) => {
                        const stripped = {...(component as Record<string, unknown>)}
                        delete stripped.slot
                        delete stripped.edited
                        return stripped
                    }),
                })),
            },
        }

        const loaded = parseProject(JSON.stringify(legacy))
        const component = loaded.scene.assets[0].components[0]

        expect(component.slot).toBeNull()
        expect(component.edited).toBe(false)
    })
})
