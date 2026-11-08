/**
 * What the two tours say, and where a tour's card goes.
 *
 * Each page has its own tour, because each has its own things to point at. Written
 * for someone who has never made a 3D asset: one idea per step, what it is for
 * before how to use it, and no word they would have to look up.
 */

export type TourPage = 'gallery' | 'editor'

export type TourSide = 'right' | 'left' | 'below' | 'above' | 'over'

export interface TourStep {
    /** The `data-coach` attribute of the element being pointed at. Left out, the step stands alone. */
    readonly target?: string
    readonly title: string
    readonly text: string
    /** Something to try, shown apart from the explanation. */
    readonly tryIt?: string
    readonly side: TourSide
    /** Skipped when there is nothing to point at, as when no prop has been saved yet. */
    readonly optional?: boolean
}

export const TOUR_NAMES: Readonly<Record<TourPage, string>> = {
    gallery: 'Getting started',
    editor: 'The editor',
}

export const TOUR_STEPS: Readonly<Record<TourPage, readonly TourStep[]>> = {
    gallery: [
        {
            title: 'Welcome to easy-props',
            text: 'This makes props for your game: trees, palms, bushes, flowers, grass, cacti and rocks, painted or low-poly. Every prop takes three steps. Pick one, shape it, and export it to your game engine. You do not need any 3D experience.',
            side: 'over',
        },
        {
            target: 'gallery-kinds',
            title: 'Choose what to make',
            text: 'Every kind of prop has a tab. Pick one to see its presets, and use the chips under the tabs to narrow them down.',
            side: 'below',
        },
        {
            target: 'gallery-search',
            title: 'Or search for it',
            text: 'Type a name, such as cherry or cactus, to look through every preset of every kind at once.',
            side: 'below',
        },
        {
            target: 'gallery-presets',
            title: 'Start from a preset',
            text: 'A preset is a finished prop you can change. Nothing you do to it changes the preset, so pick whichever looks closest to what you want.',
            tryIt: 'After this tour, click any picture to open it.',
            side: 'below',
        },
        {
            target: 'gallery-draft',
            title: 'Unsaved work comes back',
            text: 'If the app closes before you save, your work waits here. Pick it up or let it go.',
            side: 'below',
            optional: true,
        },
        {
            target: 'gallery-recent',
            title: 'Your saved props',
            text: 'What you saved last appears here. Click one to carry on with it. All your props has every one, with its details.',
            side: 'below',
            optional: true,
        },
        {
            target: 'search',
            title: 'Find anything',
            text: 'Press Ctrl+K to search for any command or setting, here or in the editor. You can see this tour again from Help, Show the tour.',
            side: 'below',
        },
    ],
    editor: [
        {
            target: 'viewport',
            title: 'This is your prop',
            text: 'It is the real thing, the same as what your game will get. Drag to turn around it and scroll to zoom. On a tree, click a branch or a clump of leaves to change only that part.',
            side: 'over',
        },
        {
            target: 'details',
            title: 'Shape it here',
            text: 'Every change shows straight away, so just try things. Rest on a name to learn what it does, click a number to type one, and press Ctrl+Z to undo.',
            tryIt: 'Surprise me, at the top, makes a new variation.',
            side: 'left',
        },
        {
            target: 'presets',
            title: 'Try another starting point',
            text: 'Clicking a preset here replaces what you are working on. Ctrl+Z brings it back.',
            side: 'right',
        },
        {
            target: 'style',
            title: 'Normal or low-poly',
            text: 'Switch the whole prop to low-poly: big flat faces, each one colour, for games with a faceted look. It is the same prop, so your changes carry over. Press 1 for Low-poly and 2 for Normal.',
            side: 'below',
            optional: true,
        },
        {
            target: 'looks',
            title: 'Cartoon and Comic',
            text: 'This menu changes how the view is lit. Cartoon shows soft bands of light and faint lines, and Comic shows flat colours with bold ink lines, as a game with toon shading would. Export can match either look.',
            side: 'below',
        },
        {
            target: 'scene',
            title: 'See it in a real place',
            text: 'The tree button changes what is around your prop. Work in a plain studio, with or without a sky, or stand it in the Meadow or Grove demo, among grass, rocks, bushes and trees made here.',
            side: 'below',
        },
        {
            target: 'status',
            title: 'Always a next step',
            text: 'The left of this bar says what you can do right now. The right shows how many faces your prop has against its budget, which is how heavy it is for a game.',
            side: 'above',
        },
        {
            target: 'save',
            title: 'Keep it',
            text: 'Save adds it to your props on the home page, so you can come back and change it. The icon at the far left of this bar takes you home.',
            side: 'below',
        },
        {
            target: 'export',
            title: 'Take it to your game',
            text: 'Export prepares it for Unreal, Godot or Blender, with lighter versions for far away, collision and wind included. Choose a Look there to match Cartoon or Comic. You can see this tour again from Help, Show the tour.',
            side: 'below',
        },
    ],
}

