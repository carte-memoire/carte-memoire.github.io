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
    """Famicom Disk System (lecteur HVC-022) : boîtier rouge, 15 × 26,5 × 7,5 cm ; en façade, un
    panneau noir avec la fente de la disquette en haut, le bouton d'éjection jaune et le voyant."""
    red, black = plastic('#9e2126', 0.45), plastic('#1e1e21', 0.5)
    W, D, H = 15.0, 26.5, 7.6
    box('corps', 0, 0, 0, W, D, H, red, bevel=0.45)
    # Façade noire (photo d'Evan-Amos) : la fente de la disquette, le bouton d'éjection jaune, le voyant
    box('facade', 0.8, -0.06, 0.9, W - 0.8, 0.2, 6.6, black, bevel=0.2)
    box('fente', 1.6, -0.12, 4.2, W - 1.6, 0.2, 5.6, plastic('#0a0a0b', 0.6), bevel=0.1)
    box('ejection', W - 4.4, -0.2, 1.6, W - 2.0, 0.1, 2.6, plastic('#f2c22c', 0.4), bevel=0.12)
    box('voyant', 1.8, -0.1, 2.0, 2.5, 0.1, 2.4, led('#ff3b30', 2))
    for i in range(6):
        box('grille', 2.5 + i * 1.0, D - 5.0, H - 0.02, 2.9 + i * 1.0, D - 1.2, H + 0.02, plastic('#6e1418'))


def snes():
    """Super Nintendo européenne (la même que la Super Famicom japonaise), d'après les photos
    studio d'Evan-Amos (Wikimedia Commons, de trois quarts avant et arrière) : 20 × 24,2 × 7,2 cm,
    gris clair aux arêtes arrondies. Sur le dessus, un grand plateau gris plus foncé : la fente de
    cartouche en long (une gouttière claire au fond), l'interrupteur Power à gauche (glissière
    dans un cadre clair), le bouton Eject au milieu, le Reset à droite (carré foncé cerclé de
    clair) ; devant le plateau, une bande claire avec le voyant (sans le nom ni le logo de
    couleur). En façade, deux ports manette dans une bande en creux ; des grilles au dos."""
    body, plate, light = plastic('#d0d0d4', 0.5), plastic('#a0a0a6', 0.5), plastic('#dcdce0', 0.45)
    port, dark = plastic('#5c5c63', 0.55), plastic('#3a3a40', 0.6)
    W, D, H = 20.0, 24.2, 5.8
    # Deux coques (dessous et dessus) séparées par une fine rainure tout autour
    prism('dessous', rr(0, 0, W, D, 1.4), 0, 2.9, body, bevel=0.6, segments=4)
    prism('rainure', rr(0.25, 0.25, W - 0.5, D - 0.5, 1.2), 2.7, 3.2, plastic('#8e8e94', 0.6))
    prism('dessus', rr(0, 0, W, D, 1.4), 3.0, H, body, bevel=0.9, segments=5)
    # Plateau gris foncé du dessus (le quart avant reste clair)
    prism('plateau', rr(1.4, 6.4, W - 2.8, D - 8.0, 1.0), H - 0.2, H + 0.25, plate, bevel=0.2)
    # Fente de cartouche : gouttière claire en long, la fente sombre au milieu
    prism('gouttiere', rr(2.8, 15.0, W - 5.6, 2.6, 1.3), H + 0.2, H + 0.36, light, bevel=0.12)
    box('fente', 3.6, 16.05, H + 0.3, W - 3.6, 16.55, H + 0.4, dark)
    # Power (glissière dans un cadre clair), Eject (au milieu), Reset (carré foncé cerclé de clair)
    prism('cadre-power', rr(2.4, 8.2, 3.4, 3.6, 0.45), H + 0.2, H + 0.42, light, bevel=0.1)
    prism('power', rr(2.9, 9.4, 2.4, 1.6, 0.3), H + 0.3, H + 0.75, plate, bevel=0.12)
    for i in range(4):
        box('strie', 3.1, 9.6 + i * 0.36, H + 0.74, 5.1, 9.72 + i * 0.36, H + 0.79, dark)
    prism('eject', rr(7.2, 8.8, 5.6, 2.8, 0.7), H + 0.2, H + 0.62, plastic('#b3b3b8', 0.45), bevel=0.2)
    prism('cadre-reset', rr(14.3, 8.2, 3.4, 3.4, 0.6), H + 0.2, H + 0.4, light, bevel=0.1)
    prism('reset', rr(14.7, 8.6, 2.6, 2.6, 0.4), H + 0.3, H + 0.62, plastic('#6c6c73', 0.5), bevel=0.15)
    box('voyant', 15.6, 2.6, H - 0.05, 16.6, 2.9, H + 0.03, led('#ff3a30', 2.5))
    # Façade : bande en creux et deux ports manette
    front('bande', rr(1.6, 1.0, W - 3.2, 2.6, 1.0), -0.04, 0.3, plastic('#b9b9be', 0.5), bevel=0.15)
    for cx in (6.0, 14.0):
        front('port', rr(cx - 2.2, 1.6, 4.4, 1.3, 0.55), -0.1, 0.35, port, bevel=0.1)
        for i in range(7):
            front('broche', rr(cx - 1.6 + i * 0.52, 2.05, 0.3, 0.42, 0.08), -0.14, 0.0, dark)
    # Grilles au dos
    for i in range(16):
        x = 2.5 + i * 0.95
        box('grille', x, D - 0.08, 0.8, x + 0.45, D + 0.02, 4.4, dark)


