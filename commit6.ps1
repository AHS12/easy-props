Set-Location 'K:\Projects\easy-props'
Remove-Item 'shot-home.png','shot-gallery.png','shot-saved.png' -Force -ErrorAction SilentlyContinue
git add -A
@'
A gallery of your trees, as the page the app opens on

Saving used to mean overwriting one file. Every tree replaced the last one,
so a week of work was a single document. The app now holds a collection, and
the first thing it shows is that collection.

The page

Your trees, then the five starting points, on one screen. A saved tree is a
card with a real picture of it, its name, and how long ago it was saved. Click
it and you are editing it. "New tree" and the presets start something new.

It is a page rather than a sidebar tab, and it replaces the viewport rather
than sitting over it, so nothing is hidden behind it. Ctrl+G returns to it
from anywhere; "My trees" and "Keep editing" move between the two.

Save means the tree you are editing

Ctrl+S updates that tree's own entry. Ctrl+Shift+S saves a copy as a new
entry, named "Round canopy 2" and so on, so the collection grows only when
the user asks it to. Ctrl+O and "Save to a file" still exist for handing a
tree to someone else, and both use the same file format, so the two paths
cannot drift apart.

On disk

One JSON per tree under %APPDATA%/easy-props/trees, with a PNG beside it. No
database: a file you can read, copy, sync, and delete by hand, and a corrupt
one costs one tree rather than the collection. Go manages the folder and
still knows nothing about trees; ids are validated as file stems, so an id
like ../evil cannot write outside the library.

The preview

Rendered from the same generators as the viewport, framed to the tree's own
bounds, with one shared WebGL renderer for every thumbnail — a renderer per
card is what crashed the viewport once already.

A bug this uncovered

Wails marshals []byte as base64, while the generated App.d.ts declares
Array<number>. Reading a file therefore decoded an empty array. That means
opening a project file has never actually worked: the tree that appeared was
still the one in memory. Every byte read now goes through one decoder that
accepts both shapes, so opening a file, opening a gallery tree, and showing a
preview all agree with the disk.

187 tests across Go and TypeScript.

Co-authored-by: CommandCodeBot <noreply@commandcode.ai>
'@ | git commit -F -
git log --oneline -3
git status --short