/** The steps that have something to point at, or do not need it. */
export function availableSteps(steps: readonly TourStep[], exists: (target: string) => boolean): readonly TourStep[] {
    return steps.filter((step) => !step.optional || (step.target !== undefined && exists(step.target)))
}

export interface Box {
    readonly left: number
    readonly top: number
    readonly width: number
    readonly height: number
}

export interface CardPlace {
    readonly left: number
    readonly top: number
    /** The side the card ended up on, which is not always the one asked for. */
    readonly side: TourSide
    /** How far along the card's edge its pointer sits. */
    readonly arrow: number
}

const GAP = 14
const MARGIN = 12
const ARROW_INSET = 22

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, Math.max(low, high)))

/** Where a card goes. It stays on screen, moving to the other side of its target when it has to. */
export function placeCard(side: TourSide, target: Box | null, screen: {width: number; height: number}, card: {width: number; height: number}): CardPlace {
    const middle = {
        left: (screen.width - card.width) / 2,
        top: (screen.height - card.height) / 2,
    }
    const inside = (left: number, top: number) => ({
        left: clamp(left, MARGIN, screen.width - card.width - MARGIN),
        top: clamp(top, MARGIN, screen.height - card.height - MARGIN),
    })

    if (!target) {
        return {...inside(middle.left, middle.top), side: 'over', arrow: 0}
    }

    if (side === 'over') {
        return {
            ...inside(target.left + (target.width - card.width) / 2, target.top + (target.height - card.height) / 2),
            side: 'over',
            arrow: 0,
        }
    }

    const room: Readonly<Record<Exclude<TourSide, 'over'>, number>> = {
        right: screen.width - (target.left + target.width) - GAP - MARGIN - card.width,
        left: target.left - GAP - MARGIN - card.width,
        below: screen.height - (target.top + target.height) - GAP - MARGIN - card.height,
        above: target.top - GAP - MARGIN - card.height,
    }
    const opposite = {right: 'left', left: 'right', below: 'above', above: 'below'} as const
    const chosen = room[side] >= 0 || room[opposite[side]] < 0 ? side : opposite[side]
    const targetMiddleX = target.left + target.width / 2
    const targetMiddleY = target.top + target.height / 2

    if (chosen === 'right' || chosen === 'left') {
        const {left, top} = inside(chosen === 'right' ? target.left + target.width + GAP : target.left - GAP - card.width, targetMiddleY - card.height / 2)

        return {left, top, side: chosen, arrow: clamp(targetMiddleY - top, ARROW_INSET, card.height - ARROW_INSET)}
    }

    const {left, top} = inside(targetMiddleX - card.width / 2, chosen === 'below' ? target.top + target.height + GAP : target.top - GAP - card.height)

    return {left, top, side: chosen, arrow: clamp(targetMiddleX - left, ARROW_INSET, card.width - ARROW_INSET)}
}