def sweep(name, path, w, h, mat, zfun=lambda x, y: 0.0, steps=10, sink=0.3):
    """Tube arrondi (demi-ellipse de largeur w et de hauteur h, enfoncé de sink) qui suit un chemin
    fermé (x, y), posé sur la surface z = zfun(x, y) : un anneau sans jointure."""
    bm = bmesh.new()
    n = len(path)
    rings = []
    for i, (x, y) in enumerate(path):
        (xa, ya), (xb, yb) = path[i - 1], path[(i + 1) % n]
        tx, ty = xb - xa, yb - ya
        ln = math.hypot(tx, ty) or 1.0
        nx, ny = -ty / ln, tx / ln
        z0 = zfun(x, y)
        section = [(x + nx * w / 2, y + ny * w / 2, z0 - sink)]
        for k in range(steps + 1):
            a = math.pi * k / steps
            section.append((x + nx * w / 2 * math.cos(a), y + ny * w / 2 * math.cos(a), z0 + h * math.sin(a)))
        section.append((x - nx * w / 2, y - ny * w / 2, z0 - sink))
        rings.append([bm.verts.new(p) for p in section])
    m = len(rings[0])
    for i in range(n):
        r0, r1 = rings[i], rings[(i + 1) % n]
        for k in range(m):
            bm.faces.new([r0[k], r0[(k + 1) % m], r1[(k + 1) % m], r1[k]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(to_object(name, bm, mat), 0)


def slab(name, x0, x1, ya, za, yb, zb, mat, t=0.08):
    """Plaque fine posée sur une pente (de (ya, za) à (yb, zb)), de x0 à x1 : ouïes, grilles."""
    top = [(x0, ya, za), (x1, ya, za), (x1, yb, zb), (x0, yb, zb)]
    return loft(name, [(x, y, z - t) for x, y, z in top], top, mat)


def n64():
    """Nintendo 64 (NUS-001), d'après les photos studio d'Evan-Amos (Wikimedia Commons, de face,
    de trois quarts et de dos) : 26 × 19 × 7,3 cm, gris anthracite sur un socle noir. Aux coins
    avant, deux « pieds » noirs arrondis qui avancent ; entre eux, la façade creusée porte quatre
    ports manette gris clair, deux et deux, de part et d'autre d'un badge noir brillant (sans son
    logo). Dessus en pente douce : l'interrupteur Power à gauche, le Reset à droite, la trappe de
    l'extension au milieu ; au fond, une bosse en arche avec des ouïes devant et la fente de
    cartouche (volets gris clair) ; des ouïes aussi sur les côtés."""
    shell, base = plastic('#2d2e33', 0.48), plastic('#161619', 0.55)
    light, dark, gloss = plastic('#babbc0', 0.5), plastic('#131316', 0.6), glossy('#0b0b0d')
    W, D = 26.0, 19.0

    def front_y(x):
        # Façade vue de dessus : en avant aux deux bouts, creusée au milieu
        t = (x - W / 2) / (W / 2 - 0.6)
        return 1.0 + 1.8 * (1 - t * t)

    def outline(x0, x1, back, step=0.5, r_back=2.4):
        pts = [(x, front_y(x)) for x in [x0 + i * step for i in range(int((x1 - x0) / step) + 1)]]
        for cx, start in ((x1 - r_back, 0), (x0 + r_back, 90)):
            for i in range(7):
                a = math.radians(start + 90 * i / 6)
                pts.append((cx + r_back * math.cos(a), back - r_back + r_back * math.sin(a)))
        return pts

    # Socle noir (en retrait) et façade anthracite creusée
    prism('socle', rr(0.9, 1.8, W - 1.8, D - 2.6, 2.0), 0, 0.9, base, bevel=0.3)
    prism('facade', outline(0.6, W - 0.6, D - 0.4), 0.6, 3.3, shell, bevel=0.35)
    # Les deux pieds noirs des coins avant, gros et ronds, prolongés le long des côtés
    for x in (-0.6, W - 5.6):
        prism('pied', rr(x, -0.5, 6.0, 11.5, 3.0), 0, 3.0, base, bevel=1.1, segments=6)
    # Coque du dessus, aux arêtes très arrondies
    prism('coque', outline(0.6, W - 0.6, D - 0.4), 3.0, 5.6, shell, bevel=1.4, segments=6)
    # Bosse du fond, large et basse : ouïes sur sa pente avant, fente de cartouche au sommet
    loft('bosse', [(x, y, 5.3) for x, y in ccw(rr(5.4, 8.0, 15.2, 10.6, 4.5))],
         [(x, y, 6.9) for x, y in ccw(rr(7.4, 10.9, 11.2, 7.7, 3.2))], shell, bevel=0.8, segments=5)
    for i in range(25):
        x = 7.9 + i * 0.42
        slab('ouie', x, x + 0.2, 9.0, 5.95, 10.5, 6.72, dark)
    # Fente de cartouche : longue et étroite, au fond de la bosse
    box('fente', 8.6, 12.9, 6.8, 17.4, 15.3, 6.93, dark, bevel=0.05)
    for y0, y1 in ((13.05, 14.05), (14.15, 15.15)):
        box('volet', 8.8, y0, 6.84, 17.2, y1, 6.96, light, bevel=0.05)
    # Trappe de l'extension, Power (glissière dans un creux ovale) à gauche, Reset à droite
    box('trappe', 9.8, 3.6, 5.5, 16.2, 7.8, 5.7, plastic('#323338', 0.45), bevel=0.15, r=0.5)
    box('logement-power', 2.6, 5.0, 5.45, 6.2, 8.8, 5.65, dark, bevel=0.1, r=1.6)
    box('power', 3.3, 6.2, 5.5, 5.5, 7.6, 6.0, shell, bevel=0.18, r=0.55)
    box('logement-reset', 19.9, 5.6, 5.45, 23.1, 8.6, 5.65, dark, bevel=0.1, r=1.4)
    box('reset', 20.3, 6.0, 5.5, 22.7, 8.2, 5.95, shell, bevel=0.2, r=1.0)
    # Façade : quatre ports manette (deux et deux) et le badge noir brillant
    for cx in (7.2, 9.8, 16.2, 18.8):
        y = front_y(cx)
        front('port', rr(cx - 1.2, 1.3, 2.4, 1.6, 0.68), y - 0.14, y + 0.4, light, bevel=0.12)
        front('prise', rr(cx - 0.7, 1.72, 1.4, 0.75, 0.3), y - 0.2, y + 0.2, dark)
    y = front_y(W / 2)
    front('badge', rr(W / 2 - 2.0, 1.1, 4.0, 2.0, 0.5), y - 0.1, y + 0.3, gloss, bevel=0.08)
    # Ouïes des côtés
    for side in (0.48, W - 0.58):
        for i in range(14):
            y0 = 7.0 + i * 0.55
            box('ouie-cote', side, y0, 3.4, side + 0.1, y0 + 0.24, 4.7, dark)


def gamecube():
    """GameCube : 15 × 16,1 × 11 cm, violet indigo, cube aux arêtes arrondies ; couvercle rond
    sur le dessus, poignée à l'arrière, quatre ports manette noirs en façade, boutons sur le dessus."""
    body, dark = plastic('#4c3f8f', 0.42), plastic('#1c1a24', 0.6)
    W, D, H = 15.0, 16.1, 11.0
    box('corps', 0, 0, 0, W, D, H - 0.4, body, bevel=0.9)
    cyl('couvercle', W / 2, D / 2 + 0.6, H - 0.6, H, 6.2, body, bevel=0.35)
    cyl('rainure', W / 2, D / 2 + 0.6, H - 0.48, H - 0.38, 6.35, dark)
    cyl('disque', W / 2, D / 2 + 0.6, H - 0.05, H + 0.03, 3.9, plastic('#232129', 0.35), bevel=0.05)
    for x, r in ((2.0, 0.55), (W - 2.0, 0.55)):
        cyl('bouton', x, 2.0, H - 0.5, H - 0.25, r, plastic('#5a4ca4', 0.4), bevel=0.12)
    cyl('ouvrir', W / 2, 2.0, H - 0.5, H - 0.3, 0.55, plastic('#5a4ca4', 0.4), bevel=0.12)
    # Poignée à l'arrière : un arceau
    for x in (1.4, W - 1.4):
        box('poignee-pied', x - 0.7, D - 0.2, 5.6, x + 0.7, D + 3.0, 7.0, body, bevel=0.5)
    box('poignee', 0.7, D + 1.8, 5.6, W - 0.7, D + 3.0, 7.0, body, bevel=0.5)
    # Quatre ports manette en haut de la façade (prises claires au creux sombre), la trappe des
    # cartes mémoire dessous
    for i in range(4):
        x = 1.6 + i * 3.1
        front('port', rr(x, 6.6, 2.5, 1.9, 0.7), -0.12, 0.3, plastic('#cfcfd6', 0.4), bevel=0.12)
        front('prise', rr(x + 0.55, 7.1, 1.4, 0.9, 0.35), -0.16, 0.0, dark)
    front('trappe', rr(1.4, 1.4, W - 2.8, 3.6, 0.5), -0.06, 0.2, plastic('#43388a', 0.45), bevel=0.1)


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
    """PlayStation 2 « Fat » (SCPH-30001), d'après les photos studio d'Evan-Amos (Wikimedia
    Commons, vues avant gauche, avant droite, arrière) : 30,1 × 17,8 × 7,8 cm, noire.
    - Le dessus est LISSE ; c'est la moitié haute du boîtier qui est faite de six fines
      lamelles empilées, séparées par des rainures sombres, qui font le tour de la façade et du
      côté droit (le flanc gauche est un panneau plat, avec ses patins pour la poser debout).
    - Dans les lamelles, à gauche : les deux fentes de carte mémoire au-dessus des deux ports
      manette ; au centre, le tiroir du disque (une lamelle double) ; au bout droit, Reset
      (voyant vert) au-dessus d'Éjection (voyant bleu).
    - Dessous, un socle plus sombre en retrait (devant et à droite) : la grande grille
      d'aération en façade et, à gauche, le petit panneau bleu des ports USB et i.Link."""
    shell = material('#17171a', 0.36, coat=0.15)
    core, base, grille = plastic('#060607', 0.7), plastic('#101012', 0.55), plastic('#050506', 0.8)
    W, D, H = 30.1, 17.8, 7.8
    ZB = 3.05                       # haut du socle, bas des lamelles
    SLAT, GAP = 0.6, 0.19           # épaisseur d'une lamelle, rainure entre deux
    # Flanc gauche plat, sur toute la hauteur : au ras des lamelles en haut, et en retrait
    # avec le socle en bas (il ne dépasse pas devant le logement des ports)
    box('flanc', 0, 0.15, ZB, 0.45, D, H, shell, bevel=0.12)
    box('flanc-bas', 0, 1.0, 0, 0.45, D, ZB + 0.05, base, bevel=0.06)
    # Cœur sombre derrière les rainures
    box('coeur', 0.4, 0.35, ZB, W - 0.35, D - 0.3, H - 0.1, core)
    # Six lamelles (la plus haute fait le dessus, lisse), arrondies au coin avant droit
    levels = [ZB + i * (SLAT + GAP) for i in range(6)]
    for i, z in enumerate(levels):
        top = H if i == 5 else z + SLAT
        prism('lamelle', rr(0.4, 0, W - 0.4, D, [0.0, 0.35, 0.35, 0.0]), z, top, shell, bevel=0.07, segments=2)
    # Socle en retrait : plus sombre, devant (1 cm) et à droite (2,7 cm) ; à gauche, le
    # logement des ports USB et i.Link, creusé dans le socle et cerné de noir
    box('socle', 3.25, 1.0, 0, W - 2.7, D - 0.6, ZB, base, bevel=0.1)
    box('socle-gauche', 0.45, 1.2, 0, 3.3, D - 0.6, ZB, base)
    box('logement-bas', 0.45, 1.0, 0, 3.3, 1.22, 0.38, base, bevel=0.05)
    box('logement-haut', 0.45, 1.0, ZB - 0.25, 3.3, 1.22, ZB, base)
    box('logement-droit', 3.05, 1.0, 0, 3.3, 1.22, ZB, base, bevel=0.04)
    # Grille d'aération du socle : fentes horizontales coupées de montants
    for k in range(7):
        z = 0.45 + k * 0.33
        box('fente', 3.4, 0.97, z, W - 4.0, 1.02, z + 0.17, grille)
    for k in range(25):
        x = 3.4 + k * ((W - 7.4) / 24)
        box('montant', x - 0.05, 0.93, 0.4, x + 0.05, 1.0, 2.75, base)
    # Panneau bleu mat des ports USB (deux, l'un sur l'autre) et i.Link, au fond du logement
    box('panneau-bleu', 0.45, 1.14, 0.38, 3.05, 1.22, ZB - 0.25, material('#2c5fc4', 0.55))
    for z in (0.7, 1.45):
        box('usb', 0.8, 1.09, z, 1.95, 1.15, z + 0.5, grille)
        box('languette', 0.95, 1.07, z + 0.12, 1.8, 1.12, z + 0.26, plastic('#cfd3da', 0.4))
    box('ilink', 2.25, 1.09, 1.75, 2.75, 1.15, 2.2, grille)
    # Ports manette (deux lamelles du bas) et fentes de carte mémoire (au-dessus), à gauche
    for x in (1.2, 7.2):
        z0 = levels[1] - 0.05
        box('port-manette', x, -0.06, z0, x + 5.2, 0.25, z0 + SLAT + 0.1, grille, bevel=0.05)
        for k in range(4):
            box('broches', x + 0.5 + k * 1.1, -0.08, z0 + 0.12, x + 1.2 + k * 1.1, 0.0, z0 + SLAT - 0.02, plastic('#2a2a2e', 0.5))
        z1 = levels[3] + 0.18
        box('carte', x + 0.2, -0.06, z1, x + 4.8, 0.25, z1 + 0.22, grille)
    # Tiroir du disque : une lamelle double au centre, sa jointure et son bord
    box('tiroir', 13.4, -0.03, levels[2], 26.9, 0.15, levels[3] + SLAT, shell, bevel=0.06)
    box('jointure', 13.35, -0.04, levels[2] - 0.02, 13.45, 0.16, levels[3] + SLAT + 0.02, core)
    box('jointure', 26.85, -0.04, levels[2] - 0.02, 26.95, 0.16, levels[3] + SLAT + 0.02, core)
    # Bout droit : Reset (voyant vert) au-dessus d'Éjection (voyant bleu)
    for lvl, color in ((4, '#3ee07a'), (2, '#3a86ff')):
        z = levels[lvl]
        box('bouton', W - 2.3, -0.08, z, W - 0.7, 0.1, z + SLAT, material('#1d1d21', 0.3, coat=0.3), bevel=0.05)
        box('voyant', W - 1.75, -0.1, z + 0.18, W - 1.25, 0.0, z + SLAT - 0.18, led(color, 3.5))


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
    # Les ailes s'évasent vers le haut (cisaillement : l'écart grandit avec la hauteur)
    left = profile('aile-gauche', wing, 0.0, 2.0, white, bevel=0.5)
    right = profile('aile-droite', wing, 8.4, 10.4, white, bevel=0.5)
    flare = 0.11
    left.matrix_world = Matrix(((1, 0, -flare, 2.0 * 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1)))
    right.matrix_world = Matrix(((1, 0, flare, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1)))
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
    """Master System (premier modèle), d'après les photos studio d'Evan-Amos (Wikimedia Commons,
    de trois quarts gauche et droite) : 36,5 × 17 × 7 cm, noire, longue et anguleuse, la façade en
    biais soulignée d'un liseré rouge. À droite, un bloc surélevé en pyramide tronquée porte le
    panneau rouge (avec les boutons Reset et Pause, sans son schéma ni ses inscriptions) et, au
    fond, la fente de cartouche ; en façade, l'onglet Power rouge à gauche, les deux ports manette
    au milieu, la fente de carte à droite."""
    black, red, dark = plastic('#17171a', 0.42), plastic('#c8202a', 0.42), plastic('#0a0a0b', 0.6)
    W, D = 36.5, 17.0
    profile('corps', [(0, 0), (D, 0), (D, 4.9), (2.6, 4.9), (0, 3.4)], 0, W, black, bevel=0.25)
    profile('liseré', [(0.02, 3.0), (0.25, 3.0), (0.25, 3.18), (0.02, 3.18)], 0.4, W - 0.4, red)
    # Bloc surélevé de droite, en pyramide tronquée
    loft('bloc', [(x, y, 4.8) for x, y in ccw([(19.6, 3.4), (35.8, 3.4), (35.8, 16.6), (19.6, 16.6)])],
         [(x, y, 7.0) for x, y in ccw([(21.8, 5.6), (34.0, 5.6), (34.0, 15.8), (21.8, 15.8)])], plastic('#121214', 0.5), bevel=0.15)
    # Panneau rouge, ses deux boutons noirs, la fente de cartouche au fond
    box('panneau', 22.6, 6.2, 6.98, 33.2, 12.6, 7.04, red)
    for x in (23.6, 28.6):
        box('bouton', x, 11.2, 7.0, x + 3.6, 12.2, 7.2, black, bevel=0.08)
    box('cadre-fente', 22.8, 12.9, 6.98, 33.0, 15.2, 7.1, dark, bevel=0.05)
    box('fente', 23.3, 13.3, 7.0, 32.5, 14.8, 7.14, plastic('#8c8d92', 0.4))
    # Façade : onglet Power rouge, ports manette, fente de carte
    box('power', 1.2, -0.06, 2.0, 4.6, 0.25, 2.6, red, bevel=0.05)
    for x in (14.6, 18.4):
        front('port', [(x, 1.0), (x + 3.0, 1.0), (x + 2.7, 2.2), (x + 0.3, 2.2)], -0.08, 0.4, dark, bevel=0.06)
    box('carte', 25.0, -0.06, 1.2, 31.0, 0.3, 1.8, dark)


def mega_drive():
    """Mega Drive européenne (premier modèle), d'après les photos studio d'Evan-Amos (Wikimedia
    Commons) : 28 × 21,2 × 7 cm, noire. À droite, le grand plateau rond surélevé de la fente de
    cartouche : un cercle intérieur en creux, la fente au fond, et devant, la plaque carrée (sans
    son inscription « 16-BIT ») au liseré argenté et au voyant rouge. À l'avant gauche, un panneau
    en creux : curseur de volume, interrupteur Power, Reset gris ; derrière lui, la grille
    d'aération. En façade, la prise casque à gauche et les ports manette à droite."""
    black, dark, mid = plastic('#151517', 0.42), plastic('#08080a', 0.6), plastic('#222226', 0.4)
    silver, grey = metal('#b8b9bd', 0.35), plastic('#8d8e94', 0.4)
    W, D, H = 28.0, 21.2, 4.4
    # Corps : façade en pente, arrière droit très arrondi
    corps = rr(0, 0, W, D, [0.8, 0.8, 4.6, 1.2])
    loft('corps', [(x, y, 0) for x, y in ccw(corps)],
         [(x, y + (1.0 if y < 1 else 0), H) for x, y in ccw(corps)], black, bevel=0.45, segments=4)
    # Plateau rond, son cercle intérieur en creux, la fente au fond
    cx, cy = 17.6, 11.4
    prism('plateau', circle(cx, cy, 7.7), H - 0.2, H + 1.6, black, bevel=0.7, segments=5, top_pts=circle(cx, cy, 7.2))
    prism('creux', circle(cx, cy, 6.1), H + 1.5, H + 1.62, mid, bevel=0.1)
    box('fente', cx - 5.0, cy + 2.6, H + 1.55, cx + 5.0, cy + 3.6, H + 1.7, dark, bevel=0.05)
    box('volet', cx - 4.8, cy + 1.6, H + 1.6, cx + 4.8, cy + 2.6, H + 1.78, black, bevel=0.1)
    # Plaque carrée devant la fente : noire, un liseré argenté en bas, le voyant rouge
    prism('plaque', rr(cx - 2.4, cy - 5.8, 4.8, 4.8, 0.4), H + 1.55, H + 1.8, black, bevel=0.08)
    prism('liseré', rr(cx - 2.4, cy - 5.8, 4.8, 1.0, [0.4, 0.4, 0, 0]), H + 1.78, H + 1.84, silver)
    cyl('voyant', cx - 0.5, cy - 5.3, H + 1.82, H + 1.9, 0.14, led('#ff2a20', 3))
    # Panneau de commandes en creux, à l'avant gauche (la façade en pente l'entame un peu)
    box('panneau', 5.0, 2.4, H - 0.12, 11.4, 8.6, H + 0.02, dark, bevel=0.08)
    box('rail-volume', 5.7, 3.4, H - 0.05, 6.5, 7.8, H + 0.04, mid)
    box('volume', 5.5, 5.6, H, 6.7, 6.6, H + 0.55, black, bevel=0.12)
    box('cadre-power', 8.0, 5.8, H - 0.05, 10.8, 7.8, H + 0.05, silver, bevel=0.05)
    box('power', 9.4, 6.2, H, 10.4, 7.4, H + 0.5, black, bevel=0.12)
    box('reset', 8.2, 3.2, H - 0.05, 10.6, 4.6, H + 0.3, grey, bevel=0.12, r=0.15)
    # Grille d'aération derrière le panneau (fines lames parallèles à la façade)
    box('fond-grille', 5.3, 10.4, H - 0.08, 11.1, 17.0, H + 0.01, dark)
    for i in range(12):
        y = 10.6 + i * 0.52
        box('grille', 5.5, y, H - 0.05, 10.9, y + 0.26, H + 0.07, plastic('#2c2c31', 0.4), bevel=0.04)
    # Façade : prise casque à gauche, ports manette à droite
    fcyl('casque', 3.0, 2.2, -0.1, 0.4, 0.3, dark)
    for x in (18.4, 22.2):
        front('port', [(x, 1.4), (x + 3.0, 1.4), (x + 2.7, 2.8), (x + 0.3, 2.8)], -0.08, 0.5, dark, bevel=0.08)


def game_gear():
    """Game Gear, d'après les photos studio d'Evan-Amos (Wikimedia Commons, de face et de trois
    quarts) : 20,9 × 11,3 × 3,8 cm, gris anthracite, à l'horizontale, bouts arrondis. Au centre, un
    grand cadre noir brillant en trapèze (plus large en haut, où il touche le bord) autour de
    l'écran gris, un peu à gauche ; à gauche, la croix dans un disque et, dessous, la grille du
    haut-parleur ; à droite, le Start bleu en haut et les boutons 1 et 2 en diagonale. Sans
    inscriptions ni logo."""
    body, bezel = plastic('#2b2c31', 0.38), glossy('#0e0e10')
    objs = []
    W, Hh, T = 20.9, 11.3, 3.8
    objs.append(prism('corps', rr(0, 0, W, Hh, [3.4, 3.4, 2.4, 2.4]), 0, T, body, bevel=0.9, segments=5))
    # Rebord du haut, un peu en saillie (la « visière » au-dessus de l'écran)
    objs.append(prism('visiere', rr(4.6, Hh - 1.3, 11.7, 1.3, [0, 0, 0.5, 0.5]), T - 0.1, T + 0.12, body, bevel=0.1))
    objs.append(prism('cadre', [(5.2, Hh - 0.35), (15.7, Hh - 0.35), (14.5, 2.3), (13.7, 1.45), (7.2, 1.45), (6.4, 2.3)],
                      T + 0.05, T + 0.2, bezel, bevel=0.12))
    objs.append(box('bord-ecran', 6.7, 2.5, T + 0.18, 13.3, 9.4, T + 0.24, plastic('#55585c', 0.45), bevel=0.04))
    objs.append(box('ecran', 7.15, 2.95, T + 0.22, 12.85, 8.95, T + 0.27, screen('#30352f')))
    # Croix dans son disque, et la grille du haut-parleur
    objs.append(cyl('disque', 2.9, 6.3, T - 0.05, T + 0.12, 1.55, plastic('#1d1d20', 0.4), bevel=0.15))
    objs.append(prism('croix', cross_pts(2.9, 6.3, 2.4, 0.9), T + 0.08, T + 0.2, plastic('#19191c', 0.35), bevel=0.06))
    for i in range(6):
        for j in range(4):
            objs.append(cyl('trou', 1.6 + i * 0.48, 1.9 + j * 0.48, T - 0.02, T + 0.02, 0.11, plastic('#0a0a0b', 0.7), steps=12))
    # Start bleu, boutons 1 et 2
    objs.append(cyl('start', 17.4, 8.9, T - 0.05, T + 0.3, 0.55, plastic('#2f63cc', 0.35), bevel=0.12))
    for cx, cy in ((17.4, 5.3), (19.2, 6.4)):
        objs.append(cyl('bouton', cx, cy, T - 0.05, T + 0.36, 0.68, plastic('#1b1b1e', 0.35), bevel=0.18))
    group(objs, Matrix.Translation((0, 4.0, 0)) @ standing(16) @ Matrix.Translation((-W / 2, 0, 0)))


def saturn():
    """Saturn européenne (premier modèle), d'après les photos studio d'Evan-Amos (Wikimedia
    Commons) : 26 × 23 × 8,3 cm, noire. Au centre du dessus, le grand couvercle carré aux coins
    très arrondis du lecteur de CD, dans une cuvette ; devant, une bande en pente avec Power à
    gauche, Reset (allongé) au milieu et Open à droite ; au fond, la fente de cartouche et son
    volet ; des ouïes sur les côtés, deux ports manette en façade. Sans inscriptions."""
    black, dark, grey = plastic('#18181b', 0.42), plastic('#09090a', 0.6), plastic('#242428', 0.38)
    W, D = 26.0, 23.0
    slope = lambda y: 4.6 + (y - 0.6) * (2.4 / 2.8)
    profile('corps', [(0, 0), (D, 0), (D, 7.0), (3.4, 7.0), (0.6, 4.6), (0, 4.4)], 0, W, black, bevel=0.6, segments=5)
    # Cuvette et couvercle du lecteur de CD
    prism('cuvette', rr(4.2, 4.6, 16.4, 15.2, 5.4), 6.9, 7.02, dark, bevel=0.1)
    prism('couvercle', rr(4.8, 5.2, 15.2, 14.0, 4.9), 6.9, 7.7, black, bevel=0.6, segments=5, top_pts=rr(5.6, 6.0, 13.6, 12.4, 4.3))
    # Fente de cartouche au fond, et son volet
    box('fente', 7.0, 20.6, 6.95, 19.0, 22.0, 7.08, dark)
    box('volet', 7.3, 20.8, 7.0, 18.7, 21.8, 7.12, grey, bevel=0.05)
    # Boutons sur la bande en pente
    for name, x0, x1 in (('power', 3.2, 6.0), ('reset', 10.4, 15.6), ('open', 20.0, 22.8)):
        pts = ccw(rr(x0, 1.3, x1 - x0, 1.3, 0.6))
        loft(name, [(x, y, slope(y) - 0.1) for x, y in pts], [(x, y, slope(y) + 0.22) for x, y in pts], grey, bevel=0.12)
    box('voyant', 16.6, 1.7, slope(1.8) - 0.05, 17.0, 2.0, slope(1.8) + 0.08, led('#ff8a1a', 2))
    # Ouïes des côtés, ports manette en façade
    for side in (-0.05, W - 0.06):
        for i in range(12):
            y = 9.0 + i * 0.9
            box('ouie', side, y, 2.0, side + 0.11, y + 0.42, 5.6, dark)
    for x in (8.0, 12.4):
        front('port', [(x, 1.2), (x + 3.4, 1.2), (x + 3.1, 2.5), (x + 0.3, 2.5)], -0.08, 0.4, dark, bevel=0.06)


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
        x = 2.2 + i * 3.9
        front('port', rr(x, 0.75, 2.7, 1.5, 0.55), -0.12, 0.35, plastic('#f2f1ed', 0.4), bevel=0.1)
        front('prise', rr(x + 0.6, 1.1, 1.5, 0.8, 0.3), -0.16, 0.0, dark)


def xbox():
    """Xbox (2001), d'après les photos studio d'Evan-Amos (Wikimedia Commons) : 32,4 × 26 × 10 cm,
    noire et massive. Sur le dessus, un grand « X » en relief, ses quatre branches en pente douce
    jusqu'aux coins, et au centre le gros bijou rond vert translucide (sans le logo) ; en façade, le
    tiroir du disque au milieu, les boutons Power et Éjection dessous, deux ports manette de
    chaque côté ; des ouïes sur le côté."""
    black, dark, grey = plastic('#161618', 0.42), plastic('#060607', 0.6), plastic('#2c2c31', 0.42)
    W, D, H = 32.4, 26.0, 7.6
    prism('corps', rr(0, 0, W, D, 1.6), 0, H, black, bevel=0.6)
    # Les deux diagonales du « X » : bandes en pente qui montent vers le centre
    cx, cy = W / 2, D / 2
    for (x0, y0), (x1, y1) in (((1.2, 1.2), (W - 1.2, D - 1.2)), ((W - 1.2, 1.2), (1.2, D - 1.2))):
        ln = math.hypot(x1 - x0, y1 - y0)
        nx, ny = -(y1 - y0) / ln, (x1 - x0) / ln
        steps = 16
        def band(half, z_end, z_mid):
            pts_top = [(x0 + (x1 - x0) * k / steps + nx * half, y0 + (y1 - y0) * k / steps + ny * half) for k in range(steps + 1)]
            pts_bot = [(x0 + (x1 - x0) * k / steps - nx * half, y0 + (y1 - y0) * k / steps - ny * half) for k in range(steps + 1)]
            zs = [z_end + (z_mid - z_end) * math.sin(math.pi * k / steps) for k in range(steps + 1)]
            return [(x, y, z) for (x, y), z in zip(pts_top + pts_bot[::-1], zs + zs[::-1])]
        top = band(1.6, H + 0.2, H + 2.0)
        loft('x', [(x, y, H - 0.3) for x, y, _ in band(2.6, 0, 0)], top, black, bevel=0.3)
    # Bijou vert au centre, dans son cadre noir
    cyl('cadre-bijou', cx, cy, H + 1.6, H + 2.3, 3.6, plastic('#0c0c0e', 0.4), bevel=0.3)
    cyl('bijou', cx, cy, H + 2.1, H + 2.55, 2.8, material('#2e8f2a', 0.12, transmission=0.5, coat=1.0, emit='#1f6e1c', strength=0.4), bevel=0.4)
    # Façade : tiroir au milieu, Power et Éjection, deux ports manette de chaque côté
    box('panneau', 11.8, -0.06, 0.8, 20.6, 0.2, 6.6, plastic('#1d1d20', 0.4), bevel=0.1)
    box('tiroir', 12.3, -0.12, 5.0, 20.1, 0.2, 5.9, dark, bevel=0.08)
    fcyl('power', cx, 3.6, -0.18, 0.2, 0.55, grey, bevel=0.08)
    fcyl('ejection', cx, 2.2, -0.18, 0.2, 0.4, grey, bevel=0.06)
    for x in (3.4, 7.4, 21.6, 25.6):
        box('port', x, -0.1, 1.6, x + 3.2, 0.2, 3.4, dark, bevel=0.2)
        box('lueur', x + 1.2, -0.12, 3.6, x + 2.0, 0.2, 3.8, led('#3fd13a', 1.2))
    # Ouïes du côté droit
    for i in range(14):
        y = 6.0 + i * 1.0
        box('ouie', W - 0.05, y, 1.4, W + 0.06, y + 0.5, 6.2, dark)


def xbox360():
    """Xbox 360 (premier modèle, blanc), d'après les photos studio d'Evan-Amos (Wikimedia Commons) :
    30,9 × 25,8 × 8,3 cm. Les deux bouts sont des grilles grises creusées vers l'intérieur, la
    façade aussi est creusée ; en façade, le tiroir chromé du disque et son bouton d'éjection,
    les deux trappes des cartes mémoire, le gros bouton Power cerclé de l'anneau de lumière verte,
    la trappe des prises USB ; des bandes perforées sur le dessus, près des bouts. Sans logo."""
    white, light, grille = plastic('#f1f1ee', 0.36), plastic('#d4d4d4', 0.4), plastic('#4b5450', 0.62)
    chrome, dark = metal('#c9cbcf', 0.25), plastic('#1c1c1f', 0.5)
    W, D, H, end = 30.9, 25.8, 8.3, 1.6
    fy = lambda z: 0.55 * math.sin(math.pi * min(max((z - 0.3) / (H - 0.6), 0), 1))
    # Corps blanc : la façade creusée (vue de côté)
    side = [(0.25, 0), (D - 0.25, 0), (D, 0.3), (D, H - 0.3), (D - 0.25, H), (0.25, H), (0, H - 0.3)]
    side += [(fy(z), z) for z in [H - 0.3 - k * (H - 0.6) / 12 for k in range(1, 12)]] + [(0, 0.3)]
    profile('corps', side, end, W - end, white, bevel=0.4)
    # Les deux bouts : grilles grises creusées (vues de dessus)
    for x_in, sign in ((end + 0.05, -1), (W - end - 0.05, 1)):
        outer = [(x_in + sign * (end - 1.25 * math.sin(math.pi * k / 14)), D * k / 14) for k in range(15)]
        prism('grille', [(x_in, 0.15), (x_in, D - 0.15)] + outer[::-1], 0.35, H - 0.35, grille, bevel=0.15)
    # Bandes perforées du dessus, près des bouts
    for x0 in (end + 0.9, W - end - 2.3):
        for i in range(4):
            for j in range(22):
                cyl('trou', x0 + i * 0.42, 2.4 + j * 0.98, H - 0.03, H + 0.01, 0.12, plastic('#a9aaab', 0.5), steps=8)
    # Façade : tiroir chromé, éjection, trappes, Power et son anneau, trappe USB, fenêtre infrarouge
    zt = 5.4
    front('tiroir', rr(3.2, zt - 0.45, 13.4, 0.9, 0.45), fy(zt) - 0.12, fy(zt) + 0.3, chrome, bevel=0.06)
    fcyl('ejection', 3.6, zt, fy(zt) - 0.16, fy(zt) + 0.3, 0.42, light, bevel=0.06)
    front('infrarouge', rr(3.1, 3.4, 1.1, 0.5, 0.2), fy(3.6) - 0.08, fy(3.6) + 0.3, dark)
    for x in (5.0, 9.6):
        front('trappe-carte', rr(x, 3.2, 3.9, 0.7, 0.35), fy(3.5) - 0.08, fy(3.5) + 0.3, light, bevel=0.05)
    fcyl('anneau', 21.2, 3.9, fy(3.9) - 0.1, fy(3.9) + 0.3, 1.25, led('#63e05d', 1.2))
    fcyl('cerclage', 21.2, 3.9, fy(3.9) - 0.12, fy(3.9) + 0.3, 1.12, light)
    fcyl('power', 21.2, 3.9, fy(3.9) - 0.22, fy(3.9) + 0.3, 0.9, white, bevel=0.12)
    front('trappe-usb', rr(24.9, 1.9, 1.0, 3.6, 0.5), fy(3.7) - 0.1, fy(3.7) + 0.3, light, bevel=0.06)


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
    """Atari 2600 (« six interrupteurs »), d'après les photos studio d'Evan-Amos (Wikimedia
    Commons) : 34 × 23 × 7,8 cm, noire, en coin. Devant, une large bande de bois sur toute la
    largeur, puis le dessus nervuré (nervures parallèles à la façade) qui monte vers l'arrière
    entre deux bords lisses ; au fond, un plateau surélevé cerclé d'un filet orange : trois
    interrupteurs chromés de chaque côté et, au milieu, la fente de cartouche. Sans inscriptions."""
    black, rib, dark = plastic('#161618', 0.45), plastic('#2a2a2e', 0.38), plastic('#09090a', 0.6)
    wood, grain, silver, orange = material('#7a4a22', 0.5), material('#57321a', 0.55), metal('#d0d2d6', 0.25), plastic('#d2701f', 0.4)
    W, D = 34.0, 23.0
    slope = lambda y: 4.4 + (y - 1.2) * (2.2 / 11.2)
    # Corps : façade basse, dessus en pente, plateau au fond, dos en biais
    profile('corps', [(0.4, 0.5), (D - 0.2, 0.5), (D - 0.2, 5.6), (20.8, 7.8), (12.6, 7.8), (12.4, 6.6), (1.2, 4.4), (0.2, 4.2)],
            0, W, black, bevel=0.3)
    profile('socle', [(1.5, 0), (D - 1.5, 0), (D - 1.5, 0.6), (1.5, 0.6)], 1.5, W - 1.5, dark)
    # Bande de bois (avec quelques veines) sur toute la façade
    profile('bois', [(-0.06, 0.8), (0.45, 0.8), (0.25, 4.0), (-0.26, 4.0)], 0.7, W - 0.7, wood, bevel=0.06)
    for k in range(6):
        z = 1.1 + k * 0.5
        profile('veine', [(-0.1 - z * 0.08, z), (0.0, z), (0.0, z + 0.07), (-0.1 - z * 0.08, z + 0.07)], 0.9 + k * 1.3, W - 1.1 - k * 0.9, grain)
    # Nervures du dessus, entre deux bords lisses un peu plus hauts
    for i in range(16):
        y0 = 1.6 + i * 0.68
        slab('nervure', 1.3, W - 1.3, y0, slope(y0) + 0.14, y0 + 0.34, slope(y0 + 0.34) + 0.14, rib, t=0.2)
    for x0, x1 in ((0.0, 1.3), (W - 1.3, W)):
        profile('bord', [(1.0, 4.3), (12.5, 6.5), (12.5, 6.82), (1.0, 4.62)], x0, x1, black, bevel=0.15)
    # Plateau du fond : filet orange, interrupteurs, fente de cartouche
    for x0, y0, x1, y1 in ((1.0, 13.2, W - 1.0, 13.32), (1.0, 20.0, W - 1.0, 20.12), (1.0, 13.2, 1.12, 20.12), (W - 1.12, 13.2, W - 1.0, 20.12)):
        box('filet', x0, y0, 7.78, x1, y1, 7.83, orange)
    for x in (4.2, 7.6, 11.0, 23.0, 26.4, 29.8):
        cyl('socle-levier', x, 16.6, 7.75, 7.95, 0.55, dark, bevel=0.08)
        box('levier', x - 0.22, 16.0, 7.9, x + 0.22, 17.0, 9.1, silver, bevel=0.15, r=0.18)
    box('cadre-fente', 13.4, 14.4, 7.75, 20.6, 18.6, 7.98, metal('#8c8e93', 0.35), bevel=0.08)
    box('fente', 13.8, 14.8, 7.8, 20.2, 18.2, 8.02, dark)


def pc_engine():
    """PC Engine, d'après les photos studio d'Evan-Amos (Wikimedia Commons) : un petit carré
    blanc de 14 × 14 × 3,8 cm. Au milieu de la façade, un couloir plus bas mène à la fente des
    HuCard (sombre, au fond) et se termine devant par un creux arrondi pour les doigts ; de part et
    d'autre, deux épaules plus hautes, striées de grilles ; en façade, l'interrupteur vert à gauche
    et la prise manette ronde à droite. Sans le logo."""
    white, shade, dark = plastic('#efeee9', 0.4), plastic('#dcdbd5', 0.45), plastic('#1c1c20', 0.55)
    W, D, H, low = 14.0, 14.0, 3.8, 3.0
    # (blocs légèrement décalés les uns des autres : deux faces dans le même plan font des taches
    # noires au rendu)
    box('socle', 0.06, 0.06, 0, W - 0.06, D - 0.06, low, white, bevel=0.3)
    box('arriere', 0.03, 6.4, 0.5, W - 0.03, D - 0.03, H, white, bevel=0.45)
    for x0, x1 in ((0, 4.3), (W - 4.3, W)):
        box('epaule', x0, 0, 0.5, x1, 6.8, H - 0.01, white, bevel=0.4)
    # Couloir de la carte : stries dans le sens de la profondeur, creux pour les doigts devant
    for i in range(7):
        x = 4.9 + i * 0.68
        box('strie', x, 1.9, low - 0.02, x + 0.12, 6.4, low + 0.04, shade)
    cyl('creux', W / 2, 0.7, low - 0.04, low + 0.01, 1.7, shade, steps=48)
    front('fente', rr(4.8, low + 0.15, W - 9.6, 0.45, 0.15), 6.32, 6.6, dark)
    # Grilles des épaules (lames parallèles à la façade)
    for x0, x1 in ((0.9, 3.6), (W - 3.6, W - 0.9)):
        for i in range(5):
            y = 2.4 + i * 0.5
            box('grille', x0, y, H - 0.04, x1, y + 0.18, H + 0.03, shade)
    # Interrupteur vert à gauche, prise manette ronde à droite, joint autour
    box('interrupteur', 0.9, -0.18, 1.0, 2.1, 0.3, 2.2, plastic('#3caa6c', 0.4), bevel=0.08)
    fcyl('bague', 10.9, 1.5, -0.06, 0.25, 0.75, plastic('#9b9ca1', 0.35))
    fcyl('port', 10.9, 1.5, -0.1, 0.2, 0.55, dark)
    box('joint', -0.02, -0.02, 0.48, W + 0.02, D + 0.02, 0.55, shade)


def neo_geo():
    """Neo-Geo AES, d'après les photos studio d'Evan-Amos (Wikimedia Commons, de trois quarts
    avant et arrière) : 32,5 × 23,7 × 6 cm, noire, le dessus en pente vers l'avant. Sur le dessus,
    un grand anneau en hippodrome autour de la fente de cartouche, des ouïes derrière lui, deux
    rainures qui délimitent le panneau du milieu, et à gauche le gros bouton Reset rond ; en
    façade, l'interrupteur, deux ports manette, la prise casque et la fente de carte mémoire.
    Sans inscriptions."""
    black, dark, ring = plastic('#151517', 0.42), plastic('#070708', 0.6), plastic('#1c1c1f', 0.32)
    W, D = 32.5, 23.7
    slope = lambda y: 3.2 + (y - 0.8) * (2.8 / 21.7)
    profile('corps', [(0, 0), (D, 0), (D, 6.0), (D - 1.2, 6.0), (0.8, 3.2), (0, 3.0)], 0, W, black, bevel=0.4)

    def on_top(name, pts, below, above, mat, bevel=0.0):
        pts = ccw(pts)
        return loft(name, [(x, y, slope(y) - below) for x, y in pts], [(x, y, slope(y) + above) for x, y in pts], mat, bevel)

    # Grand anneau en hippodrome : un gros tube arrondi, sans jointure ; la fente de cartouche au
    # milieu
    cy, r, xl, xr = 15.2, 4.9, 10.8, 21.7
    path = [(xl + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))) for a in range(90, 271, 10)]
    path += [(x, cy - r) for x in (xl + 2.0, (xl + xr) / 2, xr - 2.0)]
    path += [(xr + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))) for a in range(270, 451, 10)]
    path += [(x, cy + r) for x in (xr - 2.0, (xl + xr) / 2, xl + 2.0)]
    sweep('anneau', path, 2.4, 0.9, ring, zfun=lambda x, y: slope(y))
    on_top('volet', [(xl - 2.4, cy - 1.6), (xr + 2.4, cy - 1.6), (xr + 2.4, cy + 0.2), (xl - 2.4, cy + 0.2)], 0.1, 0.12, ring)
    on_top('fente', [(xl - 2.6, cy + 0.2), (xr + 2.6, cy + 0.2), (xr + 2.6, cy + 2.2), (xl - 2.6, cy + 2.2)], 0.1, 0.06, dark)
    # Ouïes au fond, rainures du panneau du milieu
    for i in range(16):
        x = 8.6 + i * 0.95
        on_top('ouie', [(x, 21.4), (x + 0.55, 21.4), (x + 0.55, 22.3), (x, 22.3)], 0.1, 0.03, dark)
    for x in (6.0, 26.4):
        on_top('rainure', [(x, 0.9), (x + 0.12, 0.9), (x + 0.12, 10.2), (x, 10.2)], 0.1, 0.03, dark)
    # Gros bouton Reset rond, à gauche
    on_top('logement-reset', circle(3.2, 7.4, 1.6, 32), 0.1, 0.05, dark)
    on_top('reset', circle(3.2, 7.4, 1.2, 32), 0.1, 0.55, glossy('#2c2d36'), bevel=0.4)
    # Façade : interrupteur, deux ports manette, prise casque, fente de carte mémoire
    box('interrupteur', 1.4, -0.08, 0.9, 3.2, 0.3, 1.6, plastic('#2a2a2e', 0.45), bevel=0.06)
    for x in (8.6, 19.2):
        front('port', [(x, 0.8), (x + 3.2, 0.8), (x + 2.9, 2.1), (x + 0.3, 2.1)], -0.08, 0.4, dark, bevel=0.06)
    fcyl('casque', 13.6, 1.45, -0.08, 0.3, 0.28, dark)
    box('carte', 23.4, -0.08, 1.0, 30.4, 0.4, 1.5, dark)


