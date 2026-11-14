# Changelog

What's new in each version of easy-props.

## 0.4.6 (November 14, 2026)

**A new foundation**

- easy-props now runs on a newer version of the toolkit behind its window, file dialogs and
  updates. Everything should look and work just as it did, and it makes room for things
  like opening a prop by double-clicking its file.
- On a Mac, easy-props now needs macOS 12 Monterey or later.

## 0.4.5 (November 12, 2026)

**Rocks look like stone**

- Normal rocks no longer look like cut gems. Light rolls over each rock like a pebble, while
  the faces and the outline stay crisp.
- Edges are wider and softer, and the colour runs across the whole rock, so faces no longer
  change colour at every edge. Moss fades in softly and creeps over edges, in calmer greens.
- Worn hollows and faint bands of stone are new options, and the default stone is a warm grey.
- Chunks of a boulder sit closer together and read as one stone, with a heavy dark band at the
  foot. Small stones can be scattered round the foot with Rubble.
- Cliffs stack in courses with a flat ledge on top, and outcrops and cliffs can lean out over
  their feet with Overhang.
- New rocks: Round boulder, Overhang, Cracked slab, Mossy rubble and Riverbank stones.
- Lichen adds small pale patches to bare stone, with no extra faces.
- Rocks you saved before these changes look exactly as they did.

**Trees and fruit**

- Fruit hangs from the leaves on a short stalk, and no longer floats. Each kind has its own
  shape: balls, pears, cherries, grapes, dates, banana hands and pine cones.
- A Hanging slider lowers fruit from snug to dangling.
- New fruit trees: Pear, Cherry, Fig, Pomegranate and Cone pine. Festive fir carries baubles.
- Leaves come in Round, Lobed, Feathery and Needles styles. Broad trees carry real drooping
  sprays of leaves, and there is a new Mango tree.
- Presets wear the leaves of their own species.

**Bushes and flowers**

- Bushes have leaf styles and five kinds of flower. Flowers sit on top of the bush, where the
  light is.
- Six new bushes: Box hedge, Holly, Juniper, Laurel, Hydrangea and Heather.
- Flowers have a choice of leaves: Grass-like, Straps, Up the stem, Broad at the foot and
  Feathery.

**Damage and age**

- Trees can be snapped at the top, with broken limbs or a split trunk. Rocks can be cracked
  and crumbled at one edge, with the pieces lying at their foot.
- Pieces from a tree: a stump, a fallen log, a fallen branch and leaf litter.

**Weather and detail**

- Every prop can have snow, wet, and moss on one side.
- Rocks carry fine grain up close.
- Truer bark on 21 tree presets, and cleaner branch joins.
- Tilt the ground in the view to check a prop on a slope.

**Export**

- Cut ends, Picture size and Export as a set are new in export, and a Godot 4.7 import fix
  keeps the colours easy-props paints on props.

## 0.4.2 (November 8, 2026)

**My presets**

- Save any prop as your own preset with Save as my preset…, from the arrow beside Save. Your
  presets come first on Home and in the preset list, and picking one starts a new prop from it,
  just like the app's own presets.
- Edit one of your presets, rename it or take it off My presets from its tile. Your props marks
  them, and shows only them with the My presets button.

**Resize parts**

- Press S, or use the new Resize button beside Turn, then drag the ring out to grow a branch,
  root or leaf clump and in to shrink it. Hold Shift for steps of 10%.
- The branches and leaves on a branch grow and shrink with it. Branches and roots also have a
  Size slider.

**Save a picture**

- Save a picture… saves a PNG of the prop as the view shows it: the same angle, look and lines.
  Choose 1,024 or 2,048 pixels, and a see-through background or the one in the view.

**Report a problem**

- Report a problem…, in the Help menu, asks a few questions and opens a GitHub issue with them
  filled in, along with your app version, system and the prop you have open. You send it from
  GitHub yourself, and the app sends nothing.

**Smaller changes**

