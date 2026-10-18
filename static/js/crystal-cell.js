/* Unit cells drawn in the browser, for the lab bench's catalog of minerals (static/data/cells/<cod>.json,
   written by _tools/catalog.py). The same drawing _tools/crystal_lattice.py makes for a compound
   page, so the two match: the cell is filled from the symmetry operations, copies of the atoms on
   its faces, edges and corners are added, bonds are drawn, and the whole is turned, tilted and
   projected from a fixed angle, nearer atoms drawn last and farther ones fainter.
   Bonds here are automatic, since nobody chose them by hand: two atoms are joined when they are
   closer than 1.2 times the sum of their covalent radii and at least one is a nonmetal.
   window.crystalCell.draw(cell, name) returns an <svg> like _includes/research/crystal-lattice.html's,
   or null when the cell is too big to draw (more than 300 atoms). */
(function () {
  var TURN = -24 * Math.PI / 180;   // turn about the vertical axis
  var TILT = 18 * Math.PI / 180;    // look down from slightly above
  var BOX_W = 300, BOX_H = 440, PAD = 16;
  var RADIUS = { O: 0.34, C: 0.2, H: 0.2 };   // drawn radius in angstroms; other elements 0.46
  var MAX_ATOMS = 300;
  // Covalent radii in angstroms (Cordero et al., 2008)
  var COVALENT = { H: 0.31, He: 0.28, Li: 1.28, Be: 0.96, B: 0.84, C: 0.76, N: 0.71, O: 0.66, F: 0.57, Ne: 0.58, Na: 1.66, Mg: 1.41, Al: 1.21, Si: 1.11, P: 1.07, S: 1.05, Cl: 1.02, Ar: 1.06, K: 2.03, Ca: 1.76, Sc: 1.7, Ti: 1.6, V: 1.53, Cr: 1.39, Mn: 1.39, Fe: 1.32, Co: 1.26, Ni: 1.24, Cu: 1.32, Zn: 1.22, Ga: 1.22, Ge: 1.2, As: 1.19, Se: 1.2, Br: 1.2, Kr: 1.16, Rb: 2.2, Sr: 1.95, Y: 1.9, Zr: 1.75, Nb: 1.64, Mo: 1.54, Tc: 1.47, Ru: 1.46, Rh: 1.42, Pd: 1.39, Ag: 1.45, Cd: 1.44, In: 1.42, Sn: 1.39, Sb: 1.39, Te: 1.38, I: 1.39, Xe: 1.4, Cs: 2.44, Ba: 2.15, La: 2.07, Ce: 2.04, Pr: 2.03, Nd: 2.01, Pm: 1.99, Sm: 1.98, Eu: 1.98, Gd: 1.96, Tb: 1.94, Dy: 1.92, Ho: 1.92, Er: 1.89, Tm: 1.9, Yb: 1.87, Lu: 1.87, Hf: 1.75, Ta: 1.7, W: 1.62, Re: 1.51, Os: 1.44, Ir: 1.41, Pt: 1.36, Au: 1.36, Hg: 1.32, Tl: 1.45, Pb: 1.46, Bi: 1.48, Po: 1.4, At: 1.5, Rn: 1.5, Fr: 2.6, Ra: 2.21, Ac: 2.15, Th: 2.06, Pa: 2.0, U: 1.96, Np: 1.9, Pu: 1.87, Am: 1.8, Cm: 1.69 };
  var NONMETAL = { H: 1, He: 1, B: 1, C: 1, N: 1, O: 1, F: 1, Ne: 1, Si: 1, P: 1, S: 1, Cl: 1, Ar: 1, As: 1, Se: 1, Br: 1, Kr: 1, Te: 1, I: 1, Xe: 1, At: 1, Rn: 1 };
  var TOL = 1e-3;

  // "-y,x-y,z+1/2" -> a function of fractional (x, y, z)
  function symop(expr) {
    var comps = expr.replace(/\s/g, '').toLowerCase().split(',').map(function (part) {
      var c = { x: 0, y: 0, z: 0, k: 0 };
      (part.match(/[+-]?[^+-]+/g) || []).forEach(function (term) {
        var sign = term.charAt(0) === '-' ? -1 : 1;
        var m = term.replace(/^[+-]/, '').match(/^([0-9.\/]*)\*?([xyz])?$/);
        if (!m) return;
        var num = 1;
        if (m[1]) num = m[1].indexOf('/') !== -1 ? Number(m[1].split('/')[0]) / Number(m[1].split('/')[1]) : parseFloat(m[1]);
        if (m[2]) c[m[2]] += sign * num; else c.k += sign * num;
      });
      return c;
    });
    if (comps.length !== 3) return null;
    return function (x, y, z) {
      return comps.map(function (c) { return c.x * x + c.y * y + c.z * z + c.k; });
    };
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  function draw(data, name) {
    var a = data.cell[0], b = data.cell[1], c = data.cell[2];
    var al = data.cell[3] * Math.PI / 180, be = data.cell[4] * Math.PI / 180, ga = data.cell[5] * Math.PI / 180;
    var ops = data.sym.map(symop).filter(Boolean);
    if (!ops.length) ops = [function (x, y, z) { return [x, y, z]; }];

    // Fractional to Cartesian, for any cell
    var cy = (Math.cos(al) - Math.cos(be) * Math.cos(ga)) / Math.sin(ga);
    var cz = Math.sqrt(Math.max(0, 1 - Math.cos(be) * Math.cos(be) - cy * cy));
    function cart(f) {
      return [a * f[0] + b * Math.cos(ga) * f[1] + c * Math.cos(be) * f[2], b * Math.sin(ga) * f[1] + c * cy * f[2], c * cz * f[2]];
    }
    function dist(p, q) {
      return Math.sqrt((p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]) + (p[2] - q[2]) * (p[2] - q[2]));
    }

    // Every atom in the cell once
    var unique = [];
    for (var s = 0; s < data.atoms.length; s++) {
      var el = data.atoms[s][0], f0 = data.atoms[s].slice(1, 4);
      for (var o = 0; o < ops.length; o++) {
        var f = ops[o](f0[0], f0[1], f0[2]).map(function (t) {
          t = t - Math.floor(t);
          return Math.abs(t - 1) < TOL ? 0 : t;
        });
        var seen = false;
        for (var u = 0; u < unique.length && !seen; u++) {
          if (unique[u][0] !== el) continue;
          var g = unique[u][1], same = true;
          for (var k = 0; k < 3 && same; k++) {
            var d = Math.abs(f[k] - g[k]);
            if (Math.min(d, 1 - d) >= TOL) same = false;
          }
          seen = same;
        }
        if (!seen) unique.push([el, f]);
        if (unique.length > MAX_ATOMS) return null;
      }
    }

    // Copies on faces, edges and corners
    var atoms = [];
    unique.forEach(function (uf) {
      var el = uf[0], f = uf[1];
      for (var dx = 0; dx < 2; dx++) for (var dy = 0; dy < 2; dy++) for (var dz = 0; dz < 2; dz++) {
        if ((dx && f[0] >= TOL) || (dy && f[1] >= TOL) || (dz && f[2] >= TOL)) continue;
        atoms.push([el, [f[0] + dx, f[1] + dy, f[2] + dz]]);
      }
    });
    if (atoms.length > MAX_ATOMS * 2) return null;
    var carts = atoms.map(function (at) { return cart(at[1]); });

    var bonds = [];
    for (var i = 0; i < atoms.length; i++) {
      for (var j = i + 1; j < atoms.length; j++) {
        var e1 = atoms[i][0], e2 = atoms[j][0];
        if (!NONMETAL[e1] && !NONMETAL[e2]) continue;
        var dmax = 1.2 * ((COVALENT[e1] || 1.5) + (COVALENT[e2] || 1.5));
        if (dist(carts[i], carts[j]) <= dmax) bonds.push([i, j]);
      }
    }

    // View: turn, tilt, then orthographic projection; nearness sorts atoms back to front
    function view(p) {
      var x1 = p[0] * Math.cos(TURN) - p[1] * Math.sin(TURN);
      var y1 = p[0] * Math.sin(TURN) + p[1] * Math.cos(TURN);
      var near = -y1 * Math.cos(TILT) + p[2] * Math.sin(TILT);
      return [x1, -(y1 * Math.sin(TILT) + p[2] * Math.cos(TILT)), near];
    }
    var corners = [];
    for (var ci = 0; ci < 2; ci++) for (var cj = 0; cj < 2; cj++) for (var ck = 0; ck < 2; ck++) corners.push(cart([ci, cj, ck]));
    var pts = carts.map(view).concat(corners.map(view));
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minN = Infinity, maxN = -Infinity;
    pts.forEach(function (p) {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
      minN = Math.min(minN, p[2]); maxN = Math.max(maxN, p[2]);
    });
    var scale = Math.min(BOX_W / ((maxX - minX) || 1), BOX_H / ((maxY - minY) || 1));
    function screen(p) {
      var v = view(p);
      return [Math.round(((v[0] - minX) * scale + PAD) * 10) / 10, Math.round(((v[1] - minY) * scale + PAD) * 10) / 10, v[2]];
    }
    var width = Math.round((maxX - minX) * scale + 2 * PAD);
    var height = Math.round((maxY - minY) * scale + 2 * PAD);

    var svg = svgEl('svg', { class: 'cl', viewBox: '0 0 ' + width + ' ' + height, width: width, height: height, role: 'img', 'aria-label': 'Unit cell of ' + name });
    for (var p = 0; p < 8; p++) {
      for (var q = p + 1; q < 8; q++) {
        var diff = (p ^ q);
        if (diff !== 1 && diff !== 2 && diff !== 4) continue;   // corners that differ in one axis
        var e1s = screen(corners[p]), e2s = screen(corners[q]);
        svg.appendChild(svgEl('line', { class: 'cl-edge', x1: e1s[0], y1: e1s[1], x2: e2s[0], y2: e2s[1] }));
      }
    }
    bonds.forEach(function (bd) {
      var p1 = screen(carts[bd[0]]), p2 = screen(carts[bd[1]]);
      svg.appendChild(svgEl('line', { class: 'cl-bond', x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] }));
    });
    var drawn = atoms.map(function (at, idx) {
      var sp = screen(carts[idx]);
      var fade = Math.round((0.6 + 0.4 * (sp[2] - minN) / ((maxN - minN) || 1)) * 100) / 100;
      var r = Math.max(3.5, Math.round((RADIUS[at[0]] || 0.46) * scale * 10) / 10);
      return { el: at[0], x: sp[0], y: sp[1], near: sp[2], fade: fade, r: r };
    });
    drawn.sort(function (m, n) { return m.near - n.near; });
    drawn.forEach(function (d) {
      svg.appendChild(svgEl('circle', { class: 'ms-atom ms-atom--' + d.el, cx: d.x, cy: d.y, r: d.r, opacity: d.fade }));
    });
    return svg;
  }

  window.crystalCell = { draw: draw };
})();
