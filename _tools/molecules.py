#!/usr/bin/env python3
"""Build the molecule catalog the lab bench reads: the chemical compounds people have heard of,
with their structures, from open databases, without a page each.

    python3 _tools/molecules.py             # from the repo root; cached and resumable
    python3 _tools/molecules.py --limit 200 # a quick partial run

Sources, both free to reuse:
  Wikidata   chemical compounds with a PubChem id (P662) and a formula (P274), ranked by how many
             Wikipedias have an article about them (the sitelink count), which is as good a measure
             of "everyone has heard of it" as exists. Elements and minerals are left out (the
             minerals have their own catalog), and so is anything under MIN_LINKS articles.
  PubChem    each compound's 2D structure (atoms, bonds with their order, drawn coordinates), fifty
             compounds a request, public domain.

Writes
  static/data/molecules.json         the index: [name, formula, elements, rank, cid, wikipedia title, heavy atoms]
  static/data/molecules/<cid>.json   {"atoms": [[el, x, y], ...], "bonds": [[i, j, order], ...]} in bond lengths,
                                     atoms numbered from 1 as _molecules/ front matter numbers them; drawn in the
                                     browser by static/js/molecule-structure.js. Molecules over MAX_HEAVY heavy
                                     atoms get no drawing.
Raw downloads are cached in _tools/cache/ (gitignored). Standard library only.
"""
import argparse, hashlib, json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, '_tools', 'cache')
OUT_INDEX = os.path.join(ROOT, 'static', 'data', 'molecules.json')
OUT_DIR = os.path.join(ROOT, 'static', 'data', 'molecules')
AGENT = 'douglas.lol research catalog (robert@douglasmining.com)'
PUBCHEM = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/%s/record/JSON?record_type=2d'
MIN_LINKS = 15          # Wikipedias with an article, at least
RANGES = [(15, 19), (20, 24), (25, 34), (35, 59), (60, 100000)]   # one query each, so none times out
MAX_HEAVY = 60          # heavier molecules are listed but not drawn
BATCH = 50
SUBSCRIPTS = str.maketrans('₀₁₂₃₄₅₆₇₈₉', '0123456789')


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def fetch(url, name, pause=0.0):
    path = os.path.join(CACHE, name)
    if os.path.exists(path):
        return open(path, 'rb').read()
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': AGENT, 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=180) as r:
                body = r.read()
            os.makedirs(os.path.dirname(path), exist_ok=True)
            open(path, 'wb').write(body)
            if pause:
                time.sleep(pause)
            return body
        except Exception as e:  # noqa: BLE001
            log('retry', name, e)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError('could not fetch ' + url)


def elements_known():
    """symbol -> atomic number, from _elements/"""
    table = {}
    for f in os.listdir(os.path.join(ROOT, '_elements')):
        sym = num = None
        for line in open(os.path.join(ROOT, '_elements', f), encoding='utf-8'):
            m = re.match(r'^symbol: *"?([A-Z][a-z]?)"?', line)
            if m: sym = m.group(1)
            m = re.match(r'^number: *(\d+)', line)
            if m: num = int(m.group(1))
            if sym and num: break
        table[sym] = num
    return table


def wikidata(limit):
    compounds = {}
    for lo, hi in RANGES:
        query = """SELECT ?c ?cLabel ?cid ?f ?links ?article WHERE {
          ?c wdt:P662 ?cid ; wdt:P274 ?f ; wikibase:sitelinks ?links .
          FILTER(?links >= %d && ?links <= %d)
          MINUS { ?c wdt:P31 wd:Q11344 }
          MINUS { ?c wdt:P579 ?s }
          MINUS { ?c wdt:P484 ?i }
          OPTIONAL { ?article schema:about ?c ; schema:isPartOf <https://en.wikipedia.org/> }
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }""" % (lo, hi)
        url = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': query, 'format': 'json'})
        rows = json.loads(fetch(url, 'wikidata-molecules-%d-%d.json' % (lo, hi)))['results']['bindings']
        for r in rows:
            name = r['cLabel']['value']
            if not name or (name.startswith('Q') and name[1:].isdigit()):
                continue
            key = name.lower()
            links = int(r['links']['value'])
            if key in compounds and compounds[key]['links'] >= links:
                continue
            article = r.get('article', {}).get('value', '')
            compounds[key] = {
                'name': name, 'cid': r['cid']['value'], 'formula': r['f']['value'], 'links': links,
                'wiki': urllib.parse.unquote(article.rsplit('/', 1)[-1]) if article else ''
            }
        log(len(rows), 'compounds with', lo, 'to', hi, 'articles')
    out = sorted(compounds.values(), key=lambda d: (-d['links'], d['name']))
    return out[:limit] if limit else out


