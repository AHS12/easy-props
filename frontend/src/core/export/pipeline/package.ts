/**
 * The whole export: every level, the collision shapes and the description.
 *
 * Bark takes tens of milliseconds and a prop has several levels, so this yields
 * between steps and reports how far it has got.
 */

import * as THREE from 'three'
import {collisionNodeName, collisionShapes, prismGeometry} from './collision'
import {buildFarCard, farCardMesh, FAR_FACES, type FarCard} from './far'
import {joinMeshes, mergeParts} from './merge'
import {EVEN_REACH, measureWindExtent, type WindExtent} from './wind'
import {yieldIfBusy} from './yield'
import {godotMaterialFiles} from '../engine-kits'
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

const round = (metres: number) => Math.round(metres * 1000) / 1000

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
    const far = settings.far === true && source.farAway?.() === true
    const total = levels + (settings.collision ? 1 : 0) + (far ? 1 : 0)
    const hasWind = settings.wind && source.sways()
    const look = settings.look ?? 'lit'
    const comic = look === 'cel'
    let extent: WindExtent | undefined
    let card: FarCard | null = null
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

            if (source.swaysEvenly?.()) {
                extent = {...extent, reach: EVEN_REACH}
            }
        }

        // Only the full level is seen up close, where a small relief shows its pixels.
        // Larger pictures only where they're seen up close.
        const merged = mergeParts(parts, name, pivot, extent, level === 0, comic, level === 0 ? (settings.pictureSize ?? 512) : 512, settings.setName)

        // Drawn from what ships at full detail, before joining lets go of it.
        if (level === 0 && far) {
            card = await buildFarCard(merged, name, extent)

            if (card) {
                faceCounts.far = FAR_FACES
                const cardMesh = farCardMesh(card, name, comic)
                const cardMap = (cardMesh.material as THREE.MeshStandardMaterial).map

                files.push({name: `${name}_far.glb`, bytes: new Uint8Array(await writeGLB([cardMesh], `${name}_far`)), faces: FAR_FACES})

                // A Comic card's flattened picture is its own, and the writer leaves pictures alone.
                if (cardMap !== card.material.map) {
                    cardMap?.dispose()
                }
                card.material.map?.dispose()
                card.material.normalMap?.dispose()
                card.material.dispose()
            }

            done++
            onProgress?.(done, total)
        }

        const meshes = settings.join ? joinMeshes(merged, name) : merged
        const inlineShapes = settings.join && engine === 'unreal' && meshes.length > 0
        let shapeNodes: NamedMesh[] = []

        // One set of shapes, made once: they stand for every level.
        if (level === 0 && settings.collision) {
            const shapes = collisionShapes(source.collision(), parts)
            // Beside the prop they borrow its material, as one of their own would be one more for an engine to list.
            const material = inlineShapes ? [meshes[0].material].flat()[0] : new THREE.MeshStandardMaterial({name: `${name}_collision`})
            const nodes: NamedMesh[] = shapes.map((shape, index) => ({
                name: collisionNodeName(engine, name, index, inlineShapes ? name : undefined),
                geometry: prismGeometry(shape, pivot),
                material,
            }))

            if (inlineShapes) {
                shapeNodes = nodes
            } else if (nodes.length > 0) {
                files.push({name: `${name}_collision.glb`, bytes: new Uint8Array(await writeGLB(nodes, `${name}_collision`))})
            }

            done++
        }

        const faces = meshes.reduce((sum, mesh) => sum + mesh.faces, 0)
        const fileName = levels > 1 ? `${name}_LOD${level}.glb` : `${name}.glb`

        faceCounts[`LOD${level}`] = faces
        files.push({name: fileName, bytes: new Uint8Array(await writeGLB([...meshes, ...shapeNodes], name)), faces})
        disposeParts(parts)
        done++
        await yieldIfBusy()
    }

    onProgress?.(total, total)

    const asset = {
        format: ASSET_FORMAT_VERSION,
        name,
        engine,
        look,
        faces: faceCounts,
        wind: extent ?? null,
        far: card
            ? {
                width: round(card.frame.reach * 2),
                height: round(card.frame.top - card.frame.bottom),
                pictureSize: card.pictures.size,
            }
            : null,
        ...source.describe(),
    }

    if (settings.materials && engine === 'godot') {
        files.push(...godotMaterialFiles(look))
    }

    files.push({name: `${name}.asset.json`, bytes: new TextEncoder().encode(`${JSON.stringify(asset, null, 4)}\n`)})

    return files.sort((a, b) => a.name.localeCompare(b.name))
}
