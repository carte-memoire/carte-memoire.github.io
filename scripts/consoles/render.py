# Carte Mémoire · les consoles de l'accueil, modélisées et rendues avec Blender
#
# Chaque console est construite ici en volumes simples (blocs arrondis, profils extrudés,
# boutons, fentes), d'après des photos des vraies consoles, SANS logo ni marque : seulement
# la forme, les couleurs et les détails (couvercle, ports, boutons, grilles…).
# Unité : le centimètre. Sol en z = 0 ; x vers la droite, y vers le fond (y = 0 : la façade).
# Les portables sont posées debout, l'écran vers nous, un peu inclinées vers l'arrière.
#
# Rendu : Cycles, lumière de studio (soleils doux), ombre portée au sol, fond transparent,
# caméra orthographique de trois quarts (devant, à droite, au-dessus), comme les anciens
# dessins du site.
#
# Lancer :  blender --background --factory-startup --python scripts/consoles/render.py -- <dossier> [PS1 GB …]
# puis     node scripts/consoles/encode.mjs <dossier>   (WebP dans web/src/assets/consoles)
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGS[0] if ARGS else os.path.join(os.getcwd(), 'consoles-rendus')
ONLY = ARGS[1:]
SAMPLES = int(os.environ.get('CONSOLES_SAMPLES', '96'))
os.makedirs(OUT, exist_ok=True)


# ---------------------------------------------------------------------
# Couleurs et matières
# ---------------------------------------------------------------------
def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb(hex_color):
    h = hex_color.lstrip('#')
    return tuple(lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


def material(color, rough=0.42, metal=0.0, coat=0.0, emit=None, strength=4.0, transmission=0.0, alpha=1.0):
    m = bpy.data.materials.new(f'{color}-{rough}-{metal}-{coat}-{emit}-{transmission}')
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = rgb(color)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if coat:
        p.inputs['Coat Weight'].default_value = coat
        p.inputs['Coat Roughness'].default_value = 0.08
    if emit:
        p.inputs['Emission Color'].default_value = rgb(emit)
        p.inputs['Emission Strength'].default_value = strength
    if transmission:
        p.inputs['Transmission Weight'].default_value = transmission
    if alpha < 1:
        p.inputs['Alpha'].default_value = alpha
    return m


def plastic(color, rough=0.45):
    return material(color, rough)


def glossy(color):
    return material(color, 0.16, coat=0.6)


def matte(color):
    return material(color, 0.7)


def metal(color, rough=0.32):
    return material(color, rough, metal=1.0)


def led(color, strength=6.0):
    return material(color, 0.3, emit=color, strength=strength)


def screen(color='#1b1d22'):
    return material(color, 0.08, coat=1.0)


# ---------------------------------------------------------------------
# Volumes
# ---------------------------------------------------------------------
def finish(obj, bevel, segments=4, angle=35):
    """Arêtes arrondies (biseau limité aux angles vifs) et lissage."""
    me = obj.data
    for poly in me.polygons:
        poly.use_smooth = True
    try:
        me.set_sharp_from_angle(angle=math.radians(angle))
    except AttributeError:
        pass
    if bevel > 0:
        mod = obj.modifiers.new('biseau', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(angle)
        mod.harden_normals = False
        mod.use_clamp_overlap = True
    return obj


def to_object(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def rr(x, y, w, h, r, steps=8):
    """Rectangle arrondi (x, y = coin bas gauche), rayon unique ou [bg, bd, hd, hg]."""
    rs = r if isinstance(r, (list, tuple)) else [r, r, r, r]
    corners = [(x + rs[0], y + rs[0], 180), (x + w - rs[1], y + rs[1], 270), (x + w - rs[2], y + h - rs[2], 0), (x + rs[3], y + h - rs[3], 90)]
    pts = []
    for (cx, cy, start), rad in zip(corners, rs):
        if rad <= 0:
            pts.append((cx, cy))
            continue
        for i in range(steps + 1):
            a = math.radians(start + 90 * i / steps)
            pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
    return pts


def circle(cx, cy, r, steps=64):
    return [(cx + r * math.cos(2 * math.pi * i / steps), cy + r * math.sin(2 * math.pi * i / steps)) for i in range(steps)]


def ccw(pts):
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1]))
    return pts if area > 0 else pts[::-1]


