"""Sets up easy-props exports in Unreal: imports them and gives them wind materials.

In the Output Log, switch the box at the bottom to Cmd and run:

    py "C:/path/to/setup_props.py" "C:/path/to/export/folder"

The folder can hold one prop or many. Each prop goes to /Game/EasyProps/<name>. A third
argument chooses another place. Run it again to bring in new or changed props. The
shared materials are only made once, so your changes to them are kept.
"""

import json
import os
import re
import sys

import unreal

WHITE_TEXTURE = '/Engine/EngineResources/WhiteSquareTexture'
FLAT_RELIEF = '/Engine/EngineMaterials/DefaultNormal'

lib = unreal.MaterialEditingLibrary
assets = unreal.EditorAssetLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()


class Graph:
    """Adds and joins nodes in a material or a material function."""

    def __init__(self, asset):
        self.asset = asset
        self.in_function = isinstance(asset, unreal.MaterialFunction)

    def node(self, kind, **properties):
        kind = getattr(unreal, 'MaterialExpression' + kind)

        if self.in_function:
            made = lib.create_material_expression_in_function(self.asset, kind)
        else:
            made = lib.create_material_expression(self.asset, kind)

        for name, value in properties.items():
            made.set_editor_property(name, value)

        return made

    def constant(self, value):
        return self.node('Constant', r=value)

    def vector(self, x, y, z):
        return self.node('Constant3Vector', constant=unreal.LinearColor(x, y, z, 1))

    def join(self, kind, a, b, a_output='', b_output=''):
        """A node with inputs A and B, such as Multiply."""
        made = self.node(kind)
        lib.connect_material_expressions(a, a_output, made, 'A')
        lib.connect_material_expressions(b, b_output, made, 'B')
        return made

    def mask(self, source, red):
        made = self.node('ComponentMask', r=red, g=not red, b=False, a=False)
        lib.connect_material_expressions(source, '', made, '')
        return made

    def sine(self, source):
        made = self.node('Sine')
        lib.connect_material_expressions(source, '', made, '')
        return made


def load_or_create(path, factory, kind):
    if assets.does_asset_exist(path):
        return assets.load_asset(path), False

    folder, name = path.rsplit('/', 1)
    return tools.create_asset(name, folder, kind, factory), True


def wind_function(root):
    """The same wind as the guide's MF_PropWind: a sway and a flutter added together."""
    path = root + '/Shared/MF_PropWind'
    asset, created = load_or_create(path, unreal.MaterialFunctionFactoryNew(), unreal.MaterialFunction)

    if not created:
        return asset

    g = Graph(asset)
    time = g.node('Time')
    # Object Position is the same for every Nanite instance, so those differ by the random part.
    offset = g.join(
        'Add',
        g.join('DotProduct', g.node('ObjectPositionWS'), g.vector(0.001, 0.0015, 0)),
        g.node('PerInstanceRandom'),
    )
    first = g.sine(g.join('Add', g.join('Multiply', time, g.constant(0.2)), offset))
    second = g.join('Multiply', g.sine(g.join('Add', g.join('Multiply', time, g.constant(0.46)), offset)), g.constant(0.4))
    wind_data = g.node('TextureCoordinate', coordinate_index=1)
    sway = g.join(
        'Multiply',
        g.join('Multiply', g.join('Add', first, second), g.mask(wind_data, True)),
        g.vector(25, 8, 0),
    )
    ripple = g.join('Divide', g.join('DotProduct', g.node('WorldPosition'), g.vector(1, 1, 1)), g.constant(60))
    wave = g.sine(g.join('Add', g.join('Multiply', time, g.constant(0.8)), ripple))
    flutter = g.join(
        'Multiply',
        g.join('Multiply', g.join('Multiply', wave, g.mask(wind_data, False)), g.constant(1.5)),
        g.node('VertexNormalWS'),
    )
    output = g.node('FunctionOutput', output_name='Wind')

    lib.connect_material_expressions(g.join('Add', sway, flutter), '', output, '')
    lib.layout_material_function_expressions(asset)
    lib.update_material_function(asset)
    assets.save_loaded_asset(asset)

    return asset