- Save now has an arrow beside it, with Save a copy…, Save as my preset…, Save to a file… and
  Save a picture….
- Home picks a kind of prop from a row of tabs, so the only pictures there are presets you can
  start from.
- The Favourites group, which couldn't be changed, is gone. Blossom tree is now under Blossom &
  fruit, and Spring and Autumn tree under Broadleaf.

**Fixed**

- Your props opens faster when you have saved palms, flowers, grass or cacti.

## 0.4.0 (November 6, 2026)

**Cartoon and Comic looks**

- Two new views in the Lit menu show how a prop will look under a game's toon shading. Cartoon
  is soft, with gentle bands of light and faint lines. Comic has flat colours, hard shadows and
  bold ink lines round whole shapes, so a leaf crown is outlined as one shape, not leaf by leaf.
- Pick thin, medium or bold lines in Settings, under Viewport, Cartoon lines.
- The Meadow and Grove demos around your prop follow the look too.
- Export and Export many have a Look choice: Lit, Cartoon or Comic. A Comic export cuts each
  part's colours to a few flat tones, so the files match what you see.
- For Godot, a Materials switch writes matching Cartoon or Comic materials beside the exported
  files, wind included, along with an outline effect. The prop's folder is ready to use.

**Low-poly style**

- Every kind of prop can now be made low-poly: big flat faces, each one colour. Switch with the
  Normal and Low-poly buttons beside the Lit menu, or with keys 1 and 2.
- It is the same prop in another style, so its seed, settings and dragged parts carry over.

**A new Home**

- Home shows every kind of prop as a card with a picture: trees, palms, bushes, flowers, grass,
  cacti and rocks. Cacti, flowers and grass no longer hide under Bush.
- Chips under the cards narrow a kind down, such as Conifers or Fantasy under Trees.
- Search every preset from Home, across all kinds at once.
- The File menu has a New entry for each kind, and Your props sorts your props into the same
  kinds, showing only the kinds you have made.

**Fixed**

- Zooming out no longer greys the prop itself with haze.

## 0.3.8 (November 4, 2026)

**Your props**

- Your saved props have a page of their own. Open it with All your props on Home, from the File
  menu, or with Ctrl+G. Pick a prop to see it larger beside the list, with its kind, the preset
  it started from, when it was made and last changed, its seed and its size.
- Open, export, copy, rename or remove a prop right there, without opening it first, or show its
  file in its folder.
- Search by name or by the preset a prop started from, show only trees, rocks or bushes, and sort
  by last changed, name or date made.
- Tick several props with Ctrl-click or Shift-click to export or remove them together. The arrow
  keys move between props, Enter opens one, F2 renames it and Delete removes it.
- Home now shows one row of the props you changed last, so it stays a place to start.
- A saved prop without a picture gets one drawn for it.

**Recently removed**

- Removing a prop no longer deletes it. It goes to Recently removed for 30 days, and the message
  that says so has an Undo button.
- Put props back, or remove them for good, at the end of Your props or in Settings, under
  Recently removed. Search for "bin" to get there quickly.

**Back up your props**

- Back up every saved prop, with its picture and your palettes, to a single file you can keep
  anywhere: Settings, Backup.
- Restore from a backup on any computer. You see what's in it first, and nothing replaces a prop
  you have: one that's different comes in as a second copy, named "(from backup)".
- Choose a folder, such as a synced folder or an external drive, and a dated backup goes there
  by itself once a day when something changed. Older ones are cleared away, and nothing else in
  the folder is touched.
- Cloud backup to storage you already have: Cloudflare R2, Backblaze B2, Amazon S3, Wasabi,
  DigitalOcean Spaces, MinIO, or anything else that speaks the S3 API. Only what changed goes
  up, a minute after you save, when the app starts and when it closes. Your keys are kept in
  your system's keychain.
- Restore from the cloud brings back props removed since, if you want them, and Your props shows
  whether each prop is backed up.

**Fixed**

