/**
 * The whole export: every level, the collision shapes and the description.
 *
 * Bark takes tens of milliseconds and a prop has several levels, so this yields
 * between steps and reports how far it has got.
 */

import * as THREE from 'three'
import {collisionNodeName, collisionShapes, prismGeometry} from './collision'
import {mergeParts} from './merge'
import {measureWindExtent, type WindExtent} from './wind'
import {yieldIfBusy} from './yield'
import {writeGLB, type NamedMesh} from '../glb-exporter'
import {LEVEL_SHARES, type ExportFile, type ExportSettings, type ExportSource} from './types'

export const ASSET_FORMAT_VERSION = 1

/** Thrown when a build is told to stop. Nothing it built is written. */
export class ExportCancelled extends Error {
    constructor() {
        super('The export was cancelled.')
        this.name = 'ExportCancelled'
    }
}

function disposeParts(parts: readonly {part: {geometry: THREE.BufferGeometry}}[]): void {
    for (const {part} of parts) {
        part.geometry.dispose()
    }
}

/** Every file of an export, without writing any of them. */
export async function buildExport(
    source: ExportSource,
    settings: ExportSettings,
    onProgress?: (done: number, total: number) => void,
    signal?: AbortSignal,
): Promise<ExportFile[]> {
    const {name, levels, engine} = settings
    const pivot = source.pivot()
    const files: ExportFile[] = []
    const faceCounts: Record<string, number> = {}
    const total = levels + (settings.collision ? 1 : 0)
    const hasWind = settings.wind && source.sways()
    let extent: WindExtent | undefined
    let done = 0

    for (let level = 0; level < levels; level++) {
        onProgress?.(done, total)

        const parts = await source.buildAtDetail(LEVEL_SHARES[level])

        if (signal?.aborted) {
            disposeParts(parts)
            throw new ExportCancelled()
        }

        await yieldIfBusy()

        // Measured once at full detail, so every level moves alike.
        if (hasWind && level === 0) {
            extent = measureWindExtent(parts, pivot)
        }

        const meshes = mergeParts(parts, name, pivot, extent)

        // One set of shapes, made once: they stand for every level.
        if (level === 0 && settings.collision) {
            const shapes = collisionShapes(source.collision(), parts)
            const material = new THREE.MeshStandardMaterial({name: `${name}_collision`})
            const nodes: NamedMesh[] = shapes.map((shape, index) => ({
                name: collisionNodeName(engine, name, index),
                geometry: prismGeometry(shape, pivot),
                material,
            }))

            if (nodes.length > 0) {
                files.push({name: `${name}_collision.glb`, bytes: new Uint8Array(await writeGLB(nodes, `${name}_collision`))})
            }

            done++
        }

        const faces = meshes.reduce((sum, mesh) => sum + mesh.faces, 0)
        const fileName = levels > 1 ? `${name}_LOD${level}.glb` : `${name}.glb`

        faceCounts[`LOD${level}`] = faces
        files.push({name: fileName, bytes: new Uint8Array(await writeGLB(meshes, name)), faces})
        disposeParts(parts)
        done++
        await yieldIfBusy()
    }

    onProgress?.(total, total)

    const asset = {
        format: ASSET_FORMAT_VERSION,
        name,
        engine,
        faces: faceCounts,
        wind: extent ?? null,
        ...source.describe(),
    }

    files.push({name: `${name}.asset.json`, bytes: new TextEncoder().encode(`${JSON.stringify(asset, null, 4)}\n`)})

    return files.sort((a, b) => a.name.localeCompare(b.name))
}
