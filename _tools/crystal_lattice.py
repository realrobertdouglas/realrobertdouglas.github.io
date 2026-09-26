#!/usr/bin/env python3
"""Turn a CIF crystal structure into the unit-cell drawing on a compound page.

    python3 _tools/crystal_lattice.py galena 9008694.cif --bond Pb-S:3.1

Reads the cell, symmetry operations and atom sites from the CIF (for example one downloaded from
the Crystallography Open Database, https://www.crystallography.net/cod/<id>.cif), fills the unit
cell, adds the copies of atoms that sit on its faces, edges and corners, and views it from a fixed
angle. Writes _data/lattices/<compound>.yml, which _includes/research/crystal-lattice.html draws:
cell edges, bonds, then atoms back to front, farther atoms fainter. Each atom is [element, x, y,
opacity, radius] in pixels. Standard library only.

  --bond A-B:max    draw A-B bonds up to max angstroms (repeatable)
  --group A         also draw atoms outside the cell that bond to an A inside it, so groups such as
                    the CO3 triangles in calcite come out whole
"""
import argparse, math, os, re, shlex

VIEW_TURN = math.radians(-24)   # turn about the vertical axis
VIEW_TILT = math.radians(18)    # look down from slightly above
BOX_W, BOX_H = 300, 440          # the drawing fits in this many pixels, plus padding
PAD = 16
RADIUS = {'O': 0.34, 'C': 0.2, 'H': 0.2}   # drawn radius in angstroms; other elements 0.46


def number(text):
    return float(re.sub(r'\(.*\)', '', text))


def parse_cif(path):
    tokens, values, loops = [], {}, []
    for line in open(path, encoding='utf-8', errors='replace'):
        if line.startswith(';') or line.startswith('#'):
            continue
        tokens.extend(shlex.split(line, posix=True) if "'" in line or '"' in line else line.split())
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t == 'loop_':
            names, i = [], i + 1
            while i < len(tokens) and tokens[i].startswith('_'):
                names.append(tokens[i]); i += 1
            rows = []
            while i < len(tokens) and not tokens[i].startswith('_') and tokens[i] != 'loop_' and not tokens[i].startswith('data_'):
                rows.append(tokens[i:i + len(names)]); i += len(names)
            loops.append((names, rows))
        elif t.startswith('_') and i + 1 < len(tokens):
            values[t] = tokens[i + 1]; i += 2
        else:
            i += 1
    return values, loops


def loop_with(loops, name):
    for names, rows in loops:
        if name in names:
            return [dict(zip(names, r)) for r in rows if len(r) == len(names)]
    return []


