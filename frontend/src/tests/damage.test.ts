import * as THREE from 'three'
import {describe, expect, it} from 'vitest'
import {findComponentGenerator} from '../assets/component-generators'
import {findPropGenerator, generatePropComponents} from '../assets/prop-generators'
import {damageRock} from '../assets/rocks/rock-damage'
import {chunksAtDetail, PLAIN_BELOW} from '../assets/rocks/rock-mesh'
import {planRock} from '../assets/rocks/rock-plan'
import {createSeededRandom} from '../assets/shared/random'
import {getStyleProfile} from '../assets/style/style-profiles'
import {applyPartAction, canBreakPart} from '../assets/trees/painted/edits'
import {planPaintedTree} from '../assets/trees/painted/plan'
import {createWoodField} from '../assets/trees/painted/wood-field'
import type {PaintedTreeParameters} from '../assets/trees/painted/parameters'
import {findPreset} from '../assets/trees/presets'

const STYLE = getStyleProfile('low-poly')

function presetValues(id: string, changes: Record<string, unknown> = {}) {
    const preset = findPreset(id)!

    return {
        values: findPropGenerator(preset.generatorId)!.validate({...preset.parameters, ...changes}).parameters as Record<string, unknown>,
        seed: preset.seed,
        generatorId: preset.generatorId,
    }
}

const tree = (id: string, changes: Record<string, unknown> = {}) => {
    const {values, seed} = presetValues(id, changes)

    return {tree: values as unknown as PaintedTreeParameters, seed}
}

function geometries(id: string, changes: Record<string, unknown> = {}, detail = 0.5): THREE.BufferGeometry[] {
    const {values, seed, generatorId} = presetValues(id, changes)

    return generatePropComponents(generatorId, values, seed, STYLE).flatMap((component) => {
        const generator = findComponentGenerator(component.generatorId)!
        const part = generator.generate(generator.validate(component.parameters).parameters, {random: createSeededRandom(component.seed), seed: component.seed, style: STYLE, detail})

        return part.surface?.proxy ? [] : [part.geometry]
    })
}

const topOf = (parts: THREE.BufferGeometry[]) =>
    Math.max(
        ...parts.map((part) => {
            part.computeBoundingBox()

            return part.boundingBox!.isEmpty() ? -Infinity : part.boundingBox!.max.y
        }),
    )

