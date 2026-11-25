# Carte Mémoire · textures des étagères de Ma collection, rendues avec Blender
#
# Bois (noyer, chêne, érable, ébène) et métal brossé, en matières procédurales (fil du bois,
# ondes, pores, veinage « cathédrale »), photographiés à plat par une caméra orthographique :
# des images de couleur sans éclairage (le site ajoute lumière, reflets et ombres).
# Pour chaque matière, deux images :
#   - <nom>-fil.png : une longue planche, fil horizontal (face avant des tablettes, haut du meuble) ;
#   - <nom>-panneau.png : un panneau plus haut (fond du meuble, montants), tourné ensuite à la
#     verticale par encode.mjs.
#
# Lancer :  blender --background --factory-startup --python scripts/etagere/textures.py -- <dossier de sortie>
# puis     node scripts/etagere/encode.mjs <dossier de sortie>   (WebP dans web/src/assets/etagere)
import math
import os
import sys

import bpy

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else os.path.join(os.getcwd(), 'etagere-rendus')
ONLY = sys.argv[sys.argv.index('--') + 2:] if '--' in sys.argv else []
os.makedirs(OUT, exist_ok=True)


def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb(hex_color):
    h = hex_color.lstrip('#')
    return tuple(lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


# Matières : teintes du plus foncé au plus clair, et réglages du veinage
WOODS = {
    'noyer': dict(colors=['#2e190d', '#4b2d19', '#674026', '#86593a'], seed=1.7, grain=70, grain_weight=1.0, rings=0.65, figure=7.0, streaks=0.8, pores=0.7, tone=0.25),
    'chene': dict(colors=['#8a5e31', '#ac7f4b', '#c69862', '#ddb57f'], seed=4.2, grain=55, grain_weight=1.2, rings=0.8, figure=6.0, streaks=0.6, pores=1.0, tone=0.2),
    'erable': dict(colors=['#c2a06c', '#d6b887', '#e5cb9f', '#f1ddba'], seed=7.9, grain=80, grain_weight=0.7, rings=0.45, figure=4.0, streaks=0.5, pores=0.35, tone=0.15),
    'ebene': dict(colors=['#0d0806', '#1c130d', '#33231a', '#57402e'], seed=2.6, grain=40, grain_weight=0.8, rings=0.3, figure=6.0, streaks=1.4, pores=0.4, tone=0.3),
}
METALS = {
    'metal': dict(colors=['#8e949b', '#b3b8be', '#cfd3d8', '#e6e9ec'], seed=3.3),
}

# Formats : (largeur, hauteur) en pixels ; une unité de matière = la hauteur de « fil »
FORMATS = {'fil': (2048, 192), 'panneau': (2048, 640)}
UNIT = 192  # pixels par unité, identique dans les deux formats (même échelle de fil)


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False
    scene.cycles.device = 'CPU'
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    world = bpy.data.worlds.new('fond')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.0
    bpy.ops.mesh.primitive_plane_add(size=1)
    plane = bpy.context.object
    cam_data = bpy.data.cameras.new('camera')
    cam_data.type = 'ORTHO'
    cam = bpy.data.objects.new('camera', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.location = (0, 0, 5)
    return scene, plane, cam_data


def node(tree, kind, x, y, **props):
    n = tree.nodes.new(kind)
    n.location = (x, y)
    for k, v in props.items():
        setattr(n, k, v)
    return n


def ramp(tree, colors, x, y, positions=None):
    r = node(tree, 'ShaderNodeValToRGB', x, y)
    els = r.color_ramp.elements
    positions = positions or [i / (len(colors) - 1) for i in range(len(colors))]
    while len(els) < len(colors):
        els.new(0.5)
    for el, pos, col in zip(els, positions, colors):
        el.position = pos
        el.color = rgb(col)
    return r


def material(name, aspect, height_units, build):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()
    out = node(tree, 'ShaderNodeOutputMaterial', 1400, 0)
    emit = node(tree, 'ShaderNodeEmission', 1200, 0)
    tree.links.new(emit.outputs[0], out.inputs[0])
    coord = node(tree, 'ShaderNodeTexCoord', -1400, 0)
    # Coordonnées « physiques » : x de 0 à la longueur, y de 0 à la hauteur (en unités)
    mapping = node(tree, 'ShaderNodeMapping', -1200, 0)
    mapping.inputs['Location'].default_value = (aspect * height_units / 2, height_units / 2, 0)
    mapping.inputs['Scale'].default_value = (aspect * height_units, height_units, 1)
    tree.links.new(coord.outputs['Object'], mapping.inputs['Vector'])
    color = build(tree, mapping.outputs['Vector'])
    tree.links.new(color, emit.inputs['Color'])
    return mat


def stretched(tree, vector, sx, sy, x, y, offset=(0, 0, 0)):
    m = node(tree, 'ShaderNodeMapping', x, y)
    m.inputs['Scale'].default_value = (sx, sy, 1)
    m.inputs['Location'].default_value = offset
    tree.links.new(vector, m.inputs['Vector'])
    return m.outputs['Vector']


def math_node(tree, op, a, b, x, y):
    n = node(tree, 'ShaderNodeMath', x, y, operation=op)
    for i, v in enumerate((a, b)):
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            tree.links.new(v, n.inputs[i])
    return n.outputs[0]


def noise(tree, vector, scale, detail, w, x, y, roughness=0.5, distortion=0.0):
    n = node(tree, 'ShaderNodeTexNoise', x, y, noise_dimensions='4D')
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = roughness
    n.inputs['Distortion'].default_value = distortion
    n.inputs['W'].default_value = w
    tree.links.new(vector, n.inputs['Vector'])
    return n.outputs['Fac']


def wood(p):
    def build(tree, v):
        seed = p['seed']
        # Le fil ondule doucement : un bruit très étiré décale les lignes de travers
        warp = noise(tree, stretched(tree, v, 0.08, 1, -1200, 600), 2.2, 4, seed + 11, -1000, 600)
        warped = node(tree, 'ShaderNodeVectorMath', -800, 500, operation='MULTIPLY_ADD')
        warped.inputs[1].default_value = (0, 0.55, 0)
        tree.links.new(warp, warped.inputs[0])
        tree.links.new(v, warped.inputs[2])
        wv = warped.outputs['Vector']
        # Fil : lignes fines et serrées, irrégulières
        grain = node(tree, 'ShaderNodeTexWave', -600, 300, wave_type='BANDS', bands_direction='Y', wave_profile='SIN')
        grain.inputs['Scale'].default_value = p['grain']
        grain.inputs['Distortion'].default_value = 4
        grain.inputs['Detail'].default_value = 3
        grain.inputs['Detail Scale'].default_value = 0.8
        grain.inputs['Phase Offset'].default_value = seed
        tree.links.new(stretched(tree, wv, 0.05, 1, -800, 300), grain.inputs['Vector'])
        # Veinage « cathédrale » : cernes coupés en biais, arches allongées et irrégulières
        rings = node(tree, 'ShaderNodeTexWave', -600, 0, wave_type='RINGS', rings_direction='SPHERICAL', wave_profile='SIN')
        rings.inputs['Scale'].default_value = p['figure']
        rings.inputs['Distortion'].default_value = 3.2
        rings.inputs['Detail'].default_value = 4
        rings.inputs['Detail Scale'].default_value = 1.4
        rings.inputs['Detail Roughness'].default_value = 0.6
        tree.links.new(stretched(tree, wv, 0.028, 1, -800, 0, offset=(-seed * 4, -1.6, 0)), rings.inputs['Vector'])
        # Longues traînées plus claires ou plus foncées, le long du fil
        streaks = noise(tree, stretched(tree, wv, 0.015, 1, -800, -250), 9, 5, seed * 2.3, -600, -250, roughness=0.6)
        # Pores : stries très fines et courtes
        pores = noise(tree, stretched(tree, v, 0.06, 1, -800, -500), 420, 1, seed, -600, -500)
        # Teinte d'une zone à l'autre
        tone = noise(tree, stretched(tree, v, 0.25, 1, -800, -750), 0.9, 2, seed * 3.1, -600, -750)

        def weighted(value, weight, x, y):
            centred = math_node(tree, 'SUBTRACT', value, 0.5, x, y)
            return math_node(tree, 'MULTIPLY', centred, weight, x + 150, y)

        total = 0.5
        parts = [
            weighted(grain.outputs['Fac'], 0.30 * p['grain_weight'], -400, 300),
            weighted(rings.outputs['Fac'], 0.55 * p['rings'], -400, 0),
            weighted(streaks, 1.1 * p['streaks'], -400, -250),
            weighted(pores, 0.6 * p['pores'], -400, -500),
            weighted(tone, 1.6 * p['tone'], -400, -750),
        ]
        acc = parts[0]
        for i, part in enumerate(parts[1:]):
            acc = math_node(tree, 'ADD', acc, part, -100, 200 - i * 150)
        shade = math_node(tree, 'ADD', acc, total, 50, 0)
        r = ramp(tree, p['colors'], 200, 0, positions=[0.2, 0.42, 0.6, 0.82])
        tree.links.new(shade, r.inputs['Fac'])
        return r.outputs['Color']
    return build


def brushed(p):
    def build(tree, v):
        s_vec = stretched(tree, v, 0.004, 1, -1000, 200)
        streaks = node(tree, 'ShaderNodeTexNoise', -800, 200, noise_dimensions='4D')
        streaks.inputs['Scale'].default_value = 260
        streaks.inputs['Detail'].default_value = 6
        streaks.inputs['W'].default_value = p['seed']
        tree.links.new(s_vec, streaks.inputs['Vector'])
        t_vec = stretched(tree, v, 0.3, 1, -1000, -200)
        tone = node(tree, 'ShaderNodeTexNoise', -800, -200)
        tone.inputs['Scale'].default_value = 1.2
        tree.links.new(t_vec, tone.inputs['Vector'])
        mix = math_node(tree, 'ADD', math_node(tree, 'MULTIPLY', streaks.outputs['Fac'], 0.8, -600, 200),
                        math_node(tree, 'MULTIPLY', tone.outputs['Fac'], 0.25, -600, -200), -400, 0)
        r = ramp(tree, p['colors'], 100, 0, positions=[0.25, 0.42, 0.56, 0.75])
        tree.links.new(mix, r.inputs['Fac'])
        return r.outputs['Color']
    return build


def main():
    scene, plane, cam_data = setup()
    jobs = [(n, wood(p)) for n, p in WOODS.items()] + [(n, brushed(p)) for n, p in METALS.items()]
    for name, build in jobs:
        if ONLY and name not in ONLY:
            continue
        for fmt, (w, h) in FORMATS.items():
            aspect = w / h
            height_units = h / UNIT
            mat = material(f'{name}-{fmt}', aspect, height_units, build)
            plane.data.materials.clear()
            plane.data.materials.append(mat)
            plane.scale = (aspect, 1, 1)
            cam_data.ortho_scale = aspect
            scene.render.resolution_x = w
            scene.render.resolution_y = h
            scene.render.resolution_percentage = 100
            scene.render.filepath = os.path.join(OUT, f'{name}-{fmt}.png')
            bpy.ops.render.render(write_still=True)
            print('rendu', scene.render.filepath)


main()
