/* Molecule structures drawn in the browser, for the lab bench's catalog of molecules
   (static/data/molecules/<cid>.json, written by _tools/molecules.py). The same drawing
   _includes/research/molecule-structure.html makes at build time for a molecule page, so the two
   match: atoms are [element, x, y] in bond lengths with y growing downward, bonds name atoms by
   their position in that list counting from 1 with an optional order of 2 or 3, bonds are drawn
   first so atoms sit on top, double and triple bonds as parallel lines.
   window.moleculeStructure.draw(data, name) returns an <svg class="ms">, or null when the molecule
   is too big to draw (more than 150 atoms). */
(function () {
  var SCALE = 56, PAD = 22, R = 15, R_H = 10, MAX_ATOMS = 150;

  function svgEl(tag, attrs) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }
  function r1(n) { return Math.round(n * 10) / 10; }

  function draw(data, name) {
    var atoms = data.atoms, bonds = data.bonds || [];
    if (!atoms || !atoms.length || atoms.length > MAX_ATOMS) return null;
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    atoms.forEach(function (a) {
      minX = Math.min(minX, a[1]); maxX = Math.max(maxX, a[1]);
      minY = Math.min(minY, a[2]); maxY = Math.max(maxY, a[2]);
    });
    var w = Math.round((maxX - minX) * SCALE + PAD * 2), h = Math.round((maxY - minY) * SCALE + PAD * 2);
    function px(a) { return [(a[1] - minX) * SCALE + PAD, (a[2] - minY) * SCALE + PAD]; }
    var svg = svgEl('svg', { class: 'ms', viewBox: '0 0 ' + w + ' ' + h, width: w, height: h, role: 'img', 'aria-label': 'Structure of ' + name });
    bonds.forEach(function (b) {
      var a1 = atoms[b[0] - 1], a2 = atoms[b[1] - 1];
      if (!a1 || !a2) return;
      var p = px(a1), q = px(a2), order = b[2] || 1;
      // Parallel lines for double and triple bonds, offset across the bond (bonds are about one unit long)
      var ox = -(a2[2] - a1[2]) * 5, oy = (a2[1] - a1[1]) * 5;
      var offsets = order === 2 ? [-1, 1] : order === 3 ? [-2, 0, 2] : [0];
      offsets.forEach(function (k) {
        svg.appendChild(svgEl('line', { class: 'ms-bond', x1: r1(p[0] + ox * k), y1: r1(p[1] + oy * k), x2: r1(q[0] + ox * k), y2: r1(q[1] + oy * k) }));
      });
    });
    atoms.forEach(function (a) {
      var p = px(a), g = svgEl('g', { class: 'ms-atom ms-atom--' + a[0] });
      g.appendChild(svgEl('circle', { cx: r1(p[0]), cy: r1(p[1]), r: a[0] === 'H' ? R_H : R }));
      var t = svgEl('text', { x: r1(p[0]), y: r1(p[1] + 4.5), 'text-anchor': 'middle' });
      t.textContent = a[0];
      g.appendChild(t);
      svg.appendChild(g);
    });
    return svg;
  }

  window.moleculeStructure = { draw: draw };
})();
