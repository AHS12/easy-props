# Changelog

What's new in each version of easy-props.

## 0.2.5 (November 2, 2026)

**Get a prop back**

- Click the seed in the status bar to type or paste one, or copy the one you're using. Use a
  seed and Copy seed are in the Prop menu too.

**Safer exports**

- Export now asks before replacing files already in its folder, which your game may be using.
  Tick Don't ask again if you replace them often, and turn the question back on in Settings.
- After an export, Show the files opens the folder. Export many has it too, and saving an
  engine kit now says where it went.

**Smoother to use**

- Starting a new prop no longer says Unsaved before you've changed anything, and asks first if
  you have unsaved work.
- The app now opens at the size and place you left it, and shows resize arrows at the window's
  edges.
- On the home page, the command palette now suggests what you can do there.

**Updates**

- The app now looks for updates once a week when it opens, and tells you when a new version is
  out. Before, it only looked when you asked. It never downloads anything by itself, and Check
  for updates automatically in Settings turns it off.

**Cleaner wood for your game**

- Round canopy and the palms no longer show holes at the ends of their trunks, branches and
  roots in an engine that draws one side of each face.
- Tree wood has fewer wasted faces, most of all at the lighter detail levels, and the last few
  faces that pointed inwards are fixed.

## 0.2.2 (November 2, 2026)

**Bark that follows the wood**

- Bark now runs along each branch and root, and its marks get smaller as the wood gets
  thinner, instead of being the same size all over the tree.
- Pattern size is now called Bark size. It sets how big the marks on the wood are, including
  brush strokes, and it also works on Plain bark.
- Presets no longer start with the Plates bark pattern. You can still choose it, and trees
  you saved keep the pattern they have. Old oak now has smooth, gently peeling bark.

**Roots and trunks that hold together**

- Roots now run along the ground and sink into it, instead of ending in a blunt stub.
- The wood now has a closed base below the ground, so a tree placed a little too high no
  longer shows a jagged, open edge.
- Fixed small holes in the wood, which showed most when a bark pattern was fine and deep.

Trees you saved earlier keep their shape, but the marks on their bark will sit differently,
and a tree saved with its own pattern size will have marks of a different size.

## 0.2.1 (November 1, 2026)

**Update from inside the app**

- Check for updates is new in the Help menu and on the About page. On Windows, the app can
  download a new version, close, update itself and open again. It asks about unsaved work
  first.
- On a Mac, it tells you when a new version is out and opens the download page.
- The app only looks for updates when you ask it to.
- On Windows, installing a new version no longer brings back a desktop shortcut you removed.

## 0.2.0 (November 1, 2026)

**Tree wood that looks crisp**

- Tree wood now has sharp, carved detail that catches the light, instead of looking
  blurry beside the leaves. It adds no extra faces.
- Brush strokes is a new slider that sets how strongly painted strokes show on the wood.
  Even at 0, the carved detail stays.
- Each choice in Bark pattern now has its own carving and paint.
- Thin branches and twigs now look right. They used to be lit wrongly, with a hard line
  where they left the thicker wood.

**Ready for your game engine**

- Join parts is a new export choice for every engine. It makes wood and leaves one
  object, for placing many at once.
- The Unreal kit now has a setup script that brings in your exported props and gives
  them shared wind materials.
- In Unreal, trees in a forest now sway at different times, not all together.

**Smoother to use**

- Preset pictures now come with the app, so the home page and the editor no longer stall
  while they draw. The Clear pictures button in Settings is gone, as it's no longer needed.
- The home page now shows the version number beside the app's name.

## 0.1.6 (November 1, 2026)

- Tree roots now end in rounded tips, instead of thin dark spikes lying on the ground.
- About in Settings now shows who makes the app, with a link to the project on GitHub.

## 0.1.5 (November 1, 2026)

**New props that look the part**

- Rocks are rebuilt from the ground up. They now have flat, chiselled faces, chipped
  corners and moss on top. Rocks you saved earlier still open.
- Grass now grows as real blades gathered into natural clumps.
- Bushes are full, rounded domes of leaves, and you can't see through them to the
  inside. There are also airy bushes with open branches, for when you want to see in.
- Flowers are rebuilt too, as daisies, cups, spikes and plumes.

**See your prop in a real place**

- Two demo scenes, Meadow and Grove, stand your prop in a finished outdoor landscape.
  Grove adds trees. Pick one from the Scene menu above the view.
- Studio with sky is a new bright backdrop, and it's now what the editor starts with.

**Easier to learn**

- The home page now has its own short tour, separate from the editor's.
- Tours now start on the right step and fit your interface size.
- This list now opens by itself after an update. You can turn that off in Settings, and
  find it any time under Help.

**Interface scale that works**

- Dropdowns, menus and tooltips now open in the right place at every interface scale.
- Dragging a panel edge follows your pointer, the 3D view stays sharp at larger sizes,
  and the panels and toolbar now fit the window.

**Smoother on slower computers**

- Opening a prop now shows a loading screen with a progress bar, instead of the app
  seeming to freeze. The same screen appears the first time you open a demo scene.
- Export now shows its progress when it updates the files after you change a choice,
  and tells you when it's saving them.

## 0.1.0 (October 31, 2026)

The first release.

- Make trees, palms, conifers, fantasy trees, bushes, ferns, grass, flowers, boulders,
  stones and cliffs, starting from a library of presets.
- Shape a prop with plain sliders and see it change as you drag. Click a branch or a
  leaf clump to change just that part, and undo anything.
- Save your props in a gallery on the home page. If the app closes unexpectedly, your
  work is still there when you come back.
- Export for your game, with lighter versions for far away and simple shapes for
  collisions. The app also warns you if a prop has too many faces for your target.
- Trees and plants can move in the wind in your engine, with ready-made kits for
  Godot and Unreal.
- Export many props at once, including random variations.
- Choose your theme, interface size, camera controls and keyboard shortcuts, and find
  any command quickly with the command palette.
- Installers for Windows and Mac.