def gba_sp():
    """Game Boy Advance SP (AGS-001), d'après la photo studio d'Evan-Amos (Wikimedia Commons) :
    fermée 8,4 × 8,2 × 2,4 cm, bleu cobalt métallisé, ici ouverte. Moitié basse : la croix dans
    une cuvette ronde, B et A dans une cuvette allongée, Select et Start ronds en bas à gauche,
    les trous du haut-parleur au milieu, le voyant au-dessus ; au fond, la charnière en trois
    cylindres ; deux petits pieds à l'avant. Moitié haute relevée : un grand cadre noir brillant
    autour de l'écran, une petite pastille ronde aux coins."""
    shell = material('#1d4fd0', 0.3, metal=0.35, coat=0.4)
    recess, grey = material('#163a9e', 0.4, metal=0.3), plastic('#5f646e', 0.45)
    W, D, T = 8.4, 8.2, 1.15
    Z = 0.15 + T                     # dessus de la moitié basse
    for x0 in (0.35, W - 1.35):
        box('pied', x0, 0.15, 0, x0 + 1.0, 1.1, 0.25, shell, bevel=0.08)
    prism('bas', rr(0, 0, W, D, [0.55, 0.55, 0.35, 0.35]), 0.15, Z, shell, bevel=0.25)
    # Croix dans sa cuvette ronde
    cyl('cuvette-croix', 2.0, 4.6, Z - 0.06, Z + 0.01, 1.3, recess)
    prism('croix', cross_pts(2.0, 4.6, 1.75, 0.6), Z - 0.04, Z + 0.24, grey, bevel=0.06)
    # B et A dans une cuvette allongée, en biais (A plus haut)
    bx, by, ax, ay = 5.85, 4.1, 7.15, 4.5
    ang = math.atan2(ay - by, ax - bx)
    mx, my = (bx + ax) / 2, (by + ay) / 2
    pill = [(mx + px * math.cos(ang) - py * math.sin(ang), my + px * math.sin(ang) + py * math.cos(ang))
            for px, py in rr(-1.4, -0.68, 2.8, 1.36, 0.68)]
    prism('cuvette-ab', pill, Z - 0.06, Z + 0.01, recess)
    for cx, cy in ((bx, by), (ax, ay)):
        cyl('bouton', cx, cy, Z - 0.04, Z + 0.22, 0.44, grey, bevel=0.12)
    # Select et Start, ronds, chacun dans sa cuvette ; voyant ; haut-parleur
    for cx in (1.65, 2.85):
        cyl('cuvette-select', cx, 1.3, Z - 0.06, Z + 0.01, 0.5, recess)
        cyl('select', cx, 1.3, Z - 0.04, Z + 0.12, 0.3, grey, bevel=0.06)
    cyl('voyant', 4.55, 6.1, Z - 0.04, Z + 0.06, 0.22, grey, bevel=0.04)
    for row in range(5):
        n = 3 - abs(row - 2) + 1
        for k in range(n):
            cyl('trou', 4.25 + (k - (n - 1) / 2) * 0.34, 1.9 + row * 0.3, Z - 0.02, Z + 0.01, 0.06, plastic('#0f1d4a'), steps=12)
    # Gâchettes L et R, sous la charnière
    for x0 in (-0.05, W - 0.85):
        box('gachette', x0, D - 1.7, 0.45, x0 + 0.9, D + 0.05, Z - 0.1, plastic('#3a3d45', 0.4), bevel=0.15)
    # Charnière : deux cylindres sur la moitié basse, celui du milieu tient la moitié haute
    hy, hz, hr = D - 0.55, Z + 0.15, 0.55
    profile('charniere', circle(hy, hz, hr, 32), 0.2, 3.05, shell, bevel=0.12)
    profile('charniere', circle(hy, hz, hr, 32), 6.05, W - 0.2, shell, bevel=0.12)
    profile('charniere', circle(hy, hz, hr - 0.02, 32), 3.1, 6.0, shell, bevel=0.12)
    # Moitié haute, dessinée à plat (face intérieure vers +z, y = 0 à la charnière), puis relevée
    top, Tt, Dt = [], 1.0, 7.4
    top.append(prism('haut', rr(0, 0, W, Dt, [0.3, 0.3, 0.55, 0.55]), 0, Tt, shell, bevel=0.25))
    top.append(prism('cadre', rr(0.55, 0.75, W - 1.1, Dt - 1.25, 0.25), Tt - 0.02, Tt + 0.04, material('#0e0e12', 0.15, coat=0.8), bevel=0.03))
    top.append(box('ecran', 1.12, 2.0, Tt + 0.04, W - 1.12, 6.1, Tt + 0.07, screen('#3d4045')))
    for cx, cy in ((0.35, 0.4), (W - 0.35, 0.4), (0.35, Dt - 0.4), (W / 2, Dt - 0.3), (W - 0.35, Dt - 0.4)):
        top.append(cyl('pastille', cx, cy, Tt - 0.03, Tt + 0.05, 0.16, recess))
    rot = standing(34)                 # ouverte un peu plus qu'à angle droit
    pivot = rot @ Vector((0, 0, Tt / 2))
    group(top, Matrix.Translation((0, hy - pivot.y + 0.35, hz - pivot.z + 0.1)) @ rot)


