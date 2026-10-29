Set-Location 'K:\Projects\easy-props'
git add -A
@'
Save, open, and export

The tree can leave the app now, and come back.

The project file

Versioned JSON: schema version, generator, timestamps, the style, and the
scene graph. Parameters are stored exactly as the generators define them, so
every edited value survives a round trip.

Loading validates the whole document with Zod before anything touches the
session, and only then replaces it. A file that is not a project, a file from
a newer build, or a file with a broken field each fails with a sentence that
names what is wrong. A failed load cannot damage the work in progress,
because nothing is set until the parse succeeds.

Version 1 did not record which generator slot a part came from, or whether
the user had changed it. Both were implied by the code of the day. There is a
migration for that, and a chain of them, so the next version bump has
somewhere to go.

Keys this build does not understand are kept on load and written back on
save, so opening a file in an older build does not quietly delete what a
newer one added.

GLB export

An export builds its own scene from the graph and throws it away again: one
group per component, named `trunk_cmp-1`, with the component's transform on
the group rather than baked into the vertices. Object names are readable in
Blender.

Materials are fresh instances with the viewport's own colours, so the file
matches what the user saw, and everything the exporter created is disposed
afterwards, in a finally, so a failed export leaks nothing. Geometry with a
non-finite coordinate is dropped instead of written: one NaN vertex makes a
file unreadable in most viewers.

Every preset is exported and loaded back with GLTFLoader in the tests, and
the positions and normals are checked for finiteness.

The boundary

Go gained exactly four things: two native dialogs and reading and writing
bytes. It does not parse, validate, or know what a tree is, so every error
message reaching the user is written in TypeScript, in the UI's voice. A
cancel is not an error.

The frontend talks to the bindings when it is in the desktop shell and falls
back to a file picker and a download in a browser, so `pnpm dev` still works.

Save project and Export are live, and Ctrl+S, Ctrl+Shift+S, Ctrl+O, and
Ctrl+E are in the palette and the shortcut sheet.

187 tests across Go and TypeScript.

Co-authored-by: CommandCodeBot <noreply@commandcode.ai>
'@ | git commit -F -
git log --oneline -1