def symop(expr):
    """'-y,x-y,z+1/2' -> function of (x, y, z)."""
    parts = expr.replace(' ', '').lower().split(',')
    code = [re.sub(r'(\d)/(\d)', r'(\1/\2)', p) for p in parts]
    return lambda x, y, z: tuple(eval(c, {}, {'x': x, 'y': y, 'z': z}) for c in code)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('compound')
    ap.add_argument('cif')
    ap.add_argument('--bond', action='append', default=[])
    ap.add_argument('--group', action='append', default=[])
    ap.add_argument('--cod')
    args = ap.parse_args()

    v, loops = parse_cif(args.cif)
    a, b, c = (number(v['_cell_length_' + k]) for k in 'abc')
    al, be, ga = (math.radians(number(v['_cell_angle_' + k])) for k in ('alpha', 'beta', 'gamma'))
    ops = [r.get('_space_group_symop_operation_xyz') or r.get('_symmetry_equiv_pos_as_xyz')
           for r in loop_with(loops, '_space_group_symop_operation_xyz') or loop_with(loops, '_symmetry_equiv_pos_as_xyz')]
    ops = [symop(o) for o in ops if o]
    sites = loop_with(loops, '_atom_site_fract_x')

    # Fractional to Cartesian, for any cell
    cy = (math.cos(al) - math.cos(be) * math.cos(ga)) / math.sin(ga)
    cz = math.sqrt(1 - math.cos(be) ** 2 - cy ** 2)
    def cart(f):
        x, y, z = f
        return (a * x + b * math.cos(ga) * y + c * math.cos(be) * z, b * math.sin(ga) * y + c * cy * z, c * cz * z)

    # Every atom in the cell, then copies on faces, edges and corners
    tol = 1e-3
    unique = []
    for s in sites:
        el = s.get('_atom_site_type_symbol') or s['_atom_site_label']
        el = re.match(r'[A-Z][a-z]?', el).group(0)
        f0 = tuple(number(s['_atom_site_fract_' + k]) for k in 'xyz')
        for op in ops:
            f = tuple(t % 1.0 for t in op(*f0))
            f = tuple(0.0 if abs(t - 1) < tol else t for t in f)
            if not any(e == el and all(min(abs(p - q), 1 - abs(p - q)) < tol for p, q in zip(f, g)) for e, g in unique):
                unique.append((el, f))
    atoms = []
    for el, f in unique:
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    g = (f[0] + dx, f[1] + dy, f[2] + dz)
                    if all(t <= 1 + tol for t in g) and (dx == 0 or f[0] < tol) and (dy == 0 or f[1] < tol) and (dz == 0 or f[2] < tol):
                        atoms.append((el, g, True))

    # Bonds, and whole groups that reach outside the cell
    rules = {}
    for spec in args.bond:
        pair, dmax = spec.split(':')
        e1, e2 = pair.split('-')
        rules[frozenset((e1, e2))] = float(dmax)
    if args.group:
        extra = []
        for el, f, _ in atoms:
            if el not in args.group:
                continue
            for e2, g in unique:
                for sx in (-1, 0, 1):
                    for sy in (-1, 0, 1):
                        for sz in (-1, 0, 1):
                            h = (g[0] + sx, g[1] + sy, g[2] + sz)
                            if all(-tol <= t <= 1 + tol for t in h):
                                continue
                            dmax = rules.get(frozenset((el, e2)))
                            if dmax and math.dist(cart(f), cart(h)) <= dmax and (e2, h, False) not in extra:
                                extra.append((e2, h, False))
        atoms += extra
    bonds = []
    for i in range(len(atoms)):
        for j in range(i + 1, len(atoms)):
            dmax = rules.get(frozenset((atoms[i][0], atoms[j][0])))
            if dmax and math.dist(cart(atoms[i][1]), cart(atoms[j][1])) <= dmax:
                bonds.append((i, j))

    # View: turn, tilt, then orthographic projection; nearness sorts atoms back to front
    def view(p):
        x, y, z = p
        x1 = x * math.cos(VIEW_TURN) - y * math.sin(VIEW_TURN)
        y1 = x * math.sin(VIEW_TURN) + y * math.cos(VIEW_TURN)
        near = -y1 * math.cos(VIEW_TILT) + z * math.sin(VIEW_TILT)
        return x1, -(y1 * math.sin(VIEW_TILT) + z * math.cos(VIEW_TILT)), near
    corners = [cart((i, j, k)) for i in (0, 1) for j in (0, 1) for k in (0, 1)]
    pts = [view(cart(f)) for _, f, _ in atoms] + [view(p) for p in corners]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    scale = min(BOX_W / (max(xs) - min(xs)), BOX_H / (max(ys) - min(ys)))
    near = [p[2] for p in pts]
    def screen(p):
        x, y, n = view(p)
        return round((x - min(xs)) * scale + PAD, 1), round((y - min(ys)) * scale + PAD, 1), n
    width = round((max(xs) - min(xs)) * scale + 2 * PAD)
    height = round((max(ys) - min(ys)) * scale + 2 * PAD)

    edges = []
    for i, p in enumerate(corners):
        for j, q in enumerate(corners):
            if i < j and sum(u != w for u, w in zip(format(i, '03b'), format(j, '03b'))) == 1:
                (x1, y1, _), (x2, y2, _) = screen(p), screen(q)
                edges.append(f'[{x1}, {y1}, {x2}, {y2}]')
    drawn = []
    for el, f, inside in atoms:
        x, y, n = screen(cart(f))
        fade = round(0.6 + 0.4 * (n - min(near)) / ((max(near) - min(near)) or 1), 2)
        r = max(3.5, round(RADIUS.get(el, 0.46) * scale, 1))
        drawn.append((n, f'[{el}, {x}, {y}, {fade}, {r}]'))
    drawn.sort(key=lambda t: t[0])
    lines = []
    for i, j in bonds:
        (x1, y1, _), (x2, y2, _) = screen(cart(atoms[i][1])), screen(cart(atoms[j][1]))
        lines.append(f'[{x1}, {y1}, {x2}, {y2}]')

    authors = [r['_publ_author_name'] for r in loop_with(loops, '_publ_author_name')]
    angles = [round(math.degrees(x), 3) for x in (al, be, ga)]
    if a == b == c and angles == [90, 90, 90]:
        cell = f'a = b = c = {a:g} Å, all angles 90°'
    elif a == b and angles == [90, 90, 90]:
        cell = f'a = b = {a:g} Å, c = {c:g} Å, all angles 90°'
    elif a == b and angles == [90, 90, 120]:
        cell = f'a = b = {a:g} Å, c = {c:g} Å, angles 90°, 90° and 120°'
    else:
        cell = f'a = {a:g} Å, b = {b:g} Å, c = {c:g} Å; angles {angles[0]:g}°, {angles[1]:g}° and {angles[2]:g}°'
    group = v.get('_symmetry_space_group_name_H-M') or v.get('_space_group_name_H-M_alt') or ''
    out = [
        f'# Unit cell of {args.compound}, generated by _tools/crystal_lattice.py from {os.path.basename(args.cif)}. Edit the tool, not this file.',
        f'source: "Crystallography Open Database entry {args.cod}"' if args.cod else 'source: ""',
        f'cod: "{args.cod or ""}"',
        f'authors: "{"; ".join(authors)}"',
        f'year: "{v.get("_journal_year", "")}"',
        f'space_group: "{group}"',
        f'cell: "{cell}"',
        f'size: [{width}, {height}]',
        'edges: [' + ', '.join(edges) + ']',
        'bonds: [' + ', '.join(lines) + ']',
        'atoms:',
    ] + [f'  - {d}' for _, d in drawn]
    os.makedirs('_data/lattices', exist_ok=True)
    open(f'_data/lattices/{args.compound}.yml', 'w').write('\n'.join(out) + '\n')
    counts = {}
    for el, f, inside in atoms:
        counts[el] = counts.get(el, 0) + 1
    print(f'{args.compound}: {len(unique)} atoms in the cell {dict((e, sum(1 for x, _ in unique if x == e)) for e in dict(unique))}, '
          f'{len(atoms)} drawn {counts}, {len(bonds)} bonds, {width}x{height}px')


if __name__ == '__main__':
    main()