def gameboy_pocket():
    """Game Boy Pocket (MGB-001), d'après la photo studio d'Evan-Amos : 7,7 × 12,7 × 2,5 cm,
    argentée ; un grand écran gris-vert dans un cadre gris clair, croix noire, B et A ronds gris
    foncé, Select et Start, le haut-parleur en petits trous ronds en bas à droite ; comme la
    première Game Boy, le coin bas droit du boîtier très arrondi."""
    body = material('#a7aaaf', 0.34, metal=0.6)
    frame = material('#bdc0c3', 0.36, metal=0.45)
    objs = []
    W, Hh, T = 7.7, 12.7, 2.5
    objs.append(prism('corps', rr(0, 0, W, Hh, [0.45, 1.9, 0.45, 0.45]), 0, T, body, bevel=0.3))
    objs.append(prism('cadre', rr(0.55, 6.35, W - 1.1, 5.95, [0.3, 0.9, 0.3, 0.3]), T - 0.02, T + 0.05, frame, bevel=0.04))
    objs.append(box('ecran', 1.2, 7.45, T + 0.05, W - 1.2, 11.95, T + 0.09, material('#9ea695', 0.3, coat=0.4)))
    objs.append(prism('croix', cross_pts(1.95, 4.75, 2.0, 0.7), T - 0.05, T + 0.38, plastic('#1d1d20', 0.4), bevel=0.08))
    for cx, cy in ((4.7, 4.35), (6.05, 4.6)):
        objs.append(cyl('bouton', cx, cy, T - 0.05, T + 0.32, 0.52, plastic('#3a3c43', 0.35), bevel=0.14))
    for cx in (3.15, 4.35):
        objs.append(prism('select', rr(cx - 0.45, 2.3, 0.9, 0.28, 0.14), T - 0.05, T + 0.18, plastic('#55585f', 0.5), bevel=0.05))
    # Haut-parleur : petits trous ronds en rosace
    for ring, count in ((0, 1), (0.28, 6), (0.56, 12)):
        for k in range(count):
            a = 2 * math.pi * k / count
            objs.append(cyl('trou', 6.0 + ring * math.cos(a), 1.35 + ring * math.sin(a), T - 0.02, T + 0.01, 0.07, plastic('#4a4c50'), steps=12))
    group(objs, Matrix.Translation((0, 4.0, 0)) @ standing(14) @ Matrix.Translation((-W / 2, 0, 0)))