def element_set(formula, known):
    f = formula.translate(SUBSCRIPTS)
    found = []
    for s in re.findall(r'[A-Z][a-z]?', f):
        if s in known and s not in found:
            found.append(s)
    return found


def atom_count(formula, known):
    """How many atoms a plain formula writes out, roughly: Au is 1, O2 is 2, H2O is 3."""
    f = formula.translate(SUBSCRIPTS)
    n = 0
    for sym, digits in re.findall(r'([A-Z][a-z]?)(\d*)', f):
        if sym in known:
            n += int(digits) if digits else 1
    return n


def structures(cids, by_number):
    """cid -> {"atoms", "bonds", "heavy"} from PubChem, fifty a request."""
    out = {}
    for i in range(0, len(cids), BATCH):
        chunk = cids[i:i + BATCH]
        key = hashlib.sha1(','.join(chunk).encode()).hexdigest()[:16]
        try:
            body = fetch(PUBCHEM % ','.join(chunk), 'pubchem/%s.json' % key, pause=0.25)
            records = json.loads(body).get('PC_Compounds', [])
        except Exception as e:  # noqa: BLE001
            log('skip batch', i, e)
            continue
        for rec in records:
            try:
                cid = str(rec['id']['id']['cid'])
                els = [by_number.get(z) for z in rec['atoms']['element']]
                conf = rec['coords'][0]['conformers'][0]
                xs, ys = conf['x'], conf['y']
                aids = rec['atoms']['aid']
                index = {aid: k for k, aid in enumerate(aids)}
                atoms = [[els[k], round(xs[k], 3), round(-ys[k], 3)] for k in range(len(aids)) if els[k]]
                bonds = []
                b = rec.get('bonds', {})
                for a1, a2, order in zip(b.get('aid1', []), b.get('aid2', []), b.get('order', [])):
                    bond = [index[a1] + 1, index[a2] + 1]
                    if order in (2, 3):
                        bond.append(order)
                    bonds.append(bond)
                heavy = sum(1 for e in els if e and e != 'H')
                out[cid] = {'atoms': atoms, 'bonds': bonds, 'heavy': heavy}
            except (KeyError, IndexError, TypeError):
                continue
        if (i // BATCH) % 10 == 0:
            log(i + len(chunk), 'of', len(cids), 'structures asked for,', len(out), 'back')
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0)
    args = ap.parse_args()
    known = elements_known()
    by_number = {n: s for s, n in known.items()}
    compounds = wikidata(args.limit)
    keep = []
    for d in compounds:
        els = element_set(d['formula'], known)
        if not els or atom_count(d['formula'], known) < 2:
            continue
        d['elements'] = els
        keep.append(d)
    log(len(keep), 'compounds worth a structure')
    found = structures([d['cid'] for d in keep], by_number)
    os.makedirs(OUT_DIR, exist_ok=True)
    rows, written = [], set()
    for d in keep:
        s = found.get(d['cid'])
        if not s:
            continue
        heavy = s['heavy']
        if heavy <= MAX_HEAVY:
            json.dump({'atoms': s['atoms'], 'bonds': s['bonds']}, open(os.path.join(OUT_DIR, d['cid'] + '.json'), 'w'), separators=(',', ':'))
            written.add(d['cid'])
        rows.append([d['name'], d['formula'].translate(SUBSCRIPTS), ' '.join(d['elements']), d['links'], d['cid'], d['wiki'], heavy])
    for stale in os.listdir(OUT_DIR):
        if stale.endswith('.json') and stale[:-5] not in written:
            os.remove(os.path.join(OUT_DIR, stale))
    rows.sort(key=lambda r: (-r[3], r[0]))
    json.dump(rows, open(OUT_INDEX, 'w'), separators=(',', ':'), ensure_ascii=False)
    log('wrote', len(rows), 'molecules to', os.path.relpath(OUT_INDEX, ROOT), 'and', len(written), 'drawings')


if __name__ == '__main__':
    main()
