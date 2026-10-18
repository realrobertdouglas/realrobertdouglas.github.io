#!/usr/bin/env python3
"""Build the mineral catalog the lab bench reads: every IMA-recognized mineral that has a published
crystal structure, from open databases, without a page each.

    python3 _tools/catalog.py            # from the repo root; resumable, takes a while the first time
    python3 _tools/catalog.py --limit 50 # a quick partial run

Sources, all free to reuse:
  Wikidata        the list of minerals with an IMA status (P579) or number (P484), their formula (P274), crystal
                  system (P556), what they are named after (P138) and type locality (P2695)
  COD             the Crystallography Open Database: for each mineral, the entries that share its
                  element set, filtered by the entry's mineral name; the chosen entry's CIF gives
                  the cell, the symmetry operations and the atom sites

Writes
  static/data/minerals.json      the index the bench loads: one row per mineral with a structure
                                 [name, formula, elements, system, cod id, rank, named after, locality]
  static/data/cells/<cod>.json   the compact cell static/js/crystal-cell.js draws in the browser:
                                 {"cell": [a, b, c, alpha, beta, gamma], "sym": [...], "atoms": [[el, x, y, z], ...]}

Rank is a commonness proxy: a place on the COMMON list below, else the number of COD entries that
carry the mineral's name (the more structures determined, the more studied the mineral).
Raw downloads are cached in _tools/cache/ (gitignored) so a rerun only fetches what is new.
Standard library only.
"""
import argparse, json, os, re, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crystal_lattice import parse_cif, loop_with, number  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, '_tools', 'cache')
OUT_INDEX = os.path.join(ROOT, 'static', 'data', 'minerals.json')
OUT_CELLS = os.path.join(ROOT, 'static', 'data', 'cells')
AGENT = 'douglas.lol research catalog (robert@douglasmining.com)'
COD = 'https://www.crystallography.net/cod/'

# Rock-forming minerals and the ores and gems everyone has heard of, most common first
COMMON = """quartz albite anorthite orthoclase microcline sanidine muscovite biotite phlogopite calcite
dolomite forsterite fayalite augite diopside enstatite hornblende tremolite actinolite almandine
pyrope grossular andradite kaolinite montmorillonite illite talc clinochlore lizardite antigorite
chrysotile epidote zircon apatite-(caf) fluorapatite hydroxylapatite magnetite hematite goethite
ilmenite rutile anatase titanite pyrite pyrrhotite chalcopyrite galena sphalerite halite sylvite
gypsum anhydrite barite celestine fluorite corundum spinel chromite cassiterite molybdenite
cinnabar malachite azurite cuprite bornite chalcocite covellite arsenopyrite stibnite bismuthinite
graphite diamond sulfur gold silver copper platinum nepheline leucite sodalite scapolite
wollastonite tourmaline schorl elbaite dravite topaz beryl cordierite andalusite kyanite
sillimanite staurolite garnet olivine aragonite siderite magnesite rhodochrosite smithsonite
cerussite witherite strontianite monazite-(ce) xenotime-(y) uraninite thorianite scheelite
wolframite ferberite huebnerite columbite-(fe) tantalite-(mn) pyrochlore perovskite bauxite
gibbsite boehmite diaspore brucite periclase lime portlandite nitratine borax colemanite ulexite
kernite jadeite nephrite lazurite turquoise opal chalcedony agate jasper obsidian pumice""".split()
COMMON_RANK = {name: 100000 - i for i, name in enumerate(COMMON)}