def psone():
    """PSone (SCPH-102), d'après la photo studio d'Evan-Amos : 19,3 × 14,4 × 3,8 cm, blanc
    cassé, aux angles très arrondis, le bord du dessus largement arrondi, une couture tout
    autour vers le bas ; le grand capot rond au centre, qui touche presque la façade ; aux coins
    avant du dessus, deux gros boutons ronds dans leur cuvette (Power à gauche, Open à droite) ;
    un panneau à peine surélevé à l'arrière ; en façade, deux blocs gris clair : la fente de
    carte mémoire au-dessus du port manette."""
    body, recess = plastic('#e4e4e1', 0.45), plastic('#cdcdca', 0.5)
    port, hole = plastic('#c8c9c6', 0.5), plastic('#8a8b89', 0.55)
    W, D, H = 19.3, 14.4, 3.8
    prism('bas', rr(0, 0, W, D, 2.6), 0, 1.15, body, bevel=0.25)
    prism('couture', rr(0.12, 0.12, W - 0.24, D - 0.24, 2.5), 1.1, 1.22, recess)
    prism('haut', rr(0.02, 0.02, W - 0.04, D - 0.04, 2.58), 1.18, H, body, bevel=0.65, segments=5,
          top_pts=rr(0.45, 0.45, W - 0.9, D - 0.9, 2.2))
    # Panneau arrière, à peine surélevé, aux bouts en biais
    prism('panneau', [(3.4, D - 0.6), (4.6, D - 2.6), (W - 4.6, D - 2.6), (W - 3.4, D - 0.6)], H - 0.05, H + 0.1, body, bevel=0.06)
    # Capot rond dans son logement, son bord avant au ras de la façade
    cx, cy = W / 2, 7.05
    cyl('logement', cx, cy, H - 0.05, H + 0.12, 6.5, recess)
    cyl('capot', cx, cy, H - 0.05, H + 0.25, 6.35, body, bevel=0.25)
    # Boutons Power et Open dans leur cuvette
    for x in (2.45, W - 2.45):
        cyl('cuvette', x, 2.45, H - 0.08, H + 0.02, 1.62, recess)
        cyl('bouton', x, 2.45, H - 0.06, H + 0.18, 1.4, body, bevel=0.22)
    box('voyant', 1.75, 0.5, H - 0.6, 2.05, 0.62, H - 0.25, plastic('#4a4b4a', 0.4))
    # Façade : deux blocs, la fente de carte mémoire au-dessus du port manette
    for x in (3.3, 9.6):
        box('bloc', x, -0.04, 0.45, x + 4.2, 0.6, 2.85, recess, bevel=0.08)
        box('carte', x + 0.15, -0.08, 2.0, x + 4.05, 0.5, 2.75, port, bevel=0.06)
        box('fente', x + 0.45, -0.1, 2.15, x + 3.75, -0.05, 2.3, hole)
        for k in range(3):
            box('manette', x + 0.2 + k * 1.28, -0.08, 0.6, x + 1.38 + k * 1.28, 0.5, 1.75, port, bevel=0.12)
            for j in range(3):
                cyl_x = x + 0.47 + k * 1.28 + j * 0.32
                box('broche', cyl_x - 0.07, -0.11, 1.08, cyl_x + 0.07, -0.06, 1.27, hole)


