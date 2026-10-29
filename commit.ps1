Set-Location 'K:\Projects\easy-props'

@'
Milestone 3, part two: drag a branch and a root

The trunk has had a draggable spine since milestone 2. A branch and a root
now get one too, so the whole tree can be shaped directly and not just by
moving sliders.

The spine is a parameter, not a mesh edit. A branch stores five points and a
root four, each a fraction along the part plus two offsets, and the geometry
is built from them. Undo, save, and seed determinism all keep working
because nothing about the scene graph changed.

Two layouts, one implementation

A trunk rises along Y, so its offsets are X and Z. A branch and a root reach
along X, because each is built along the axis its transform then points at
whatever it is attached to, so their offsets are Y and Z. `spines.ts` is the
only place that knows the difference: the generators, the handle positions,
and the drag arithmetic all go through it, so each is written once instead
of three times.

The spine moved onto the component

It used to hang off the tree's own parameters, which meant a hand-edited
spine could be silently thrown away by the merge step: a branch that had
been reshaped kept its old shape and lost the drag. Storing the spine beside
the other parameters gives it the same `edited` protection as everything
else, and removes the special case entirely.

Controls and handles do not fight

Bend, Curl, and Drop rebuild the default spine; dragging replaces it. So a
slider is never dead after a drag. The trunk keeps its lean direction and
wobble as parameters, so changing its Bend re-derives the spine around the
lean the seed chose instead of snapping to a straight line.

Handles are picked on screen, not by raycasting

The drag kept orbiting the camera instead of grabbing a handle: a raycast
against a sphere that is only six pixels across misses more often than it
hits. Handles are screen-sized helpers, so they are now picked the way they
are drawn, by the nearest within 14 pixels. That also fails safe: with no
handle nearby the drag orbits, which is what the user meant.

A drag moves a point across its part's axis only, since those are the only
two numbers stored. The drag plane is therefore the one the axis is normal
to, so the handle lands exactly under the pointer rather than lagging it.
The trunk's plane is horizontal; a limb's turns with the limb.

Also fixed: the trunk's own Bend control did nothing at all, because the
stored spine always won and the schema fell back to a hard-coded curve.

119 tests, twenty-seven of them new: the layouts, the default curves, the
pointer round trip with a twist, the drag plane for each part, a library
part getting a spine when it is validated, a control rebuilding the spine
while an unrelated one leaves it alone, and a dragged spine surviving a
rebuild. Checked in the built app: a branch tip bends without moving the
other points, a root grows handles, and one Ctrl+Z reverses the whole drag.

Co-authored-by: CommandCodeBot <noreply@commandcode.ai>
'@ | git commit -F -