def parent_material(path, wind, leaves):
    asset, created = load_or_create(path, unreal.MaterialFactoryNew(), unreal.Material)

    if not created:
        return asset

    g = Graph(asset)
    texture = g.node(
        'TextureSampleParameter2D',
        parameter_name='Texture',
        texture=unreal.load_asset(WHITE_TEXTURE),
    )
    color = g.join('Multiply', texture, g.node('VertexColor'), 'RGB')

    if not leaves:
        relief = g.node(
            'TextureSampleParameter2D',
            parameter_name='Relief',
            sampler_type=unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL,
            texture=unreal.load_asset(FLAT_RELIEF),
        )
        lib.connect_material_property(relief, 'RGB', unreal.MaterialProperty.MP_NORMAL)

    call = g.node('MaterialFunctionCall')
    call.set_material_function(wind)
    still = g.vector(0, 0, 0)
    moves = g.node('StaticSwitchParameter', parameter_name='Wind', default_value=True)

    lib.connect_material_expressions(call, '', moves, 'True')
    lib.connect_material_expressions(still, '', moves, 'False')
    lib.connect_material_property(color, '', unreal.MaterialProperty.MP_BASE_COLOR)
    lib.connect_material_property(moves, '', unreal.MaterialProperty.MP_WORLD_POSITION_OFFSET)

    if leaves:
        asset.set_editor_property('blend_mode', unreal.BlendMode.BLEND_MASKED)
        asset.set_editor_property('shading_model', unreal.MaterialShadingModel.MSM_TWO_SIDED_FOLIAGE)
        lib.connect_material_property(g.join('Multiply', color, g.constant(0.5)), '', unreal.MaterialProperty.MP_SUBSURFACE_COLOR)
        lib.connect_material_property(texture, 'A', unreal.MaterialProperty.MP_OPACITY_MASK)
        lib.connect_material_property(g.constant(1), '', unreal.MaterialProperty.MP_ROUGHNESS)
    else:
        lib.connect_material_property(g.constant(0.85), '', unreal.MaterialProperty.MP_ROUGHNESS)

    asset.set_editor_property('used_with_instanced_static_meshes', True)
    lib.layout_material_expressions(asset)
    lib.recompile_material(asset)
    assets.save_loaded_asset(asset)

    return asset


def import_prop(source, destination):
    pipeline = unreal.InterchangeGenericAssetsPipeline()
    meshes = pipeline.get_editor_property('mesh_pipeline')

    meshes.set_editor_property('combine_static_meshes_behavior', unreal.InterchangeCombineStaticMeshesBehavior.DO_NOT_COMBINE)
    meshes.set_editor_property('import_collision_according_to_mesh_name', True)
    meshes.set_editor_property('one_convex_hull_per_ucx', True)
    # Without this every mesh gets a large cage, which feels like an invisible wall.
    meshes.set_editor_property('fallback_collision_type', unreal.InterchangeMeshCollision.NONE)
    meshes.set_editor_property('generate_lightmap_u_vs', False)
    pipeline.get_editor_property('common_meshes_properties').set_editor_property('recompute_normals', False)

    parameters = unreal.ImportAssetParameters()
    parameters.set_editor_property('is_automated', True)
    parameters.get_editor_property('override_pipelines').append(unreal.SoftObjectPath(pipeline.get_path_name()))

    manager = unreal.InterchangeManager.get_interchange_manager_scripted()

    return manager.import_asset(destination, manager.create_source_data(source), parameters)


def assets_of(folder, kind):
    found = []

    for path in assets.list_assets(folder, recursive=True, include_folder=False):
        asset = assets.load_asset(path)

        if isinstance(asset, kind):
            found.append(asset)

    return found