def ps2_slim():
    """PlayStation 2 « Slim » (SCPH-70004), d'après la photo studio d'Evan-Amos : 23 × 15,2 ×
    2,8 cm, noire, le dessus mat et grenu ; une bande brillante de l'avant à l'arrière sépare la
    partie fixe (à gauche) du capot du lecteur (à droite) ; en façade, une fine lamelle sous le
    dessus, puis à gauche les fentes de carte mémoire au-dessus des deux ports manette, au
    milieu les deux ports USB, en bas à droite la grille d'aération, au bout droit le bouton."""
    shell, top = plastic('#242427', 0.55), plastic('#2a2a2d', 0.75)
    gloss = material('#17171a', 0.18, coat=0.6)
    core, dark = plastic('#0b0b0c', 0.7), plastic('#050506', 0.8)
    W, D, H = 23.0, 15.2, 2.8
    box('coeur', 0.3, 0.4, 0.05, W - 0.3, D - 0.3, H - 0.2, core)
    box('corps', 0.15, 0.32, 0.0, W - 0.15, D - 0.15, 1.72, shell, bevel=0.08)
    box('lamelle', 0.05, 0.12, 1.8, W - 0.05, D - 0.08, 2.08, shell, bevel=0.05)
    # Dessus en trois parties : partie fixe, bande brillante, capot
    prism('fixe', rr(0, 0, 8.5, D, [0.35, 0, 0, 0.35]), 2.15, H, top, bevel=0.1)
    box('bande', 8.56, 0, 2.15, 9.94, D, H + 0.03, gloss, bevel=0.05)
    prism('capot', rr(10.0, 0, W - 10.0, D, [0, 0.35, 0.35, 0]), 2.15, H, top, bevel=0.1)
    # Façade : cartes mémoire (dans la lamelle) au-dessus des ports manette, à gauche
    for x in (0.7, 4.7):
        box('carte', x + 0.1, 0.06, 1.86, x + 3.2, 0.2, 2.0, dark)
        box('port-manette', x, 0.24, 0.75, x + 3.3, 0.36, 1.5, dark, bevel=0.05)
        for k in range(3):
            box('broches', x + 0.3 + k * 1.0, 0.2, 0.92, x + 1.0 + k * 1.0, 0.28, 1.33, plastic('#2c2c30', 0.5))
    # Deux ports USB, la grille d'aération, le bouton et son voyant
    for x in (8.9, 10.5):
        box('usb', x, 0.24, 0.75, x + 1.1, 0.36, 1.2, dark)
        box('languette', x + 0.12, 0.22, 0.95, x + 0.98, 0.3, 1.08, plastic('#46464b', 0.5))
    for k in range(4):
        z = 0.15 + k * 0.2
        box('fente', 12.3, 0.26, z, 15.4, 0.36, z + 0.11, dark)
    box('bouton', W - 1.6, 0.22, 0.25, W - 0.9, 0.36, 0.95, gloss, bevel=0.05)
    box('voyant', W - 1.45, 0.06, 1.88, W - 1.05, 0.14, 1.98, led('#3ee07a', 3))