SUBSCRIPTS = str.maketrans('₀₁₂₃₄₅₆₇₈₉', '0123456789')


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def fetch(url, name):
    """A cached GET: the body is kept under _tools/cache/<name> and never fetched twice."""
    path = os.path.join(CACHE, name)
    if os.path.exists(path):
        return open(path, 'rb').read()
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': AGENT, 'Accept': 'application/json, text/plain, */*'})
            with urllib.request.urlopen(req, timeout=120) as r:
                body = r.read()
            os.makedirs(os.path.dirname(path), exist_ok=True)
            open(path, 'wb').write(body)
            return body
        except Exception as e:  # noqa: BLE001
            log('retry', name, e)
            time.sleep(3 * (attempt + 1))
    raise RuntimeError('could not fetch ' + url)


def elements_known():
    symbols = set()
    for f in os.listdir(os.path.join(ROOT, '_elements')):
        for line in open(os.path.join(ROOT, '_elements', f), encoding='utf-8'):
            m = re.match(r'^symbol: *"?([A-Z][a-z]?)"?', line)
            if m:
                symbols.add(m.group(1)); break
    return symbols


def wikidata():
    # IMA status (P579) covers the grandfathered minerals, which have no IMA number (P484)
    query = """SELECT DISTINCT ?m ?mLabel ?f ?sysLabel ?namedLabel ?localityLabel WHERE {
      { ?m wdt:P579 ?status } UNION { ?m wdt:P484 ?ima }
      OPTIONAL { ?m wdt:P274 ?f } OPTIONAL { ?m wdt:P556 ?sys }
      OPTIONAL { ?m wdt:P138 ?named } OPTIONAL { ?m wdt:P2695 ?locality }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }"""
    url = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': query, 'format': 'json'})
    rows = json.loads(fetch(url, 'wikidata.json'))['results']['bindings']
    minerals = {}
    for r in rows:
        d = minerals.setdefault(r['m']['value'], {})
        for key, field in [('name', 'mLabel'), ('formula', 'f'), ('system', 'sysLabel'), ('named', 'namedLabel'), ('locality', 'localityLabel')]:
            if field in r and key not in d:
                d[key] = r[field]['value']
    out = []
    for d in minerals.values():
        name = d.get('name', '')
        if not name or name.startswith('Q') and name[1:].isdigit() or 'formula' not in d:
            continue
        d['system'] = d.get('system', '').replace(' crystal system', '')
        out.append(d)
    out.sort(key=lambda d: d['name'])
    return out


def element_set(formula, known):
    f = formula.translate(SUBSCRIPTS)
    found = []
    for s in re.findall(r'[A-Z][a-z]?', f):
        if s in known and s not in found:
            found.append(s)
    return found


def plain_formula(formula):
    return formula.translate(SUBSCRIPTS).replace(' * ', '·').replace('*', '·').replace('☐', '□')


def cod_entries(elements):
    """All COD entries whose formula has exactly these elements."""
    key = '-'.join(sorted(elements))
    params = {'strictmin': len(elements), 'strictmax': len(elements), 'format': 'json'}
    for i, e in enumerate(sorted(elements)):
        params['el%d' % (i + 1)] = e
    body = fetch(COD + 'result?' + urllib.parse.urlencode(params), 'cod/%s.json' % key)
    try:
        return json.loads(body)
    except ValueError:
        return []


def choose(name, entries):
    """The entry to draw: carries the mineral's name and coordinates; the smallest cell among those."""
    wanted = name.lower()
    mine = [e for e in entries if (e.get('mineral') or '').strip().lower() == wanted]
    if not mine:
        return None, 0
    with_xyz = [e for e in mine if 'has coordinates' in (e.get('flags') or '')] or mine
    def size(e):
        try:
            return float(e.get('vol') or 1e9)
        except ValueError:
            return 1e9
    return min(with_xyz, key=size), len(mine)


def site_element(site, known):
    """The element at a site: its type symbol ("Fe2+"), else its label when that names an element
    ("Ca1", "OW"), never a position name ("X", "T1") or a wrong one-letter read of "CA1"."""
    for text in (site.get('_atom_site_type_symbol') or '', site.get('_atom_site_label') or ''):
        m = re.match(r'[A-Za-z][a-z]?', text)
        if not m:
            continue
        two = m.group(0)[:2].capitalize() if len(m.group(0)) > 1 else ''
        one = m.group(0)[0].upper()
        if len(text) > 1 and text[1].isupper() and two in known and (text[2:3].isdigit() or len(text) == 2):
            return two      # "CA1": calcium, not carbon
        if two in known:
            return two
        if one in known:
            return one
    return None


def cell_of(cod_id, known, formula_elements):
    """The compact cell from the entry's CIF, or None when the CIF has no usable sites. Sites whose
    element isn't in the mineral's formula are position names read as elements ("Y" in a tourmaline
    is a site, not yttrium) and are left out; a cell that loses most of its elements that way is
    not drawn at all."""
    body = fetch(COD + cod_id + '.cif', 'cif/%s.cif' % cod_id)
    path = os.path.join(CACHE, 'cif', cod_id + '.cif')
    v, loops = parse_cif(path)
    try:
        cell = [number(v['_cell_length_' + k]) for k in 'abc'] + [number(v['_cell_angle_' + k]) for k in ('alpha', 'beta', 'gamma')]
    except (KeyError, ValueError):
        return None
    ops = [r.get('_space_group_symop_operation_xyz') or r.get('_symmetry_equiv_pos_as_xyz')
           for r in loop_with(loops, '_space_group_symop_operation_xyz') or loop_with(loops, '_symmetry_equiv_pos_as_xyz')]
    ops = [o.replace(' ', '').lower() for o in ops if o]
    if not ops:
        ops = ['x,y,z']
    atoms = []
    for s in loop_with(loops, '_atom_site_fract_x'):
        el = site_element(s, known)
        if not el or el not in formula_elements:
            continue
        try:
            xyz = [round(number(s['_atom_site_fract_' + k]), 4) for k in 'xyz']
        except (KeyError, ValueError):
            continue
        occ = s.get('_atom_site_occupancy', '1')
        try:
            if number(occ) < 0.5:
                continue   # a minor part of a shared site; the drawing keeps the majority element
        except ValueError:
            pass
        atoms.append([el] + xyz)
    present = set(a[0] for a in atoms)
    if not atoms or len(present) * 3 < 2 * len(set(formula_elements) - {'H'}):
        return None
    group = v.get('_symmetry_space_group_name_H-M') or v.get('_space_group_name_H-M_alt') or ''
    return {'cell': [round(x, 4) for x in cell], 'sym': ops, 'atoms': atoms, 'group': group.strip()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0, help='only the first N minerals (a quick check)')
    ap.add_argument('--workers', type=int, default=4)
    args = ap.parse_args()
    known = elements_known()
    minerals = wikidata()
    if args.limit:
        minerals = minerals[:args.limit]
    log(len(minerals), 'minerals with a formula on Wikidata')

    def work(d):
        els = element_set(d['formula'], known)
        if not els or len(els) > 8:
            return None
        try:
            entries = cod_entries(els)
            entry, n = choose(d['name'], entries)
            if not entry:
                return None
            cell = cell_of(entry['file'], known, els)
            if not cell:
                return None
        except Exception as e:  # noqa: BLE001
            log('skip', d['name'], e)
            return None
        return d, els, entry, n, cell

    rows, cells = [], {}
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for i, result in enumerate(pool.map(work, minerals)):
            if i % 200 == 0:
                log(i, 'done,', len(rows), 'with a structure')
            if not result:
                continue
            d, els, entry, n, cell = result
            rank = COMMON_RANK.get(d['name'].lower(), n)
            rows.append([d['name'], plain_formula(d['formula']), ' '.join(els), d.get('system', ''), entry['file'], rank,
                         d.get('named', ''), d.get('locality', '')])
            cells[entry['file']] = cell
    rows.sort(key=lambda r: (-r[5], r[0]))
    os.makedirs(OUT_CELLS, exist_ok=True)
    for stale in os.listdir(OUT_CELLS):   # a mineral that dropped out of the catalog takes its cell with it
        if stale.endswith('.json') and stale[:-5] not in cells:
            os.remove(os.path.join(OUT_CELLS, stale))
    for cod_id, cell in cells.items():
        json.dump(cell, open(os.path.join(OUT_CELLS, cod_id + '.json'), 'w'), separators=(',', ':'))
    json.dump(rows, open(OUT_INDEX, 'w'), separators=(',', ':'), ensure_ascii=False)
    log('wrote', len(rows), 'minerals to', os.path.relpath(OUT_INDEX, ROOT), 'and', len(cells), 'cells')


if __name__ == '__main__':
    main()
