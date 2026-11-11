# Words on screen

Every word the app shows follows this table. If a control needs a term that isn't here,
agree on the term first, or rethink the control.

| Technical term | People see | Notes |
|---|---|---|
| Mesh, geometry, poly model | *(never shown)* | |
| Vertex, edge, face, topology | *(never shown)* | |
| Polygon count | **Faces** | Only in the advanced chip: "2,340 faces" |
| Radius | **Thickness** | |
| Base radius / top radius | **Thickness** + **Taper** | Taper shown as a segmented choice |
| Taper | **Taper** | Slider. "How much the trunk narrows toward the top." |
| Material, texture, shader | **Colour** | Named swatches — "Warm brown", "Autumn orange" — not hex codes. Inside the colour picker only, the code may be shown as **Colour code** |
| Shading mode, viewport shading | **View** | Lit / Flat / Wireframe. "Show the triangles" for wireframe |
| Delete, remove | **Remove** | "Remove this branch" |
| Curvature | **Bend** | Segmented: Straight / Curved / Very curved |
| Twist | **Twist** | Acceptable — the word is intuitive |
| Segments, radial segments | **Detail** | Segmented: Low-poly / Detailed |
| Foliage, foliage cluster | **Leaves** / **Leaf clump** | |
| Foliage density | **Amount of leaves** | Segmented: Few / Medium / Many |
| Foliage size | **Leaf size** | |
| Branch hierarchy, child branches | **Branches** / **Small branches** | |
| Exposed roots | **Roots** | |
| L-system | *(never shown)* | |
| Transform, gizmo | **Move**, **Turn**, **Resize** | |
| Translate / rotate / scale | **Move** / **Turn** / **Resize** | |
| Duplicate | **Copy** | |
| Modifier, stack | *(never shown)* | |
| UV, unwrap | *(never shown)* | |
| Normal, tangent | *(never shown)* | |
| Shader, material graph | **Material** | Fixed presets only in MVP |
| Seed | **Seed** | Plus **Surprise me** for a new one. Shown as a whole number you can type, paste or copy |
| LOD | **Detail levels** | "Detail levels (LOD)" in export and settings, where people look for the word. |
| Billboard, impostor | **Far-away card** | A flat picture of a prop, shown in its place far off. "Far away" in the detail level menu. |
| Pivot | *(never shown)* | |
| Collision, collision shapes | **What you can walk into** | In the view. Export keeps **Collision**, where people look for the word |
| Export as glTF | **Export** (GLB) | The extension is not a choice in MVP |
| Project file | **Project** | With save/open in a File menu |
| User template, starting point | **My presets** / **my preset** | A saved prop new props start from. "Save as my preset…", "Add to My presets". The app's own are just **presets** |
| Weather, surface layers, decals | **Weather** | The section holding **Snow** and **Wet** on every kind of prop, and **Moss** and **Moss grows** on trees and rocks |
| Snow accumulation | **Snow** | "White on whatever faces up, thickest on flat tops." |
| Moss direction, occlusion side | **Moss grows** | **On top** / **On one side** |
| Smooth shading, rounded normals | **Rounded light** | On rocks: light rolls over the stone like a pebble, the faces stay flat. Never "normals" or "smooth shading" |
| Detail texture, normal map, micro detail | **Grain** | On rocks: fine speckle, pits and hairline cracks seen up close. Never "texture" or "normal map" |
| End cap, cross-section texture | **Cut ends** | The sawn faces of a stump, log or branch, with their rings |
| Texture resolution | **Picture size** | In Export: 512, 1024 or 2048. Never "texture" or "resolution" |
| Material atlas, shared material, palette sync | **Export as a set**, **Set colours** | In Export many. Never "atlas" or "material instance" |
| Wetness, roughness, specular | **Wet** | "Darker and shinier, as after rain or in a swamp." Never "roughness" or "gloss" |
| Terrain slope, ground normal, incline | **Slope** / **Downhill** | In the view only: tilts the ground, not the prop. Degrees are shown |
| Derived props, deadwood, debris | **Pieces** of a tree: **Stump**, **Fallen log**, **Fallen branch**, **Leaf litter** | "Make pieces from this tree…" in the Prop menu. Never "asset variants" or "debris" |
| Damage, destruction, decay | **Damage**: **Snapped top**, **Broken limbs**, **Split trunk**, **Break** (one limb), **Cracks**, **Crumbled edge**, **Fallen arms** | A section of its own on trees, rocks and cacti, and a **Damaged** choice in Show me more beside **New seeds**. Never "destruction" or "fracture" |
| Peduncle, pedicel, fruit drop | **Stalk**, **Hanging** | What fruit hangs from. **Hanging** sets how far: "from snug to dangling". Never "stem" for fruit, which flowers use |

## Button voice

One verb per button. The verb names the outcome.

| Do not write | Write |
|---|---|
| OK | Copy / Cancel — or name the outcome |
| Apply | Update tree |
| Confirm | Delete branch |
| Submit | Save project |
| Reset | Restore default |
| Generate | Build tree |
| Randomize | Surprise me |
| OK, Cancel in a dialog | Delete branch, Keep branch |

## Error voice

Errors state what broke, why, and what to do next. The user is never blamed.

> "That branch is bigger than the trunk it is attached to. Try a smaller
> branch, or make the trunk thicker."