def mega_drive_2():
    """Mega Drive II, d'après la photo studio d'Evan-Amos (modèle américain, de même forme) :
    22 × 21,2 cm, noire, plus petite et plus plate que la première : une galette aux flancs
    presque droits, la façade en large pente, posée sur un socle en retrait où se trouvent les
    deux ports manette. À l'arrière du dessus, le grand dôme ovale de la fente de cartouche (un
    anneau en pente, puis un ovale bombé, la fente au fond) ; devant, un plateau à peine
    surélevé avec une plaque sombre (sans son inscription) et la longue rainure où glissent Power
    (à gauche) et Reset (à droite) ; le long du bord arrière, une rangée de fines fentes."""
    black, dark = plastic('#1a1a1c', 0.45), plastic('#060607', 0.6)
    gloss, grey = material('#131315', 0.22, coat=0.5), plastic('#3a3a3f', 0.5)
    W, D, H, ZB = 22.0, 21.2, 3.5, 0.7
    prism('socle', rr(0.5, 0.7, W - 1.0, D - 1.2, 1.7), 0, ZB + 0.05, dark, bevel=0.05)
    loft('corps', [(x, y, ZB) for x, y in ccw(rr(0, 0, W, D, 2.6))],
         [(x, y, H) for x, y in ccw(rr(0.3, 1.7, W - 0.6, D - 2.0, 2.4))], black, bevel=0.3, segments=4)
    # Ports manette dans le socle, à gauche du milieu
    for x in (5.4, 8.9):
        front('port', [(x, 0.12), (x + 2.0, 0.12), (x + 1.8, 0.6), (x + 0.2, 0.6)], 0.6, 0.75, grey, bevel=0.04)
    # Fentes d'aération le long du bord arrière
    for i in range(40):
        x = 2.6 + i * 0.42
        box('aeration', x, D - 1.3, H - 0.04, x + 0.2, D - 0.6, H + 0.02, dark)
    # Dôme ovale : anneau en pente, ovale bombé, la fente et son volet
    def ellipse(cx, cy, a, b, steps=72):
        return [(cx + a * math.cos(2 * math.pi * i / steps), cy + b * math.sin(2 * math.pi * i / steps)) for i in range(steps)]
    cx, cy = W / 2, 13.9
    prism('dome', ellipse(cx, cy, 8.2, 4.8), H - 0.1, H + 0.8, black, bevel=0.35, segments=5, top_pts=ellipse(cx, cy, 7.4, 4.1))
    prism('ovale', ellipse(cx, cy, 6.6, 3.5), H + 0.75, H + 1.3, gloss, bevel=0.3, segments=5, top_pts=ellipse(cx, cy, 6.1, 3.1))
    box('fente', cx - 4.2, cy + 0.4, H + 1.25, cx + 4.2, cy + 1.4, H + 1.36, dark, bevel=0.05)
    box('volet', cx - 4.0, cy - 0.4, H + 1.25, cx + 4.0, cy + 0.4, H + 1.42, gloss, bevel=0.1)
    # Plateau avant, la plaque sombre et la rainure de Power et Reset
    prism('plateau', rr(1.5, 1.9, W - 3.0, 6.4, [0.8, 0.8, 2.6, 2.6]), H - 0.05, H + 0.25, black, bevel=0.15)
    prism('plaque', rr(cx - 2.4, 5.7, 4.8, 1.5, 0.2), H + 0.22, H + 0.3, gloss, bevel=0.04)
    prism('rainure', rr(3.6, 3.75, W - 7.2, 0.75, 0.37), H + 0.2, H + 0.28, dark)
    for x0 in (3.9, W - 7.0):
        prism('glissiere', rr(x0, 3.6, 3.1, 1.05, 0.52), H + 0.18, H + 0.48, gloss, bevel=0.15)