def loft(name, bottom, top, mat, bevel=0.0, segments=4, angle=35):
    """Volume entre deux contours (même nombre de points) : [(x, y, z)…] en bas et en haut."""
    bm = bmesh.new()
    vb = [bm.verts.new(p) for p in bottom]
    vt = [bm.verts.new(p) for p in top]
    n = len(bottom)
    bm.faces.new(vb[::-1])
    bm.faces.new(vt)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([vb[i], vb[j], vt[j], vt[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(to_object(name, bm, mat), bevel, segments, angle)


def prism(name, pts, z0, z1, mat, bevel=0.0, segments=4, angle=35, top_pts=None):
    """Contour vu de dessus (x, y), extrudé de z0 à z1 (top_pts : contour du haut, plus petit)."""
    pts = ccw(pts)
    top = ccw(top_pts) if top_pts else pts
    return loft(name, [(x, y, z0) for x, y in pts], [(x, y, z1) for x, y in top], mat, bevel, segments, angle)


def profile(name, pts, x0, x1, mat, bevel=0.0, segments=4, angle=35):
    """Profil de côté (y, z), extrudé sur la largeur de x0 à x1."""
    pts = ccw(pts)
    return loft(name, [(x0, y, z) for y, z in pts], [(x1, y, z) for y, z in pts], mat, bevel, segments, angle)


def front(name, pts, y0, y1, mat, bevel=0.0, segments=4, angle=35):
    """Contour de face (x, z), extrudé dans la profondeur de y0 à y1."""
    pts = ccw(pts)
    return loft(name, [(x, y0, z) for x, z in pts], [(x, y1, z) for x, z in pts], mat, bevel, segments, angle)


def box(name, x0, y0, z0, x1, y1, z1, mat, bevel=0.0, r=0.0):
    return prism(name, rr(x0, y0, x1 - x0, y1 - y0, r) if r else [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], z0, z1, mat, bevel)


def cyl(name, cx, cy, z0, z1, r, mat, bevel=0.0, steps=64):
    return prism(name, circle(cx, cy, r, steps), z0, z1, mat, bevel, segments=3, angle=60)


def fcyl(name, cx, cz, y0, y1, r, mat, bevel=0.0, steps=48):
    """Cylindre couché, l'axe dans la profondeur (bouton ou port vu de face)."""
    return front(name, circle(cx, cz, r, steps), y0, y1, mat, bevel, segments=3, angle=60)


def cross_pts(cx, cy, size, thick):
    a, b = size / 2, thick / 2
    return [(cx - b, cy - a), (cx + b, cy - a), (cx + b, cy - b), (cx + a, cy - b), (cx + a, cy + b), (cx + b, cy + b),
            (cx + b, cy + a), (cx - b, cy + a), (cx - b, cy + b), (cx - a, cy + b), (cx - a, cy - b), (cx - b, cy - b)]


def group(objs, matrix):
    """Déplace et tourne un groupe d'objets (portable posée debout…)."""
    for o in objs:
        o.matrix_world = matrix @ o.matrix_world


def standing(tilt=12, lift=0.0):
    """Portable dessinée à plat (face vers +z) → debout, l'écran vers nous, inclinée en arrière."""
    return Matrix.Translation((0, 0, lift)) @ Matrix.Rotation(math.radians(90 - tilt), 4, 'X')


# ---------------------------------------------------------------------
# Les consoles (dimensions des vraies, en cm, relevées sur les fiches et les photos)
# ---------------------------------------------------------------------
def ps1():
    """PlayStation (SCPH-1002) : 27 × 18,8 × 6 cm, gris clair (mêmes mesures que le dessin
    validé de DiscChallenge.tsx) : deux ailes de 6,7 cm de part et d'autre d'une partie
    centrale ; le grand capot rond (Ø 17,4) au centre, qui empiète sur les ailes ; à gauche,
    le petit Reset et le grand Power (voyant devant), à droite le grand Open ; en façade, la
    partie centrale en retrait avec deux fentes de carte mémoire au-dessus des ports manette."""
    body, recess, darker = plastic('#c9c8c4', 0.5), plastic('#9e9d99', 0.5), plastic('#3b3b3e', 0.6)
    W, D, H = 27.0, 18.8, 6.0
    # Les ailes vont jusqu'à la façade ; la partie centrale est en retrait de 0,8 cm
    profile('aile-gauche', [(0.4, 0), (D, 0), (D, H - 0.4), (D - 0.4, H), (0.5, H), (0.0, H - 0.6), (0.0, 1.2)], 0, 6.7, body, bevel=0.35)
    profile('aile-droite', [(0.4, 0), (D, 0), (D, H - 0.4), (D - 0.4, H), (0.5, H), (0.0, H - 0.6), (0.0, 1.2)], 20.3, W, body, bevel=0.35)
    profile('centre', [(1.2, 0), (D, 0), (D, H - 0.4), (D - 0.4, H), (1.5, H), (0.8, H - 0.7), (0.8, 0.8)], 6.7, 20.3, body, bevel=0.3)
    for x in (6.68, 20.3):
        box('couture', x, 0.8, 0.2, x + 0.04, D, H + 0.005, recess)
    # Façade centrale : fentes de carte mémoire et ports manette
    for x in (7.3, 14.5):
        box('carte-cadre', x, 0.7, 3.3, x + 5.2, 0.85, 4.9, recess, bevel=0.08)
        box('carte', x + 0.5, 0.65, 3.85, x + 4.7, 0.8, 4.2, darker)
        box('manette', x + 0.4, 0.65, 1.2, x + 4.8, 0.85, 2.9, plastic('#777775', 0.5), bevel=0.15)
        for k in range(3):
            box('broche', x + 0.7 + k * 1.35, 0.6, 1.5, x + 1.8 + k * 1.35, 0.7, 2.6, plastic('#545452', 0.5))
    # Capot rond (Ø 17,4) dans son logement, à peine bombé
    cyl('logement', 13.5, 9.2, H - 0.05, H + 0.01, 8.9, recess)
    cyl('capot', 13.5, 9.2, H - 0.05, H + 0.3, 8.7, body, bevel=0.3)
    cyl('puits', 13.5, 9.2, H + 0.28, H + 0.31, 7.0, plastic('#c2c1bd', 0.45))
    # Reset (petit), Power et Open (grands), dans leur cuvette ; voyant au bord avant
    for name, x, y, r in (('reset', 2.4, 7.1, 0.8), ('power', 3.5, 3.2, 1.9), ('open', 23.5, 3.2, 1.9)):
        cyl(name + '-cuvette', x, y, H - 0.06, H + 0.01, r + 0.25, recess)
        cyl(name, x, y, H - 0.06, H + 0.25, r, plastic('#bfbfbb', 0.45), bevel=0.2)
    box('voyant', 3.24, -0.03, H - 1.0, 3.56, 0.1, H - 0.3, led('#5cff5c', 3))


def gameboy():
    """Game Boy (DMG-01) : 9 × 14,8 × 3,2 cm, gris chaud ; écran vert dans un cadre gris-bleu
    au coin bas droit très arrondi, deux filets de couleur en haut du cadre, croix noire,
    A et B bordeaux en biais, Select et Start, grille du haut-parleur en diagonale ;
    le coin bas droit du boîtier, lui aussi, très arrondi."""
    body, bezel = plastic('#c8c5bb', 0.5), plastic('#585c6e', 0.45)
    objs = []
    W, Hh, T = 9.0, 14.8, 3.2
    objs.append(prism('corps', rr(0, 0, W, Hh, [0.45, 2.3, 0.45, 0.45]), 0, T, body, bevel=0.35))
    # Rainures du haut (bord supérieur) : simples traits
    for x in (0.9, 8.1):
        objs.append(box('rainure', x - 0.04, Hh - 0.8, T - 0.01, x + 0.04, Hh - 0.15, T + 0.02, plastic('#9d9a91')))
    # Cadre de l'écran et ses deux filets
    objs.append(prism('cadre', rr(0.65, 7.0, 7.7, 6.6, [0.35, 1.5, 0.35, 0.35]), T - 0.02, T + 0.06, bezel, bevel=0.05))
    objs.append(box('filet1', 1.0, 12.95, T + 0.06, 8.0, 13.03, T + 0.07, plastic('#8a2d5f')))
    objs.append(box('filet2', 1.0, 13.15, T + 0.06, 8.0, 13.23, T + 0.07, plastic('#2f3a86')))
    objs.append(box('ecran', 2.15, 7.75, T + 0.06, 6.85, 12.35, T + 0.1, material('#8e9a5e', 0.25, coat=0.6)))
    objs.append(cyl('voyant', 1.35, 11.3, T + 0.06, T + 0.1, 0.17, led('#ff3030', 2)))
    # Croix, A et B, Select et Start
    objs.append(prism('croix', cross_pts(2.1, 4.6, 2.45, 0.85), T - 0.05, T + 0.42, plastic('#1d1d20', 0.4), bevel=0.08))
    for cx, cy in ((6.05, 4.25), (7.6, 5.0)):
        objs.append(cyl('bouton', cx, cy, T - 0.05, T + 0.38, 0.6, plastic('#8b1f4d', 0.35), bevel=0.16))
    for cx in (3.55, 5.0):
        pill = [(cx + 0.55 * math.cos(math.radians(a)) * (1 if math.cos(math.radians(a)) > 0 else 1), 0) for a in ()]
        objs.append(prism('select', rr(cx - 0.55, 2.05, 1.1, 0.32, 0.16), T - 0.05, T + 0.2, plastic('#6f7079', 0.6), bevel=0.06))
    # Grille du haut-parleur (fentes en diagonale)
    for i in range(6):
        x = 6.0 + i * 0.36
        objs.append(prism('fente', [(x, 0.55), (x + 0.16, 0.55), (x + 0.86, 2.15), (x + 0.7, 2.15)], T - 0.02, T + 0.01, plastic('#4a4844')))
    group(objs, Matrix.Translation((9.0, 4.0, 0)) @ standing(14) @ Matrix.Translation((-W / 2, 0, 0)))


def handheld_buttons(objs, T, dpad, buttons, color_dpad='#1d1d20', color_btn='#2a2a2e', r=0.5, dpad_size=2.2):
    """Croix et boutons ronds d'une portable posée à plat (face vers +z)."""
    objs.append(prism('croix', cross_pts(dpad[0], dpad[1], dpad_size, dpad_size * 0.36), T - 0.05, T + 0.3, plastic(color_dpad, 0.4), bevel=0.07))
    for cx, cy in buttons:
        objs.append(cyl('bouton', cx, cy, T - 0.05, T + 0.28, r, plastic(color_btn, 0.35), bevel=0.12))


def nes():
    """NES (NES-001) : 25,6 × 20,3 × 8,5 cm ; dessus gris clair sur les deux tiers gauches,
    bande noire puis partie striée gris foncé à droite ; façade : la trappe de la cartouche en
    haut, un bandeau gris foncé en bas avec Power, Reset (et son voyant) et deux ports manette."""
    light, darkg, black = plastic('#c8c7c2', 0.5), plastic('#5b5c61', 0.55), plastic('#1f1f22', 0.5)
    W, D, H, HB = 25.6, 20.3, 8.5, 3.6
    box('socle', 0, 0, 0, W, D, HB, darkg, bevel=0.25)
    box('dessus', 0, 0, HB, 16.6, D, H, light, bevel=0.3)
    box('bande', 16.6, 0, HB, 19.0, D, H, black, bevel=0.2)
    box('stries-fond', 19.0, 0, HB, W, D, H - 0.15, darkg, bevel=0.25)
    for i in range(26):
        y = 0.6 + i * 0.74
        box('strie', 19.3, y, H - 0.2, W - 0.3, y + 0.42, H, darkg, bevel=0.08)
    # Trappe de la cartouche (façade, haut) et son contour
    box('trappe-contour', 1.2, -0.06, HB + 0.5, 15.4, 0.1, H - 0.5, plastic('#8f8e8a'), bevel=0.05)
    box('trappe', 1.35, -0.1, HB + 0.65, 15.25, 0.1, H - 0.65, light, bevel=0.1)
    # Bandeau bas : Power, Reset, voyant ; ports manette à droite
    for x in (2.0, 5.4):
        box('bouton', x, -0.25, 1.1, x + 2.6, 0.1, 2.4, black, bevel=0.15)
    box('voyant', 8.6, -0.08, 1.6, 9.2, 0.1, 2.0, led('#ff2a2a', 2.5))
    for x in (18.1, 21.6):
        box('port', x, -0.08, 0.9, x + 2.6, 0.1, 2.7, plastic('#2a2a2d', 0.6), bevel=0.2)


def fds():
    """Famicom Disk System (lecteur HVC-022) : boîtier rouge, 15 × 26,5 × 7,5 cm ; en façade,
    la fente de la disquette (volet noir) en haut, le bouton d'éjection noir et le voyant."""
    red, black = plastic('#9e2126', 0.45), plastic('#1e1e21', 0.5)
    W, D, H = 15.0, 26.5, 7.6
    box('corps', 0, 0, 0, W, D, H, red, bevel=0.45)
    box('cadre-fente', 1.4, -0.06, 3.6, W - 1.4, 0.2, 6.6, plastic('#7a171b', 0.5), bevel=0.25)
    box('fente', 2.0, -0.1, 4.4, W - 2.0, 0.2, 5.8, black, bevel=0.15)
    box('ejection', W - 4.2, -0.2, 1.1, W - 1.4, 0.1, 2.5, black, bevel=0.2)
    box('voyant', 1.6, -0.08, 1.6, 2.4, 0.1, 2.1, led('#ff3b30', 2))
    for i in range(6):
        box('grille', 2.5 + i * 1.0, D - 5.0, H - 0.02, 2.9 + i * 1.0, D - 1.2, H + 0.02, plastic('#6e1418'))


def snes():
    """Super Nintendo (modèle européen et japonais) : 20 × 24,2 × 7,2 cm, gris clair arrondi ;
    sur le dessus, la fente de cartouche entourée de gris foncé, l'interrupteur Power et le
    bouton Reset devant elle, l'éjection derrière ; deux ports manette en façade."""
    body, dark, mid, lilac = plastic('#cfcfd2', 0.5), plastic('#55555c', 0.55), plastic('#a7a7ad', 0.5), plastic('#7f7a95', 0.45)
    W, D = 20.0, 24.2
    prism('socle', rr(0, 0, W, D, 3.2), 0, 3.6, body, bevel=0.6)
    prism('dessus', rr(0.3, 0.6, W - 0.6, D - 1.2, 3.0), 3.4, 6.2, body, bevel=0.9, top_pts=rr(1.2, 1.6, W - 2.4, D - 3.2, 2.6))
    # Fente de cartouche (et son volet), entourée de gris foncé
    prism('entourage', rr(5.0, 11.0, 10.0, 9.0, 1.4), 6.0, 6.35, dark, bevel=0.25)
    box('fente', 6.0, 14.2, 6.3, 14.0, 15.6, 6.4, plastic('#2a2a2e', 0.6))
    box('volet', 6.2, 15.6, 6.3, 13.8, 19.2, 6.55, mid, bevel=0.15)
    # Power (glissière) et Reset (bouton), éjection
    box('power', 3.0, 7.0, 6.1, 6.4, 9.4, 6.55, lilac, bevel=0.2, r=0.4)
    box('reset', 13.6, 7.0, 6.1, 17.0, 9.4, 6.55, lilac, bevel=0.2, r=0.4)
    box('ejection', 15.8, 13.4, 6.1, 18.0, 18.2, 6.6, lilac, bevel=0.2, r=0.5)
    cyl('voyant', 4.7, 5.6, 6.05, 6.25, 0.18, led('#ff3030', 2.5))
    for x in (6.0, 11.0):
        box('port', x, -0.06, 1.0, x + 3.0, 0.4, 2.6, dark, bevel=0.3)


def n64():
    """Nintendo 64 : 26 × 19 × 7,3 cm, gris anthracite ; un dôme central (fente de cartouche,
    Power et Reset de part et d'autre, trappe de l'extension devant) et deux ailes en pente ;
    quatre ports manette en façade."""
    body, dark, mid = plastic('#2c2d32', 0.5), plastic('#17171a', 0.6), plastic('#4a4b52', 0.5)
    W, D = 26.0, 19.0
    profile('ailes', [(0.4, 0), (D, 0), (D, 4.2), (D - 1.0, 4.9), (2.4, 4.0), (0, 2.6)], 0, W, body, bevel=0.5)
    prism('dome', rr(5.5, 2.0, 15.0, 16.4, 3.5), 2.6, 7.3, body, bevel=1.2, top_pts=rr(7.2, 5.5, 11.6, 11.6, 2.6))
    box('fente', 9.6, 10.6, 7.25, 16.4, 12.2, 7.35, dark)
    box('volet', 9.7, 12.2, 7.2, 16.3, 14.6, 7.45, mid, bevel=0.15)
    for x in (7.0, 17.2):
        box('glissiere', x, 9.6, 7.0, x + 1.8, 13.4, 7.5, mid, bevel=0.2, r=0.3)
    box('trappe', 9.2, 4.0, 5.7, 16.8, 6.6, 5.9, plastic('#33343a', 0.45), bevel=0.2)
    box('bandeau', 3.0, -0.04, 0.4, W - 3.0, 0.3, 2.2, dark, bevel=0.15)
    for i in range(4):
        x = 4.2 + i * 4.6
        box('port', x, -0.08, 0.6, x + 3.0, 0.3, 2.0, plastic('#4c4d55', 0.6), bevel=0.25)


def gamecube():
    """GameCube : 15 × 16,1 × 11 cm, violet indigo, cube aux arêtes arrondies ; couvercle rond
    sur le dessus, poignée à l'arrière, quatre ports manette noirs en façade, boutons sur le dessus."""
    body, dark = plastic('#4c3f8f', 0.42), plastic('#1c1a24', 0.6)
    W, D, H = 15.0, 16.1, 11.0
    box('corps', 0, 0, 0, W, D, H - 0.4, body, bevel=0.9)
    cyl('couvercle', W / 2, D / 2 + 0.6, H - 0.6, H, 6.2, body, bevel=0.35)
    cyl('rainure', W / 2, D / 2 + 0.6, H - 0.48, H - 0.38, 6.35, dark)
    for x, r in ((2.0, 0.55), (W - 2.0, 0.55)):
        cyl('bouton', x, 2.0, H - 0.5, H - 0.25, r, plastic('#5a4ca4', 0.4), bevel=0.12)
    cyl('ouvrir', W / 2, 2.0, H - 0.5, H - 0.3, 0.55, plastic('#5a4ca4', 0.4), bevel=0.12)
    # Poignée à l'arrière : un arceau
    for x in (1.4, W - 1.4):
        box('poignee-pied', x - 0.7, D - 0.2, 5.6, x + 0.7, D + 3.0, 7.0, body, bevel=0.5)
    box('poignee', 0.7, D + 1.8, 5.6, W - 0.7, D + 3.0, 7.0, body, bevel=0.5)
    for i in range(4):
        x = 1.3 + i * 3.25
        box('port', x, -0.08, 1.0, x + 2.6, 0.3, 2.6, dark, bevel=0.3)


def gbc():
    """Game Boy Color : 7,5 × 13,3 × 2,7 cm, violet translucide ; grand cadre noir autour de
    l'écran, croix, A et B, Start et Select, six trous de haut-parleur ; bas arrondi."""
    body = material('#6b4fa3', 0.3, transmission=0.35, coat=0.3)
    objs = []
    W, Hh, T = 7.5, 13.3, 2.7
    objs.append(prism('corps', rr(0, 0, W, Hh, [1.6, 1.6, 0.4, 0.4]), 0, T, body, bevel=0.3))
    objs.append(prism('cadre', rr(0.45, 6.5, 6.6, 6.0, [0.4, 1.0, 0.4, 0.4]), T - 0.02, T + 0.05, plastic('#1c1c22', 0.35), bevel=0.04))
    objs.append(box('ecran', 1.45, 7.15, T + 0.05, 6.05, 11.2, T + 0.09, screen('#1a2420')))
    objs.append(cyl('voyant', 0.95, 10.4, T + 0.05, T + 0.09, 0.13, led('#ff5040', 1.5)))
    handheld_buttons(objs, T, (1.9, 4.0), ((5.1, 3.65), (6.35, 4.35)), color_dpad='#2a2440', color_btn='#3d2f66', r=0.48, dpad_size=1.9)
    for cx in (3.1, 4.4):
        objs.append(prism('select', rr(cx - 0.45, 1.7, 0.9, 0.28, 0.14), T - 0.05, T + 0.16, plastic('#2a2440'), bevel=0.05))
    for i in range(6):
        objs.append(cyl('trou', 5.3 + (i % 3) * 0.5, 0.9 + (i // 3) * 0.5, T - 0.02, T + 0.01, 0.13, plastic('#241a3a')))
    group(objs, Matrix.Translation((0, 4.0, 0)) @ standing(14) @ Matrix.Translation((-W / 2, 0, 0)))


def gba():
    """Game Boy Advance : 14,45 × 8,2 × 2,45 cm, indigo, à l'horizontale, bouts arrondis ;
    écran au centre, croix à gauche, A et B gris clair à droite, gâchettes L et R."""
    body = plastic('#40398f', 0.4)
    objs = []
    W, Hh, T = 14.45, 8.2, 2.45
    objs.append(prism('corps', rr(0, 0, W, Hh, [3.4, 3.4, 2.2, 2.2]), 0, T, body, bevel=0.35))
    objs.append(prism('cadre', rr(3.55, 1.7, 7.35, 5.6, 0.45), T - 0.02, T + 0.05, plastic('#22202e', 0.35), bevel=0.04))
    objs.append(box('ecran', 4.4, 2.35, T + 0.05, 10.05, 6.45, T + 0.09, screen('#1a1d22')))
    handheld_buttons(objs, T, (1.9, 4.6), ((12.1, 4.9), (13.0, 5.6)), color_dpad='#2c2a3a', color_btn='#c9c8cf', r=0.45, dpad_size=1.8)
    for x0 in (0.6, W - 3.4):
        objs.append(box('gachette', x0, Hh - 0.4, 0.4, x0 + 2.8, Hh + 0.15, T - 0.3, plastic('#2f2a6a'), bevel=0.2))
    for cx in (12.3, 13.1):
        objs.append(cyl('start', cx, 1.2, T - 0.05, T + 0.12, 0.2, plastic('#c9c8cf'), bevel=0.05))
    group(objs, Matrix.Translation((0, 4.0, 0)) @ standing(16) @ Matrix.Translation((-W / 2, 0, 0)))


def clamshell(W, D, T, color, inner, lower_screen, upper_screen, buttons, dpad, extra=None, angle=118):
    """Portable à clapet ouverte : la moitié basse posée à plat, la haute relevée."""
    shell = plastic(color, 0.38)
    inner_mat = plastic(inner, 0.45)
    prism('bas', rr(0, 0, W, D, 0.9), 0, T, shell, bevel=0.25)
    prism('bas-face', rr(0.25, 0.25, W - 0.5, D - 0.5, 0.75), T - 0.02, T + 0.03, inner_mat, bevel=0.03)
    x0, y0, w, h = lower_screen
    box('ecran-bas', x0, y0, T + 0.03, x0 + w, y0 + h, T + 0.07, screen())
    prism('croix', cross_pts(dpad[0], dpad[1], 1.6, 0.55), T, T + 0.22, plastic('#222226'), bevel=0.05)
    for cx, cy in buttons:
        cyl('bouton', cx, cy, T, T + 0.2, 0.3, plastic('#2a2a2e'), bevel=0.08)
    if extra:
        extra(T)
    top = []
    top.append(prism('haut', rr(0, 0, W, D, 0.9), 0, T * 0.8, shell, bevel=0.25))
    top.append(prism('haut-face', rr(0.25, 0.25, W - 0.5, D - 0.5, 0.75), T * 0.8 - 0.02, T * 0.8 + 0.03, inner_mat, bevel=0.03))
    x0, y0, w, h = upper_screen
    top.append(box('ecran-haut', x0, y0, T * 0.8 + 0.03, x0 + w, y0 + h, T * 0.8 + 0.07, screen()))
    # La moitié haute, relevée à la charnière (bord arrière du bas), l'écran vers nous
    group(top, Matrix.Translation((0, D - 0.15, T * 0.9)) @ standing(angle - 90))


def nds():
    """Nintendo DS (2004) : ouverte, coque argentée, intérieur gris foncé ; deux écrans,
    croix à gauche, quatre boutons à droite, haut-parleurs de part et d'autre de l'écran du haut."""
    clamshell(14.8, 8.5, 1.45, '#c6c9cf', '#3a3c42', (4.6, 1.5, 5.6, 4.3), (4.6, 2.0, 5.6, 4.3),
              [(11.9, 4.4), (12.6, 3.7), (12.6, 5.1), (13.3, 4.4)], (2.6, 4.4))


def n3ds():
    """Nintendo 3DS : ouverte, bleu aqua ; écran du haut plus large, pad circulaire au-dessus de la
    croix, quatre boutons, rangée de boutons sous l'écran du bas."""
    def pad(T):
        cyl('pad', 2.3, 5.3, T, T + 0.2, 0.75, plastic('#2a2d33'), bevel=0.1)
        for i in range(3):
            box('menu', 4.6 + i * 1.5, 0.35, T, 5.6 + i * 1.5, 0.6, T + 0.1, plastic('#bfc6cc'), bevel=0.04)
    clamshell(13.4, 7.4, 1.05, '#1d9fc9', '#202227', (4.1, 1.0, 5.2, 3.9), (2.6, 1.0, 8.2, 4.9),
              [(10.9, 4.3), (11.6, 3.6), (11.6, 5.0), (12.3, 4.3)], (2.3, 2.9), extra=pad)


def ps2():
    """PlayStation 2 (premier modèle) : 30,1 × 17,8 × 7,8 cm, noir mat ; le dessus strié de
    rainures parallèles ; en façade, la fente du tiroir à disque en haut, deux ports manette
    et deux fentes de carte mémoire en bas à gauche, Reset et Éjection (voyants) à droite ;
    le bloc de droite, en retrait, marqué d'une rainure verticale."""
    body, dark, groove = plastic('#1c1c1f', 0.55), plastic('#0d0d0f', 0.6), plastic('#2a2a2e', 0.5)
    W, D, H = 30.1, 17.8, 7.8
    box('corps', 0, 0, 0.6, W, D, H, body, bevel=0.25)
    box('pieds', 0.8, 0.8, 0, W - 0.8, D - 0.8, 0.7, dark, bevel=0.1)
    for i in range(14):
        y = 1.0 + i * 1.15
        box('rainure', 0.6, y, H - 0.03, W - 4.6, y + 0.28, H + 0.01, dark)
    box('bloc', W - 4.2, -0.02, 0.6, W - 4.05, D, H + 0.01, dark)
    box('tiroir', 1.0, -0.05, 5.0, W - 5.0, 0.1, 6.6, groove, bevel=0.1)
    box('fente', 1.4, -0.08, 5.5, W - 5.4, 0.1, 5.75, dark)
    for x in (1.6, 6.0):
        box('port', x, -0.08, 1.4, x + 3.6, 0.1, 2.9, dark, bevel=0.2)
        box('carte', x + 0.4, -0.08, 3.4, x + 3.2, 0.1, 3.75, dark)
    for z, color in ((5.3, '#2fd86a'), (3.6, '#3d8cff')):
        box('bouton', W - 3.3, -0.12, z - 0.5, W - 1.2, 0.1, z + 0.5, groove, bevel=0.15)
        box('voyant', W - 3.6, -0.13, z - 0.1, W - 3.4, 0.1, z + 0.1, led(color, 3))


def ps3():
    """PlayStation 3 (premier modèle) : 32,5 × 27,4 × 9,8 cm, noir brillant, en forme de
    lentille (dessus et dessous bombés, nez arrondi) ; un liseré argenté tout autour ;
    sous la lèvre de la coque, la fente du lecteur et les boutons tactiles."""
    shell, silver, dark = glossy('#0d0d10'), metal('#b9bcc2', 0.25), plastic('#141417', 0.5)
    W, D = 32.5, 27.4
    prof = [(0.0, 4.6), (0.5, 3.2), (2.0, 2.2), (D - 2.0, 2.2), (D - 0.4, 3.2), (D, 4.6), (D - 0.6, 6.6), (D - 4, 8.8), (D * 0.55, 9.8), (5.0, 9.2), (1.2, 7.4)]
    profile('coque', prof, 0, W, shell, bevel=1.2, angle=25)
    profile('dessous', [(1.0, 0.0), (D - 1.0, 0.0), (D - 1.4, 2.4), (1.4, 2.4)], 1.4, W - 1.4, dark, bevel=0.6)
    profile('liseré', [(0.02, 4.4), (D - 0.02, 4.4), (D - 0.02, 4.75), (0.02, 4.75)], -0.05, W + 0.05, silver, bevel=0.05)
    box('fente', 3.0, -0.05, 5.3, 15.0, 0.6, 5.6, plastic('#050506', 0.6))
    for x in (W - 6.0, W - 3.6):
        box('touche', x, -0.02, 5.2, x + 1.6, 0.4, 5.7, glossy('#1a1a1e'))


def ps4():
    """PlayStation 4 (premier modèle) : 27,5 × 30,5 × 5,3 cm, parallélogramme vu de côté (façade
    et dos inclinés) ; deux étages séparés par une fente sombre, le dessus brillant sur le tiers
    gauche et mat ailleurs, la barre lumineuse dans la rainure qui les sépare."""
    matte_b, shiny, dark = plastic('#151518', 0.6), glossy('#111114'), plastic('#050506', 0.7)
    W, D = 27.5, 30.5
    profile('bas', [(1.4, 0.4), (D - 1.4, 0.4), (D - 0.6, 2.6), (2.2, 2.6)], 0, W, matte_b, bevel=0.2)
    profile('pied', [(3.0, 0), (D - 3.0, 0), (D - 3.0, 0.5), (3.0, 0.5)], 1.0, W - 1.0, dark)
    profile('fente', [(2.4, 2.55), (D - 0.5, 2.55), (D - 0.45, 2.85), (2.5, 2.85)], 0.2, W - 0.2, dark)
    profile('haut-brillant', [(2.6, 2.8), (D - 0.4, 2.8), (D + 0.4, 5.3), (3.4, 5.3)], 0, 9.2, shiny, bevel=0.2)
    profile('haut-mat', [(2.6, 2.8), (D - 0.4, 2.8), (D + 0.4, 5.3), (3.4, 5.3)], 9.45, W, matte_b, bevel=0.2)
    profile('barre', [(3.0, 5.28), (D, 5.28), (D, 5.32), (3.0, 5.32)], 9.2, 9.45, led('#3d7bff', 6))


def ps5():
    """PlayStation 5 : debout, 39 × 10,4 × 26 cm ; deux grandes ailes blanches qui s'évasent vers
    le haut de part et d'autre d'un cœur noir brillant, la lumière bleue le long du cœur ; posée
    sur son socle noir rond."""
    white, core, dark = plastic('#f3f3f1', 0.35), glossy('#121216'), plastic('#0b0b0d', 0.6)
    D, H = 26.0, 39.0
    wing = [(2.2, 1.0), (D - 2.2, 1.0), (D - 0.5, 4.5), (D + 0.6, 30.0), (D - 1.5, H), (1.5, H), (-0.6, 30.0), (0.5, 4.5)]
    profile('cœur', [(1.0, 1.0), (D - 1.0, 1.0), (D - 1.0, H - 1.6), (1.0, H - 1.6)], 2.0, 8.4, core, bevel=0.4)
    profile('aile-gauche', wing, 0.0, 2.0, white, bevel=0.5)
    profile('aile-droite', wing, 8.4, 10.4, white, bevel=0.5)
    for x in (1.95, 8.35):
        profile('lumiere', [(2.0, 2.0), (2.15, 2.0), (2.15, H - 2.4), (2.0, H - 2.4)], x, x + 0.1, led('#4a86ff', 5))
    cyl('socle', 5.2, D / 2, 0, 1.0, 6.5, dark, bevel=0.2)
    box('fente', 3.2, -0.03, H - 9.0, 7.2, 1.2, H - 8.7, dark)


def psp():
    """PSP (2004) : 17 × 7,4 × 2,3 cm, noir brillant, en gélule ; grand écran au centre, croix à
    gauche avec le petit stick en dessous, quatre boutons à droite, rangée de boutons en bas."""
    shell = glossy('#101013')
    objs = []
    W, Hh, T = 17.0, 7.4, 2.3
    objs.append(prism('corps', rr(0, 0, W, Hh, [3.0, 3.0, 3.0, 3.0]), 0, T, shell, bevel=0.45))
    objs.append(box('ecran', 3.9, 1.1, T - 0.02, 13.1, 6.3, T + 0.05, screen('#07080a')))
    objs.append(prism('croix', cross_pts(2.0, 4.6, 1.9, 0.62), T - 0.05, T + 0.18, plastic('#3a3a40', 0.4), bevel=0.05))
    objs.append(cyl('stick', 1.9, 2.2, T - 0.05, T + 0.22, 0.5, plastic('#4a4a50', 0.6), bevel=0.12))
    for cx, cy in ((15.0, 5.5), (14.2, 4.7), (15.8, 4.7), (15.0, 3.9)):
        objs.append(cyl('bouton', cx, cy, T - 0.05, T + 0.18, 0.36, plastic('#2c2c31', 0.4), bevel=0.1))
    for i in range(4):
        objs.append(box('menu', 5.0 + i * 1.9, 0.35, T - 0.04, 6.2 + i * 1.9, 0.7, T + 0.08, plastic('#3a3a40'), bevel=0.05))
    group(objs, Matrix.Translation((0, 4.0, 0)) @ standing(16) @ Matrix.Translation((-W / 2, 0, 0)))


def psv():
    """PS Vita (2011) : 18,2 × 8,4 × 1,9 cm, noir, bouts arrondis ; grand écran, deux sticks,
    croix à gauche, quatre boutons à droite."""
    shell = glossy('#121216')
    objs = []
    W, Hh, T = 18.2, 8.4, 1.9
    objs.append(prism('corps', rr(0, 0, W, Hh, [4.0, 4.0, 4.0, 4.0]), 0, T, shell, bevel=0.4))
    objs.append(box('ecran', 4.3, 1.0, T - 0.02, 13.9, 7.4, T + 0.05, screen('#06070a')))
    objs.append(prism('croix', cross_pts(2.2, 5.4, 1.7, 0.55), T - 0.05, T + 0.16, plastic('#2d2d33'), bevel=0.05))
    for cx in (2.9, 15.3):
        objs.append(cyl('stick', cx, 2.6, T - 0.05, T + 0.35, 0.55, plastic('#2a2a30', 0.6), bevel=0.15))
    for cx, cy in ((16.0, 6.2), (15.3, 5.5), (16.7, 5.5), (16.0, 4.8)):
        objs.append(cyl('bouton', cx, cy, T - 0.05, T + 0.16, 0.32, plastic('#2c2c31'), bevel=0.08))
    group(objs, Matrix.Translation((0, 4.0, 0)) @ standing(16) @ Matrix.Translation((-W / 2, 0, 0)))


def wii():
    """Wii : debout sur son socle, 4,4 × 21,5 × 15,7 cm, blanc brillant ; en façade, la fente du
    disque (lumière bleue), le bouton Power et la trappe des ports en bas."""
    white, grey = glossy('#f4f4f2'), plastic('#c9ccd1', 0.4)
    W, D, H = 4.4, 21.5, 15.7
    box('socle', -1.6, 3.0, 0, W + 1.6, D - 3.0, 0.9, material('#d8dbe0', 0.25, transmission=0.4), bevel=0.3, r=0.6)
    box('corps', 0, 0, 0.9, W, D, H + 0.9, white, bevel=0.45)
    box('fente', 1.95, -0.06, 4.5, 2.45, 0.2, 14.2, plastic('#0d0d10'))
    box('lueur', 1.9, -0.07, 4.4, 2.5, 0.05, 14.3, led('#5aa8ff', 1.5))
    box('trappe', 0.5, -0.04, 1.3, W - 0.5, 0.15, 3.6, grey, bevel=0.1)
    cyl('power', W / 2, 15.2, 0, 0, 0.0, white) if False else box('power', 1.2, -0.08, 15.0, 3.2, 0.1, 15.8, grey, bevel=0.1)


def wiiu():
    """Wii U : console noire brillante aux bouts arrondis (26,8 × 17,2 × 4,6 cm), et devant elle
    sa manette-écran (GamePad), noire, deux sticks, croix et quatre boutons."""
    black, dark = glossy('#0f0f12'), plastic('#1b1b1f', 0.5)
    prism('console', rr(0, 6.0, 26.8, 17.2, [3.0, 3.0, 3.0, 3.0]), 0, 4.6, black, bevel=0.6)
    box('fente', 6.0, 5.95, 3.4, 20.0, 6.3, 3.6, plastic('#050506'))
    objs = []
    W, Hh, T = 25.5, 13.3, 2.4
    objs.append(prism('gamepad', rr(0, 0, W, Hh, [5.0, 5.0, 3.0, 3.0]), 0, T, black, bevel=0.5))
    objs.append(box('ecran', 6.8, 2.0, T - 0.02, 18.7, 11.0, T + 0.05, screen('#07080a')))
    for cx in (3.2, 22.3):
        objs.append(cyl('stick', cx, 9.6, T - 0.05, T + 0.45, 0.85, dark, bevel=0.2))
    objs.append(prism('croix', cross_pts(3.3, 5.6, 2.0, 0.65), T - 0.05, T + 0.2, dark, bevel=0.05))
    for cx, cy in ((22.3, 6.6), (21.4, 5.7), (23.2, 5.7), (22.3, 4.8)):
        objs.append(cyl('bouton', cx, cy, T - 0.05, T + 0.2, 0.4, dark, bevel=0.1))
    group(objs, Matrix.Translation((14.0, -2.0, 0)) @ standing(30) @ Matrix.Translation((-W / 2, 0, 0)))


def switch(left='#18b4dc', right='#ff4d52', W=17.3, Hh=10.2, joy=3.6, T=1.4, accents=None):
    """Switch en mode portable : l'écran entre deux Joy-Con de couleur (sticks, croix en
    quatre boutons, A B X Y)."""
    objs = []
    objs.append(prism('tablette', rr(joy, 0, W, Hh, 0.3), 0, T, plastic('#1a1a1e', 0.35), bevel=0.15))
    objs.append(box('ecran', joy + 1.1, 0.75, T - 0.02, joy + W - 1.1, Hh - 0.75, T + 0.05, screen('#06070a')))
    for side, color in (('gauche', left), ('droite', right)):
        x0 = 0 if side == 'gauche' else joy + W
        radii = [1.6, 0.1, 0.1, 1.6] if side == 'gauche' else [0.1, 1.6, 1.6, 0.1]
        objs.append(prism('joycon', rr(x0, 0, joy, Hh, radii), 0, T, plastic(color, 0.38), bevel=0.25))
        cx = x0 + joy / 2
        stick_y, buttons_y = (7.2, 3.6) if side == 'gauche' else (3.4, 7.1)
        objs.append(cyl('stick', cx, stick_y, T - 0.05, T + 0.45, 0.72, plastic('#1f1f23', 0.6), bevel=0.15))
        if accents:
            objs.append(cyl('anneau', cx, stick_y, T - 0.04, T + 0.02, 0.95, plastic(accents[0 if side == 'gauche' else 1], 0.4)))
        for dx, dy in ((0, 0.7), (-0.7, 0), (0.7, 0), (0, -0.7)):
            objs.append(cyl('bouton', cx + dx, buttons_y + dy, T - 0.05, T + 0.15, 0.3, plastic('#232327', 0.4), bevel=0.08))
    group(objs, Matrix.Translation((0, 4.0, 0)) @ standing(16) @ Matrix.Translation((-(W + 2 * joy) / 2, 0, 0)))


def nsw():
    """Nintendo Switch (2017) en mode portable : Joy-Con bleu néon à gauche, rouge néon à droite."""
    switch()


def nsw2():
    """Nintendo Switch 2 (2025) en mode portable : plus grande, Joy-Con gris foncé avec une
    touche de bleu et de rouge autour des sticks."""
    switch(left='#2b2c31', right='#2b2c31', W=20.4, Hh=11.6, joy=3.5, T=1.4, accents=('#1fb3e6', '#ff4b4f'))


def master_system():
    """Master System (premier modèle) : 36,5 × 17 × 7 cm, noire et anguleuse ; le dessus monte
    vers l'arrière, quadrillé de fines rainures ; liserés rouges, fente de cartouche au milieu,
    fente de carte en façade, boutons Pause et Reset rouges."""
    black, red, dark = plastic('#151517', 0.5), plastic('#c8202a', 0.45), plastic('#0a0a0b', 0.6)
    W, D = 36.5, 17.0
    profile('corps', [(0, 0), (D, 0), (D, 7.0), (D - 1.0, 7.0), (2.5, 4.6), (0, 4.2)], 0, W, black, bevel=0.25)
    for i in range(9):
        y = 3.6 + i * 1.4
        z = 4.6 + (y - 2.5) / (D - 3.5) * 2.4
        profile('rainure', [(y, z - 0.02), (y + 0.18, z + 0.01), (y + 0.18, z + 0.05), (y, z + 0.03)], 0.6, W - 0.6, dark)
    profile('liseré', [(0.0, 4.15), (2.5, 4.55), (2.5, 4.72), (0.0, 4.32)], 0.0, W, red)
    box('fente', 12.0, 9.5, 5.9, 24.5, 11.0, 6.6, dark)
    box('carte', 3.0, -0.05, 2.0, 10.0, 0.2, 2.5, dark)
    for x in (27.5, 31.0):
        box('bouton', x, 4.0, 5.0, x + 2.2, 5.6, 5.6, red, bevel=0.15)
    box('voyant', 25.6, 3.4, 4.9, 26.2, 3.8, 5.1, led('#ff2020', 2))


def mega_drive():
    """Mega Drive (premier modèle) : 28 × 21,2 × 7 cm, noire ; au centre, le dôme rond de la fente
    de cartouche et son anneau ; curseur de volume, interrupteur et Reset, deux ports manette."""
    black, dark, ring = plastic('#141416', 0.45), plastic('#070708', 0.6), plastic('#2b2b30', 0.4)
    W, D = 28.0, 21.2
    prism('corps', rr(0, 0, W, D, [0.8, 0.8, 4.0, 4.0]), 0, 4.8, black, bevel=0.5)
    cyl('dome', 14.0, 11.0, 4.6, 6.4, 8.0, black, bevel=0.9)
    cyl('anneau', 14.0, 11.0, 6.35, 6.5, 6.2, ring)
    cyl('fond', 14.0, 11.0, 6.45, 6.55, 5.6, black)
    box('fente', 9.0, 10.3, 6.5, 19.0, 11.7, 6.6, dark)
    box('volet', 9.2, 11.7, 6.5, 18.8, 12.4, 6.7, ring, bevel=0.1)
    box('volume', 2.0, 0.8, 4.75, 4.6, 2.2, 5.0, dark, bevel=0.1)
    box('power', 3.0, 9.0, 4.75, 5.6, 11.0, 5.2, ring, bevel=0.15)
    box('reset', 22.4, 9.0, 4.75, 25.0, 11.0, 5.2, ring, bevel=0.15)
    box('voyant', 3.6, 12.2, 4.75, 4.0, 12.6, 4.9, led('#ff2a2a', 2))
    for x in (18.6, 22.8):
        box('port', x, -0.08, 1.0, x + 3.4, 0.2, 2.8, dark, bevel=0.2)
    for i in range(10):
        box('grille', 3.0 + i * 0.6, D - 4.5, 4.78, 3.3 + i * 0.6, D - 1.6, 4.82, dark)


def game_gear():
    """Game Gear : 20,9 × 11,3 × 3,8 cm, noire, à l'horizontale ; écran au centre dans un cadre,
    croix ronde à gauche, boutons 1 et 2 à droite, Start bleu."""
    body, frame = plastic('#17171a', 0.45), plastic('#26262a', 0.4)
    objs = []
    W, Hh, T = 20.9, 11.3, 3.8
    objs.append(prism('corps', rr(0, 0, W, Hh, [3.2, 3.2, 2.2, 2.2]), 0, T, body, bevel=0.6))
    objs.append(prism('cadre', rr(5.6, 1.3, 9.7, 8.6, 0.6), T - 0.03, T + 0.06, frame, bevel=0.05))
    objs.append(box('ecran', 6.6, 2.3, T + 0.06, 14.3, 8.7, T + 0.1, screen('#0a0c10')))
    objs.append(cyl('pad', 2.9, 5.0, T - 0.05, T + 0.15, 1.4, plastic('#222226'), bevel=0.15))
    objs.append(prism('croix', cross_pts(2.9, 5.0, 2.0, 0.65), T + 0.1, T + 0.3, plastic('#0f0f11'), bevel=0.05))
    for cx, cy in ((17.3, 4.4), (18.9, 5.4)):
        objs.append(cyl('bouton', cx, cy, T - 0.05, T + 0.3, 0.62, plastic('#2c2c31'), bevel=0.15))
    objs.append(cyl('start', 18.2, 8.3, T - 0.05, T + 0.2, 0.35, plastic('#2d63c8'), bevel=0.08))
    group(objs, Matrix.Translation((0, 4.0, 0)) @ standing(16) @ Matrix.Translation((-W / 2, 0, 0)))


def saturn():
    """Saturn (modèle européen) : 26 × 23 × 8,3 cm, noire ; grand couvercle ovale du lecteur de CD
    sur le dessus, boutons Power, Reset et Ouvrir à droite, deux ports manette en façade."""
    black, dark, grey = plastic('#18181b', 0.45), plastic('#09090a', 0.6), plastic('#2e2e33', 0.45)
    W, D = 26.0, 23.0
    prism('corps', rr(0, 0, W, D, 2.0), 0, 6.8, black, bevel=0.6, top_pts=rr(0.4, 0.4, W - 0.8, D - 0.8, 1.8))
    prism('couvercle', rr(3.0, 4.0, 15.6, 15.6, 7.0), 6.7, 8.3, black, bevel=0.7)
    prism('rainure', rr(2.8, 3.8, 16.0, 16.0, 7.2), 6.7, 6.85, dark)
    for name, y in (('power', 15.0), ('reset', 11.6)):
        box(name, 20.5, y, 6.7, 24.0, y + 2.0, 7.1, grey, bevel=0.2, r=0.5)
    cyl('ouvrir', 22.25, 6.8, 6.7, 7.15, 1.2, grey, bevel=0.2)
    for x in (5.0, 9.2):
        box('port', x, -0.08, 1.4, x + 3.4, 0.2, 3.2, dark, bevel=0.2)


def dreamcast():
    """Dreamcast : 19 × 19,5 × 7,8 cm, blanche ; couvercle rond sur le dessus, boutons Ouvrir et
    Power ronds devant, quatre ports manette en façade."""
    white, grey, dark = plastic('#ecebe6', 0.42), plastic('#cfcfcc', 0.45), plastic('#4a4a4e', 0.55)
    W, D = 19.0, 19.5
    prism('corps', rr(0, 0, W, D, 1.4), 0, 6.6, white, bevel=0.7, top_pts=rr(0.3, 0.6, W - 0.6, D - 0.9, 1.2))
    cyl('couvercle', W / 2, 11.0, 6.5, 7.4, 7.3, white, bevel=0.6)
    cyl('rainure', W / 2, 11.0, 6.5, 6.62, 7.5, grey)
    for x in (4.0, 15.0):
        cyl('bouton', x, 2.6, 6.5, 6.95, 1.05, grey, bevel=0.2)
    box('voyant', 15.0 - 0.2, 4.3, 6.55, 15.2, 4.6, 6.65, led('#ff8a2a', 2))
    box('bandeau', 1.2, -0.05, 0.4, W - 1.2, 0.3, 2.6, grey, bevel=0.15)
    for i in range(4):
        x = 2.0 + i * 4.0
        box('port', x, -0.1, 0.8, x + 3.0, 0.2, 2.2, dark, bevel=0.2)


def xbox():
    """Xbox (2001) : 32,4 × 26 × 10 cm, noire et massive ; au centre du dessus, le gros bijou rond
    vert translucide (sans le X) ; tiroir du disque en façade, boutons Power et Éjection, quatre
    ports manette en bas."""
    black, dark = plastic('#141416', 0.45), plastic('#060607', 0.6)
    W, D = 32.4, 26.0
    prism('corps', rr(0, 0, W, D, 2.5), 0, 8.6, black, bevel=0.8, top_pts=rr(1.5, 1.8, W - 3.0, D - 3.6, 2.0))
    prism('bosse', rr(9.0, 6.0, 14.4, 14.0, 6.0), 8.4, 10.0, black, bevel=1.0)
    cyl('bijou', W / 2, 13.0, 9.8, 10.5, 4.4, material('#3fb33a', 0.15, transmission=0.6, coat=0.8, emit='#2a8f26', strength=0.6), bevel=0.5)
    box('tiroir', 10.0, -0.05, 4.2, 22.4, 0.3, 5.2, dark, bevel=0.1)
    for x, c in ((24.5, '#3fd13a'), (27.0, '#8a8a90')):
        cyl('bouton', x, 1.4, 6.6, 7.0, 0.8, plastic('#2b2b30'), bevel=0.15) if False else box('bouton', x, -0.12, 4.3, x + 1.8, 0.2, 5.1, plastic('#2b2b30'), bevel=0.15)
    for i in range(4):
        x = 6.2 + i * 5.4
        box('port', x, -0.1, 1.3, x + 3.6, 0.2, 2.9, dark, bevel=0.2)
        box('lueur', x + 1.4, -0.12, 3.1, x + 2.2, 0.2, 3.3, led('#3fd13a', 1.5))


def xbox360():
    """Xbox 360 : 30,9 × 25,8 × 8,3 cm, blanche ; dessus et dessous légèrement creusés, tiroir du
    disque en façade, bouton rond entouré de l'anneau de lumière verte à droite."""
    white, grey, dark = plastic('#efefec', 0.38), plastic('#c7c9cc', 0.45), plastic('#2a2a2e', 0.55)
    W, D = 30.9, 25.8
    pts = [(0, 0.3), (W, 0.3), (W, 8.0)]
    curve = [(W - i * W / 12, 8.0 - 0.45 * math.sin(math.pi * i / 12)) for i in range(1, 12)]
    pts += curve + [(0, 8.0)]
    front('corps', pts, 0, D, white, bevel=0.6, angle=30)
    box('pied', 1.5, 1.5, 0, W - 1.5, D - 1.5, 0.4, grey)
    box('tiroir', 2.0, -0.05, 5.2, 21.0, 0.3, 6.0, grey, bevel=0.1)
    box('trappe', 22.5, -0.05, 1.2, 28.5, 0.25, 3.4, grey, bevel=0.15)
    fcyl('anneau', 26.2, 6.0, -0.05, 0.4, 1.2, led('#5ee05a', 2.5))
    fcyl('bouton', 26.2, 6.0, -0.15, 0.3, 0.85, white, bevel=0.15)


def xbox_one():
    """Xbox One (2013) : 33,3 × 27,4 × 7,9 cm, noire ; dessus moitié brillant à gauche, moitié
    grillagé à droite ; fente du disque en façade et bouton lumineux blanc."""
    shiny, matte_b, dark = glossy('#101013'), plastic('#18181b', 0.6), plastic('#050506', 0.6)
    W, D, H = 33.3, 27.4, 7.9
    box('corps', 0, 0, 0, W, D, H - 0.4, matte_b, bevel=0.3)
    box('dessus-brillant', 0, 0, H - 0.6, 13.6, D, H, shiny, bevel=0.2)
    box('dessus-grille', 13.8, 0, H - 0.6, W, D, H - 0.1, matte_b, bevel=0.2)
    for i in range(30):
        y = 0.8 + i * 0.86
        box('fente', 14.4, y, H - 0.12, W - 0.6, y + 0.36, H - 0.06, dark)
    box('front-brillant', 0, -0.03, 0.4, 13.6, 0.2, H - 0.6, shiny, bevel=0.1)
    box('fente-disque', 1.5, -0.08, 4.4, 12.0, 0.2, 4.7, dark)
    fcyl('power', W - 2.4, H / 2 - 0.3, -0.06, 0.2, 0.55, led('#f2f2f2', 3))


def xbox_series_x():
    """Xbox Series X : un monolithe noir debout, 15,1 × 15,1 × 30,1 cm ; sur le dessus, la grille
    ronde creusée, éclairée de vert au fond ; fente du disque et bouton en façade."""
    black, dark = plastic('#141416', 0.6), plastic('#050506', 0.7)
    W, D, H = 15.1, 15.1, 30.1
    box('corps', 0, 0, 0.4, W, D, H, black, bevel=0.35)
    box('socle', 0.8, 0.8, 0, W - 0.8, D - 0.8, 0.45, dark)
    cyl('creux', W / 2, D / 2, H - 0.25, H + 0.01, 6.6, plastic('#1b6b2c', 0.5, ) if False else material('#145a22', 0.6, emit='#1f9a38', strength=1.2))
    for ring in range(1, 6):
        n = ring * 10
        for i in range(n):
            a = 2 * math.pi * i / n
            r = ring * 1.15
            cyl('trou', W / 2 + r * math.cos(a), D / 2 + r * math.sin(a), H - 0.03, H + 0.02, 0.32, dark, steps=12)
    box('fente', W - 3.3, -0.05, 14.0, W - 3.0, 0.2, 25.0, dark)
    fcyl('power', 2.0, H - 2.0, -0.05, 0.2, 0.45, led('#f0f0f0', 2.5))


def atari2600():
    """Atari 2600 (« heavy sixer ») : 34 × 23 × 9,5 cm ; dessus noir strié, façade en bois, six
    interrupteurs argentés sur le devant du dessus, fente de cartouche à l'arrière."""
    black, wood, dark, silver = plastic('#141416', 0.45), material('#6b3f1d', 0.55), plastic('#080809', 0.6), metal('#c9cbd0', 0.3)
    W, D = 34.0, 23.0
    profile('corps', [(0, 0), (D, 0), (D, 9.0), (8.0, 9.0), (6.5, 7.5), (0, 5.0)], 0, W, black, bevel=0.3)
    profile('bois', [(-0.05, 0.6), (0.6, 0.6), (6.6, 7.4), (6.5, 7.6), (-0.05, 5.1)], 0.3, W - 0.3, wood, bevel=0.1)
    for i in range(10):
        profile('veine', [(0.0 + i * 0.6, 0.9 + i * 0.6), (0.2 + i * 0.6, 1.1 + i * 0.6), (0.15 + i * 0.6, 1.15 + i * 0.6), (-0.05 + i * 0.6, 0.95 + i * 0.6)], 0.4, W - 0.4, material('#4e2c14', 0.6))
    for i in range(12):
        box('strie', 0.8, 9.0 + i * 1.1, 8.98, W - 0.8, 9.4 + i * 1.1, 9.06, dark)
    for k, x in enumerate((3.5, 7.0, 10.5, 23.5, 27.0, 30.5)):
        box('levier-fente', x - 0.3, 7.2, 8.9, x + 0.3, 8.6, 9.02, dark)
        box('levier', x - 0.35, 7.5, 9.0, x + 0.35, 8.1, 10.4, silver, bevel=0.12)
    box('fente', 11.5, 14.5, 8.95, 22.5, 17.5, 9.4, dark, bevel=0.1)


def pc_engine():
    """PC Engine : un petit carré blanc de 14 × 14 × 3,8 cm ; la fente des HuCard en façade, son
    loquet coulissant, l'interrupteur, le port manette ; bord arrière gris."""
    white, grey, dark = plastic('#f0efea', 0.4), plastic('#8d9096', 0.45), plastic('#1c1c20', 0.55)
    W, D, H = 14.0, 14.0, 3.8
    box('corps', 0, 0, 0, W, D, H, white, bevel=0.35)
    box('dos', 0.3, D - 2.6, H - 0.02, W - 0.3, D - 0.3, H + 0.05, grey, bevel=0.1)
    box('fente', 2.4, -0.06, 2.1, 11.6, 0.2, 2.6, dark)
    box('loquet', 3.0, -0.12, 2.8, 7.0, 0.2, 3.3, grey, bevel=0.08)
    box('interrupteur', 1.0, -0.1, 0.8, 2.6, 0.2, 1.5, plastic('#e08a22', 0.4), bevel=0.08)
    fcyl('port', 11.6, 1.2, -0.08, 0.2, 0.7, dark)
    for i in range(6):
        box('grille', 2.0 + i * 0.5, 4.0, H - 0.02, 2.2 + i * 0.5, 8.0, H + 0.02, plastic('#c9c8c2'))


def neo_geo():
    """Neo-Geo AES : 32,5 × 23,7 × 6 cm, noire et plate ; fente de cartouche à l'arrière du
    dessus (volet), deux ports manette et la fente de carte mémoire en façade, curseurs."""
    black, dark, grey = plastic('#141416', 0.45), plastic('#070708', 0.6), plastic('#2c2c31', 0.45)
    W, D, H = 32.5, 23.7, 6.0
    profile('corps', [(0, 0), (D, 0), (D, H), (3.0, H), (0, H - 1.2)], 0, W, black, bevel=0.35)
    box('fente', 6.0, 12.0, H - 0.05, 26.5, 18.5, H + 0.1, dark, bevel=0.1)
    box('volet', 6.4, 12.6, H + 0.05, 26.1, 17.9, H + 0.3, grey, bevel=0.15)
    for x in (2.5, 8.4):
        box('port', x, -0.08, 1.4, x + 4.4, 0.2, 3.0, dark, bevel=0.2)
    box('carte', 20.0, -0.06, 2.2, 29.0, 0.2, 2.6, dark)
    for x in (16.0, 18.2):
        box('curseur', x, 1.0, H - 0.1, x + 1.2, 2.4, H + 0.2, grey, bevel=0.1)
    box('bande', 0, -0.02, 4.2, W, 0.15, 4.4, plastic('#b3122b', 0.45))


CONSOLES = {'PS1': ps1, 'GB': gameboy, 'NES': nes, 'FDS': fds, 'SNES': snes, 'N64': n64, 'GC': gamecube,
            'SMS': master_system, 'MD': mega_drive, 'GG': game_gear, 'SAT': saturn, 'DC': dreamcast,
            'XBOX': xbox, 'X360': xbox360, 'XONE': xbox_one, 'XSX': xbox_series_x,
            '2600': atari2600, 'PCE': pc_engine, 'NEO': neo_geo,
            'GBC': gbc, 'GBA': gba, 'NDS': nds, '3DS': n3ds, 'PS2': ps2, 'PS3': ps3, 'PS4': ps4, 'PS5': ps5,
            'PSP': psp, 'PSV': psv, 'WII': wii, 'WIIU': wiiu, 'NSW': nsw, 'NSW2': nsw2}


# ---------------------------------------------------------------------
# Scène : sol (ombre seule), lumière de studio, caméra de trois quarts
# ---------------------------------------------------------------------
def scene_for(code):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    CONSOLES[code]()
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        ev = o.evaluated_get(dg)
        pts += [ev.matrix_world @ Vector(c) for c in ev.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center = (lo + hi) / 2
    size = (hi - lo).length

    # Sol : n'apporte que l'ombre
    bpy.ops.mesh.primitive_plane_add(size=size * 8, location=(center.x, center.y, lo.z))
    ground = bpy.context.active_object
    ground.is_shadow_catcher = True

    # Lumière : soleil doux devant à gauche, contre-jour, appoint à droite ; ciel gris neutre
    def sun(name, rot, strength, angle):
        data = bpy.data.lights.new(name, 'SUN')
        data.energy = strength
        data.angle = math.radians(angle)
        light = bpy.data.objects.new(name, data)
        light.rotation_euler = [math.radians(a) for a in rot]
        bpy.context.collection.objects.link(light)
    sun('principale', (38, 0, -42), 3.2, 18)
    sun('contre-jour', (-55, 0, 160), 1.6, 10)
    sun('appoint', (62, 0, 95), 0.8, 30)
    world = bpy.data.worlds.new('studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.42, 0.43, 0.46, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.55
    bpy.context.scene.world = world

    # Caméra orthographique : devant, à droite, au-dessus ; cadrage serré sur la console
    cam_data = bpy.data.cameras.new('camera')
    cam_data.type = 'ORTHO'
    cam = bpy.data.objects.new('camera', cam_data)
    bpy.context.collection.objects.link(cam)
    direction = Vector((0.55, -1.0, 0.72)).normalized()
    cam.location = center + direction * size * 4
    cam.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    local = [inv @ p for p in pts]
    w = max(p.x for p in local) - min(p.x for p in local)
    h = max(p.y for p in local) - min(p.y for p in local)
    cx = (max(p.x for p in local) + min(p.x for p in local)) / 2
    cy = (max(p.y for p in local) + min(p.y for p in local)) / 2
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = 960, 576
    aspect = 960 / 576
    cam_data.ortho_scale = max(w, h * aspect) * 1.1
    cam_data.shift_x = cx / cam_data.ortho_scale
    cam_data.shift_y = cy / cam_data.ortho_scale

    scene.render.engine = 'CYCLES'
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    try:
        scene.view_settings.view_transform = 'AgX'
        scene.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError:
        pass
    scene.render.filepath = os.path.join(OUT, f'{code}.png')


for code in (ONLY or list(CONSOLES)):
    scene_for(code)
    bpy.ops.render.render(write_still=True)
    print(f'console rendue : {code}')
