#!/usr/bin/env python3
"""
Génère les icônes d'application (PWA) de Lexora dans public/icons/.

Le jeu d'icônes est reconstructible : aucune retouche manuelle n'est faite sur
les PNG produits. Pour changer une couleur ou un libellé, on modifie SPACES
ci-dessous et on relance le script — les fichiers sont réécrits à l'identique.

    python3 scripts/generate-pwa-icons.py --font /chemin/vers/Outfit-Bold.ttf

Le lettrage reprend public/icon.svg : « LE·X·ORA » réduit au monogramme LX,
crème et or sur le bleu nuit de la marque. Chaque espace applicatif se
distingue par un bandeau d'accent — à 48 px sur un écran d'accueil, c'est le
seul détail encore lisible, et il suffit à ne pas confondre deux icônes.

Dépendance : Pillow (pip install pillow).
"""

from __future__ import annotations

import argparse
import os
from dataclasses import dataclass

from PIL import Image, ImageDraw, ImageFont

# Bleu nuit Lexora (--bg-hero), lettrage crème, X doré : voir app/globals.css
# et components/LexoraLogo.tsx.
NAVY = (11, 15, 46, 255)
CREAM = (232, 234, 252, 255)
GOLD = (212, 175, 55, 255)

# Suréchantillonnage : on dessine en 4× puis on réduit. Pillow ne lisse ni les
# arrondis ni les contours de glyphes autrement, et un coin crénelé se voit
# immédiatement sur un écran d'accueil.
SS = 4

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "icons")

FONT_CANDIDATES = [
    "/mnt/skills/examples/canvas-design/canvas-fonts/Outfit-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


@dataclass(frozen=True)
class Space:
    """Un espace applicatif installable séparément."""

    # Sous-dossier de public/icons/ ; "" pour l'application principale, dont
    # les icônes vivent à la racine de public/icons/.
    slug: str
    # Couleur du bandeau d'accent, seul élément qui varie d'une icône à l'autre.
    accent: tuple[int, int, int, int]


SPACES = [
    Space("", GOLD),
    Space("comptable", (65, 145, 255, 255)),   # --primary
    Space("rh", (34, 197, 94, 255)),           # vert paie / congés
    Space("salarie", (167, 139, 250, 255)),    # violet espace personnel
    Space("client", (56, 189, 248, 255)),      # ciel portail client
    Space("admin", (251, 146, 60, 255)),       # orange administration
]


def load_font(path: str | None) -> str:
    for candidate in ([path] if path else []) + FONT_CANDIDATES:
        if candidate and os.path.exists(candidate):
            return candidate
    raise SystemExit(
        "Aucune police trouvée. Passez --font vers une graisse Bold "
        "(Outfit, Poppins ou équivalent géométrique)."
    )


def draw_icon(size: int, accent: tuple[int, int, int, int], *, maskable: bool, font_path: str) -> Image.Image:
    """
    Dessine une icône carrée de `size` pixels.

    `maskable` réduit le contenu à la zone sûre : Android peut recadrer
    l'icône en cercle, en goutte ou en squircle selon le lanceur, et tout ce
    qui déborde des 80 % centraux est susceptible d'être rogné.
    """
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if maskable:
        # Fond à bords francs : c'est le masque du système qui découpe la
        # forme finale. Un arrondi dessiné ici laisserait des coins vides.
        draw.rectangle([0, 0, s, s], fill=NAVY)
        # Contenu ramené dans le cercle sûr (80 % du côté).
        scale = 0.62
    else:
        # Rayon de public/icon.svg : 37/180 du côté.
        draw.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 37 / 180), fill=NAVY)
        scale = 0.82

    # --- Monogramme LX -------------------------------------------------
    # La taille de police est cherchée par dichotomie : les métriques varient
    # d'une police à l'autre, et coder un ratio en dur donnerait un lettrage
    # trop petit ou débordant dès qu'on change de fonte.
    target_w = s * scale * 0.72
    lo, hi = 10, s
    while lo < hi:
        mid = (lo + hi + 1) // 2
        f = ImageFont.truetype(font_path, mid)
        if draw.textlength("LX", font=f) <= target_w:
            lo = mid
        else:
            hi = mid - 1
    font = ImageFont.truetype(font_path, lo)

    # Le bandeau occupe le bas : on remonte le lettrage d'autant pour que
    # l'ensemble reste optiquement centré.
    bar_h = s * scale * 0.085
    bar_gap = s * scale * 0.10

    box = draw.textbbox((0, 0), "LX", font=font)
    text_w, text_h = box[2] - box[0], box[3] - box[1]
    block_h = text_h + bar_gap + bar_h
    top = (s - block_h) / 2

    x = (s - text_w) / 2 - box[0]
    y = top - box[1]

    # « L » crème puis « X » or, dessinés séparément : une seule chaîne ne
    # peut pas porter deux couleurs.
    draw.text((x, y), "L", font=font, fill=CREAM)
    draw.text((x + draw.textlength("L", font=font), y), "X", font=font, fill=GOLD)

    # --- Bandeau d'accent ----------------------------------------------
    bar_w = text_w * 0.9
    bar_x = (s - bar_w) / 2
    bar_y = top + text_h + bar_gap
    draw.rounded_rectangle(
        [bar_x, bar_y, bar_x + bar_w, bar_y + bar_h],
        radius=bar_h / 2,
        fill=accent,
    )

    return img.resize((size, size), Image.LANCZOS)


def write(img: Image.Image, *parts: str) -> None:
    path = os.path.join(OUT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG", optimize=True)
    print(f"  {os.path.relpath(path, ROOT)}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--font", help="Police Bold à utiliser pour le monogramme")
    font_path = load_font(parser.parse_args().font)
    print(f"Police : {font_path}\n")

    for space in SPACES:
        print(space.slug or "(application principale)")
        for size in (192, 512):
            write(draw_icon(size, space.accent, maskable=False, font_path=font_path),
                  space.slug, f"icon-{size}.png")
            write(draw_icon(size, space.accent, maskable=True, font_path=font_path),
                  space.slug, f"icon-maskable-{size}.png")
        # iOS applique lui-même son masque arrondi : l'icône fournie doit être
        # pleine, sinon les coins transparents virent au noir.
        write(draw_icon(180, space.accent, maskable=True, font_path=font_path),
              space.slug, "apple-touch-icon.png")


if __name__ == "__main__":
    main()