CONSOLES = {'PS1': ps1, 'GB': gameboy, 'NES': nes, 'FDS': fds, 'SNES': snes, 'N64': n64, 'GC': gamecube,
            'SMS': master_system, 'MD': mega_drive, 'GG': game_gear, 'SAT': saturn, 'DC': dreamcast,
            'XBOX': xbox, 'X360': xbox360, 'XONE': xbox_one, 'XSX': xbox_series_x,
            '2600': atari2600, 'PCE': pc_engine, 'NEO': neo_geo,
            'GBC': gbc, 'GBA': gba, 'NDS': nds, '3DS': n3ds, 'PS2': ps2, 'PS3': ps3, 'PS4': ps4, 'PS5': ps5,
            'PSP': psp, 'PSV': psv, 'WII': wii, 'WIIU': wiiu, 'NSW': nsw, 'NSW2': nsw2,
            # Modèles dérivés, dessinés à côté de la console d'origine sur l'accueil (mêmes jeux)
            'GBASP': gba_sp, 'GBP': gameboy_pocket, 'PSONE': psone, 'PS2SLIM': ps2_slim, 'MD2': mega_drive_2}


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
    # CONSOLES_VIEW="x,y,z" : un autre point de vue (pour comparer le dessin à des photos)
    view = os.environ.get('CONSOLES_VIEW')
    direction = Vector([float(v) for v in view.split(',')] if view else (0.55, -1.0, 0.72)).normalized()
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