def own_textures(material, destination):
    """The picture and relief imported for a material. Either is None when it has none."""
    picture = None
    relief = None

    for texture in lib.get_used_textures(material):
        if texture.get_name().lower() == 'white' or not texture.get_path_name().startswith(destination + '/'):
            continue

        if texture.get_editor_property('compression_settings') == unreal.TextureCompressionSettings.TC_NORMALMAP:
            relief = texture
        else:
            picture = texture

    return picture, relief


def material_for(slot_name, imported, destination, parents, moves):
    leaves = '_leaves' in slot_name
    factory = unreal.MaterialInstanceConstantFactoryNew()
    path = '{}/MI_{}'.format(destination, slot_name)
    instance, _ = load_or_create(path, factory, unreal.MaterialInstanceConstant)
    # On a second run the slot still holds this instance, with its texture already set.
    texture, relief = own_textures(imported, destination) if isinstance(imported, unreal.Material) else (None, None)

    instance.set_editor_property('parent', parents['leaves' if leaves else 'wood'])

    if texture:
        lib.set_material_instance_texture_parameter_value(instance, 'Texture', texture)

    if relief and not leaves:
        lib.set_material_instance_texture_parameter_value(instance, 'Relief', relief)

    lib.set_material_instance_static_switch_parameter_value(instance, 'Wind', moves)
    lib.update_material_instance(instance)
    assets.save_loaded_asset(instance)

    return instance


def has_wind(source):
    folder = os.path.dirname(source)
    name = re.sub(r'(_LOD0)?\.glb$', '', os.path.basename(source))
    description = os.path.join(folder, name + '.asset.json')

    if not os.path.exists(description):
        return True

    with open(description, encoding='utf-8') as file:
        return json.load(file).get('wind') is not None


def set_up_prop(source, root, parents):
    name = re.sub(r'(_LOD0)?\.glb$', '', os.path.basename(source))
    destination = '{}/{}'.format(root, name)
    moves = has_wind(source)

    import_prop(source, destination)

    meshes = assets_of(destination, unreal.StaticMesh)
    editor = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)

    for mesh in meshes:
        solid = True

        for index, slot in enumerate(mesh.get_editor_property('static_materials')):
            slot_name = str(slot.get_editor_property('material_slot_name'))
            imported = slot.get_editor_property('material_interface')
            mesh.set_material(index, material_for(slot_name, imported, destination, parents, moves))
            solid = solid and '_leaves' not in slot_name

        # A separate wood piece has no shapes of its own, so it gets one to walk into.
        if solid and editor.get_simple_collision_count(mesh) == 0:
            editor.add_simple_collisions(mesh, unreal.ScriptCollisionShapeType.CAPSULE)

        assets.save_loaded_asset(mesh)

    # What the importer made in place of ours, now unused.
    for leftover in assets_of(destination, unreal.Material):
        assets.delete_asset(leftover.get_path_name())

    assets.save_directory(destination, only_if_is_dirty=True)

    unreal.log('easy-props: set up {} from {}'.format(destination, source))

    return meshes


def props_in(folder):
    for place, _, names in os.walk(folder):
        for name in names:
            if re.search(r'\.glb$', name) and not re.search(r'(_collision|_LOD[1-9])\.glb$', name):
                yield os.path.join(place, name)


def main(folder, root='/Game/EasyProps'):
    wind = wind_function(root)
    parents = {
        'wood': parent_material(root + '/Shared/M_PropWood', wind, False),
        'leaves': parent_material(root + '/Shared/M_PropLeaves', wind, True),
    }
    sources = list(props_in(folder))

    if not sources:
        unreal.log_warning('easy-props: no exported props found in {}'.format(folder))

    for source in sources:
        set_up_prop(source, root, parents)

    return sources


if __name__ == '__main__':
    if len(sys.argv) < 2:
        unreal.log_error('easy-props: name the export folder, as in: py "setup_props.py" "C:/path/to/folder"')
    else:
        main(*sys.argv[1:3])