describe('damage on trees', () => {
    it('leaves an undamaged tree exactly as it was', () => {
        const {tree: values, seed} = tree('oak')
        const plan = planPaintedTree(values, seed)

        expect(plan.cuts).toBeUndefined()
        expect(plan.split).toBeUndefined()
    })

    it('snaps the top off, taking everything above the break with it', () => {
        const whole = planPaintedTree(...Object.values(tree('scots-pine')) as [PaintedTreeParameters, number])
        const {tree: values, seed} = tree('scots-pine', {snapped: 0.5})
        const snapped = planPaintedTree(values, seed)
        const breakY = snapped.cuts![0].point[1]

        expect(snapped.cuts).toHaveLength(1)
        expect(snapped.limbs.length).toBeLessThan(whole.limbs.length)
        expect(snapped.limbs.every((limb) => limb.key.startsWith('r') || limb.points[0][1] < breakY)).toBe(true)
        expect(snapped.clumps.every((clump) => clump.base[1] < breakY)).toBe(true)
        expect(topOf(geometries('scots-pine', {snapped: 0.5}))).toBeLessThan(topOf(geometries('scots-pine')) * 0.75)
    })

    it('takes a palm crown with its top', () => {
        const {tree: values, seed} = tree('date-palm', {snapped: 0.35})

        expect(planPaintedTree(values, seed).clumps).toHaveLength(0)
    })

    it('breaks more limbs as Broken limbs rises, keeping the ones already broken', () => {
        const brokenAt = (share: number) => {
            const {tree: values, seed} = tree('oak', {brokenLimbs: share})

            return new Set(planPaintedTree(values, seed).cuts?.map((cut) => cut.point.join()) ?? [])
        }
        const few = brokenAt(0.3)
        const many = brokenAt(0.8)

        expect(many.size).toBeGreaterThan(few.size)
        expect([...few].every((cut) => many.has(cut))).toBe(true)
    })

    it('drops the leaves that grew past a break', () => {
        const {tree: values, seed} = tree('oak', {brokenLimbs: 1})
        const whole = planPaintedTree(tree('oak').tree, seed)

        expect(planPaintedTree(values, seed).clumps.length).toBeLessThan(whole.clumps.length)
    })

    it('breaks one limb by hand, and only big ones', () => {
        const {tree: values} = tree('oak')
        const limb = {generatorId: 'painted-limb', parameters: {key: 'l1'}}
        const twig = {generatorId: 'painted-limb', parameters: {key: 'l1b0'}}
        const edits = applyPartAction(values.edits, limb, {kind: 'break'})!

        expect(canBreakPart(limb, values.edits)).toBe(true)
        expect(canBreakPart(twig, values.edits)).toBe(false)
        expect(canBreakPart(limb, edits)).toBe(false)
        expect(planPaintedTree({...values, edits}, findPreset('oak')!.seed).cuts).toHaveLength(1)
    })

    it('carves a split into the side of the trunk', () => {
        const {tree: values, seed} = tree('redwood', {split: 1})
        const plan = planPaintedTree(values, seed)
        const split = plan.split!
        const trunk = plan.limbs[0]
        const y = (split.low + split.high) / 2
        const index = Math.round((y / trunk.points[trunk.points.length - 1][1]) * (trunk.points.length - 1))
        const [x, , z] = trunk.points[index]
        const r = trunk.radii[index] * 0.85
        const at = [x + Math.cos(split.azimuth) * r, y, z + Math.sin(split.azimuth) * r] as const
        const whole = createWoodField(plan.limbs, values, seed, () => true)
        const carved = createWoodField(plan.limbs, values, seed, () => true, plan.cuts, split)

        expect(whole.distance(...at)).toBeLessThan(0)
        expect(carved.distance(...at)).toBeGreaterThan(0)
    })

    it.each([
        ['scots-pine', {snapped: 0.5}],
        ['oak', {brokenLimbs: 0.7, split: 0.6}],
        ['oak', {build: 'low-poly', snapped: 0.5}],
        ['date-palm', {snapped: 0.4}],
    ])('builds %s damaged, with nothing broken in the mesh', (id, changes) => {
        for (const part of geometries(id, changes)) {
            expect(Array.from(part.getAttribute('position')?.array ?? []).every(Number.isFinite)).toBe(true)
        }
    })
})

describe('damage on rocks', () => {
    it('cracks a rock into halves a gap apart, and keeps both on a light level', () => {
        const {values, seed} = presetValues('mossy-boulder', {cracks: 1})
        const rock = values as unknown as Parameters<typeof planRock>[0]
        const plan = planRock(rock, seed)
        const cracked = damageRock(plan, {cracks: 1, crumble: 0}, seed)
        const light = chunksAtDetail(cracked, PLAIN_BELOW * 0.5, 1)
        const groups = light.map((chunk) => (chunk as {crack?: number}).crack).filter((crack) => crack !== undefined)

        expect(cracked.chunks.length).toBeGreaterThan(plan.chunks.length)
        for (const group of new Set(groups)) {
            expect(groups.filter((each) => each === group).length).toBeGreaterThanOrEqual(2)
        }
    })

    it('leaves rubble at the foot of a crumbled edge', () => {
        const {values, seed} = presetValues('mossy-boulder')
        const plan = planRock(values as unknown as Parameters<typeof planRock>[0], seed)
        const crumbled = damageRock(plan, {cracks: 0, crumble: 1}, seed)

        expect(crumbled.chunks.length).toBeGreaterThan(plan.chunks.length + 3)
        expect(damageRock(plan, {cracks: 0, crumble: 0}, seed)).toBe(plan)
    })

    it('builds a cracked, crumbled rock with nothing broken in the mesh', () => {
        for (const part of geometries('mossy-boulder', {cracks: 0.8, crumble: 0.8})) {
            expect(part.getAttribute('position').count).toBeGreaterThan(30)
            expect(Array.from(part.getAttribute('position').array).every(Number.isFinite)).toBe(true)
        }
    })
})

describe('damage on cacti', () => {
    it('lays a fallen arm on the ground beside the stem', () => {
        const standing = geometries('saguaro')
        const fallen = geometries('saguaro', {fallenArms: 1})

        expect(Array.from(fallen[0].getAttribute('position').array)).not.toEqual(Array.from(standing[0].getAttribute('position').array))
        fallen[0].computeBoundingBox()
        expect(fallen[0].boundingBox!.min.y).toBeGreaterThan(-0.3)
    })
})
