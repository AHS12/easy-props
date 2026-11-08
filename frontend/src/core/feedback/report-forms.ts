/**
 * The questions Report a problem asks: the GitHub issue templates, written out.
 *
 * Every id, label and option here is the template's own, word for word, because
 * GitHub fills a form field only from an exact match and ignores anything else
 * without a word. A test reads the templates and checks this list against them.
 */

export type ReportKind = 'bug' | 'feature' | 'prop'

export interface ReportField {
    /** The template's `id`. */
    readonly id: string
    readonly label: string
    readonly type: 'dropdown' | 'textarea' | 'input'
    readonly required: boolean
    readonly options?: readonly string[]
    readonly description?: string
    readonly placeholder?: string
    /** Filled in by the app and shown under What will be shared, not asked. */
    readonly filledIn?: boolean
}

export interface ReportForm {
    readonly kind: ReportKind
    /** What the choice at the top of the dialog says. */
    readonly choice: string
    /** The template's file in `.github/ISSUE_TEMPLATE`. */
    readonly template: string
    /** The template's title, which the person's own words follow. */
    readonly titlePrefix: string
    readonly fields: readonly ReportField[]
}

export const BUG_ACTIONS = [
    'Installing or opening the app',
    'Browsing the home page or my saved props',
    'Choosing a preset',
    'Shaping a prop with the sliders',
    'Selecting or changing one part of a prop',
    'Using a demo scene or backdrop',
    'Saving or opening a prop',
    'Exporting one prop',
    'Exporting many props at once',
    'Bringing a prop into a game engine',
    'Changing settings or the interface scale',
    'Something else',
] as const

export const SYSTEMS = [
    'Windows 11',
    'Windows 10',
    'Mac with Apple silicon',
    'Mac with Intel',
    'Built from source on another system',
] as const

export const REPORT_FORMS: readonly ReportForm[] = [
    {
        kind: 'bug',
        choice: 'Something’s wrong',
        template: 'bug_report.yml',
        titlePrefix: '[Bug]: ',
        fields: [
            {id: 'action', label: 'What were you doing?', type: 'dropdown', required: true, options: BUG_ACTIONS},
            {id: 'what-happened', label: 'What happened?', type: 'textarea', required: true, description: 'Include what you expected to happen instead.'},
            {
                id: 'steps',
                label: 'How can we make it happen?',
                type: 'textarea',
                required: true,
                placeholder: '1. Open the Red maple preset\n2. Drag Amount of leaves to the end\n3. Choose Export',
            },
            {id: 'frequency', label: 'How often does it happen?', type: 'dropdown', required: true, options: ['Every time', 'Sometimes', 'Only once so far']},
            {id: 'version', label: 'App version', type: 'input', required: true, filledIn: true},
            {id: 'system', label: 'System', type: 'dropdown', required: true, options: SYSTEMS, filledIn: true},
            {
                id: 'engine',
                label: 'Game engine',
                type: 'dropdown',
                required: false,
                options: ['Not about an engine', 'Unreal', 'Godot', 'Unity', 'Blender', 'Another tool'],
                description: 'Only if the problem shows up after exporting.',
            },
            {id: 'prop', label: 'Preset and seed', type: 'input', required: false, filledIn: true},
        ],
    },
    {
        kind: 'feature',
        choice: 'An idea',
        template: 'feature_request.yml',
        titlePrefix: '[Feature]: ',
        fields: [
            {
                id: 'area',
                label: 'Which part of the app is it about?',
                type: 'dropdown',
                required: true,
                options: ['Home page and saved props', 'Shaping props', 'The 3D view and demo scenes', 'Export', 'Engine kits', 'Settings and shortcuts', 'Something else'],
            },
            {
                id: 'problem',
                label: 'What are you trying to do?',
                type: 'textarea',
                required: true,
                description: 'The goal or problem matters more than the solution.',
                placeholder: 'I’m making a forest for my game, and every tree I export...',
            },
            {id: 'idea', label: 'What would you like to happen?', type: 'textarea', required: true},
            {id: 'today', label: 'What do you do today instead?', type: 'textarea', required: false},
        ],
    },
    {
        kind: 'prop',
        choice: 'A new prop',
        template: 'prop_request.yml',
        titlePrefix: '[Prop]: ',
        fields: [
            {
                id: 'kind',
                label: 'What kind of prop is it?',
                type: 'dropdown',
                required: true,
                options: ['Tree', 'Palm', 'Conifer', 'Fantasy tree', 'Bush', 'Fern or plant', 'Grass or flowers', 'Rock or cliff', 'A new kind of prop'],
            },
            {id: 'style', label: 'What style is it?', type: 'dropdown', required: true, options: ['Painted', 'Low-poly', 'Detailed', 'No preference']},
            {
                id: 'description',
                label: 'What should it look like?',
                type: 'textarea',
                required: true,
                description: 'What makes it different from what’s already in the app?',
            },
        ],
    },
]

export const formOf = (kind: ReportKind): ReportForm => REPORT_FORMS.find((form) => form.kind === kind)!
