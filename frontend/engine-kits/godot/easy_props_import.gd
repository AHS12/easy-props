@tool
extends EditorScenePostImport

# easy-props paints a prop's colours on its points. From Godot 4.7, a GLB's materials
# import with those colours turned off, so the prop comes in white. This turns them back
# on for every surface that has them. Godot runs it again on each reimport.


func _post_import(scene: Node) -> Object:
	for node in scene.find_children("*", "MeshInstance3D", true, false):
		var mesh: Mesh = (node as MeshInstance3D).mesh

		if mesh == null:
			continue

		for surface in mesh.get_surface_count():
			var material := mesh.surface_get_material(surface)

			if material is BaseMaterial3D and mesh.surface_get_format(surface) & Mesh.ARRAY_FORMAT_COLOR:
				(material as BaseMaterial3D).vertex_color_use_as_albedo = true

	return scene