- Saving a prop again forgot when it was first made. It now keeps the date.

## 0.3.5 (November 3, 2026)

**Your colours**

- A new colour picker, the same in every colour row and in Settings. Drag for any colour, or type
  or paste a colour code such as #4e7d3e, and copy one back out. You can also paste a code
  straight onto a colour row without opening it.
- Recent shows the last colours you picked, and My colours keeps a row of your own. Paste a
  whole list of codes from a palette website to add them all at once.
- Rocks, bushes, grass, flowers and cacti now have My own colours too, at the end of each colour
  list. It starts from the colours that were showing, so nothing jumps.

**Palettes for your game**

- Save a set of colours as a palette with a name, such as one for each game you make. Then pick
  it from the Palette menu of any other prop of that kind, and it comes out in the same colours.
  The menu has a search, so you can find it by name.
- See and change your palettes in Settings, under Palettes: rename them, change any colour,
  duplicate one, start a new one, or remove it.

**Fixed**

- Restore to preset on a saved prop went back to an old-style tree. It now goes back to the
  preset the prop came from.
- A saved rock, bush, grass, flower or cactus couldn't be opened again. It now opens.

## 0.3.3 (November 3, 2026)

**Far away**

- Export can now write a far-away card for trees, bushes and tall cacti: a flat picture of the
  prop, only 8 faces, for your engine to show once the prop is far off. A forest of thousands of
  trees then costs almost nothing in the distance. It's on by default, and you can turn it off
  in Export, Export many and Settings.
- The card works in any engine and in Blender with nothing to set up, and sways with the wind
  like the prop does. It looks flat from straight above, so it suits games where the camera
  stays near the ground.
- Pick Far away in the detail level menu to see the card in the view before it reaches your
  game, from any side and in the wind.

## 0.3.2 (November 3, 2026)

**Cacti**

- A new kind of prop: cacti. Grow a tall column with arms, a round barrel, or flat pads that
  grow from each other, then set its ridges, spines and flowers, in one of six cactus colours.
- Six new ones to start from, under Cacti on the Bush tab: Saguaro, Young saguaro, Organ pipe,
  Golden barrel, Flowering barrel and Prickly pear.

**Shape your trees**

- Branching trees have a Crown shape: Round, Wide, Umbrella, Column, Cone or Teardrop. The other
  branch controls still adjust it, and Natural keeps a tree just as it was.
- Poplar now grows as a full column, and Savanna acacia gets a flatter top.

**Fixed**

- Where a branch thins out, it no longer shows a notch, a dark streak or a hard line across it.
- A twig no longer starts thicker than the branch it grows from, so its open end no longer
  shows through the branch.
- Fruit no longer grows and shrinks in the wind, in the view or in your engine. It swings with
  its branch.
- On the Bush tab, Details now says what you're making: bush, grass, flowers or cactus.

## 0.3.0 (November 2, 2026)

**Find the one you want**

- Show me more puts nine versions of your prop side by side. Click one to use it, or tick
  several, or all of them, and export them together.

**See it before your engine does**

- Turn on Wind, beside the sun, to watch your prop sway as it will in your engine, from a calm
  day to a storm. If your computer asks for less motion, it waits for you to switch it on.
- Show what you can walk into, in the View menu, draws the simple shapes your game uses for
  collisions.

**Make it fit your game**

- When a prop has too many faces for its budget, Make it fit lowers the controls that cost the
  most, says what it changed, and can be undone in one step.
- In Bark detail, the slider for how fine the trunk and branches are is now called Wood detail.

**Shape it by hand**

- Branches and roots of painted trees can now be turned. Press E or the new Turn button and drag
  a ring, or type the angles. What grows on a branch turns with it.
- Fixed: on trees in the older style, such as Round canopy, a part you moved jumped back when you
  changed a slider.

**Export many**

- Export many now has all of Export's choices. It can also put a batch in a folder of its own,
  and give each prop its own folder.

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
