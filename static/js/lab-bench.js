/* Lab bench on /research/elements/ (_includes/research/lab-bench.html): elements go into the beaker,
   and the bench shows what is made of them.
   - Two tiers. The molecules and compounds written up here come from the page's <template>s and
     carry their drawing and a link to their page. The catalog of minerals (static/data/minerals.json,
     from _tools/catalog.py) is fetched the first time something goes in the beaker; a mineral's unit
     cell (static/data/cells/<cod>.json) is fetched when its card is shown and drawn by
     crystal-cell.js. A written-up item hides its catalog namesake.
   - An element gets in through the quick look's "Add to bench" button (periodic-table.js calls
     window.labBench.add) or, with a mouse, by dragging its cell onto the beaker. A plain click on a
     cell still opens the quick look, so a drag that moved swallows the click that follows it.
   - Matching is by presence: an item comes out when every element it needs is in the beaker. The
     same element added again raises its chip's count (shown as ×2) but changes nothing yet; counts
     are there for a later rule that checks how many of each.
   - Results are ranked: written-up items first, then minerals by commonness (the catalog's rank),
     a dozen shown and the rest behind "Show all". "One element away" is a few faded cards for the
     commonest things one more element would finish, each with a button that adds it; every
     element that would finish something gets a dot on the table, and the quick look (through
     window.labBench.finishes) says what adding that element would finish.
   - Hovering a result lights its elements on the table; clicking its element tiles keeps them lit
     until the next click or Escape.
   The section is hidden until this script runs, so without it nothing is shown. */
(function () {
  var root = document.getElementById('js-lb');
  var table = document.getElementById('js-pt');
  if (!root || !table) return;
  var CATALOG = '/static/data/minerals.json';
  var CELLS = '/static/data/cells/';
  var COD = 'https://www.crystallography.net/cod/';
  var SHOW = 12;        // cards shown before "Show all"
  var GHOSTS = 6;       // "one element away" cards

  var beaker = document.getElementById('js-lb-beaker');
  var chipsBox = document.getElementById('js-lb-chips');
  var hint = document.getElementById('js-lb-hint');
  var liquid = document.getElementById('js-lb-liquid');
  var countEl = document.getElementById('js-lb-count');
  var clearBtn = document.getElementById('js-lb-clear');
  var cardsBox = document.getElementById('js-lb-cards');
  var outCount = document.getElementById('js-lb-out-count');
  var emptyP = document.getElementById('js-lb-empty');
  var moreBtn = document.getElementById('js-lb-more');
  var ghostsBox = document.getElementById('js-lb-ghosts');
  var ghostsEmpty = document.getElementById('js-lb-ghosts-empty');

  var cells = {};
  Array.prototype.forEach.call(table.querySelectorAll('.pt-cell'), function (c) { cells[c.dataset.symbol] = c; });
  var written = Array.prototype.map.call(root.querySelectorAll('template.lb-item'), function (t) {
    return {
      kind: t.dataset.kind,
      title: t.dataset.title,
      url: t.dataset.url,
      elements: t.dataset.elements.split(' ').filter(Boolean),
      isomers: Number(t.dataset.isomers || 1),
      template: t,
      page: true,
      rank: Infinity
    };
  });
  var catalog = null;        // null until asked for, then 'loading', then the minerals
  var cellCache = {};        // cod id -> cell data, a promise while it loads
  var items = written.slice();
  var usedAnywhere = {};
  function index() {
    usedAnywhere = {};
    items.forEach(function (it) { it.elements.forEach(function (s) { usedAnywhere[s] = true; }); });
  }
  index();

  var bench = [];     // [{ symbol, count }] in the order added
  var lit = null;     // the item whose elements stay lit on the table, or null
  var showAll = false;
  var oneAway = {};   // symbol -> the items that element would finish, ranked (from the last render)

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function button(className, text, onClick) {
    var node = el('button', className, text);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  }
  function categoryClass(symbol) {
    var cell = cells[symbol];
    return cell ? cell.className.split(' ').filter(function (c) { return c.indexOf('pt-') === 0 && c !== 'pt-cell'; }).join(' ') : '';
  }
  function nameOf(symbol) { return cells[symbol] ? cells[symbol].dataset.name : symbol; }
  function listWords(words) {
    if (words.length < 2) return words.join('');
    return words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1];
  }
  function formulaNode(formula) {
    var span = el('span', 'rs-formula');
    formula.split(/(\d+)/).forEach(function (part, i) {
      if (!part) return;
      if (i % 2) span.appendChild(el('sub', null, part)); else span.appendChild(document.createTextNode(part));
    });
    return span;
  }
  function entry(symbol) {
    return bench.filter(function (b) { return b.symbol === symbol; })[0] || null;
  }
  function byRank(m, n) {
    if (m.page !== n.page) return m.page ? -1 : 1;
    return (n.rank - m.rank) || m.title.localeCompare(n.title);
  }

  // The catalog: fetched once, the first time the beaker gets something
  function loadCatalog() {
    if (catalog !== null) return;
    catalog = 'loading';
    var taken = {};
    written.forEach(function (it) { taken[it.title.toLowerCase()] = true; });
    fetch(CATALOG).then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) {
      catalog = rows.filter(function (row) { return !taken[row[0].toLowerCase()]; }).map(function (row) {
        return {
          kind: 'mineral',
          title: row[0].charAt(0).toUpperCase() + row[0].slice(1),
          formula: row[1],
          elements: row[2].split(' '),
          system: row[3],
          cod: row[4],
          rank: row[5],
          named: row[6],
          locality: row[7],
          url: COD + row[4] + '.html',
          page: false
        };
      });
      items = written.concat(catalog);
      index();
      render();
    }).catch(function () {
      catalog = [];
      render();
    });
  }

  function add(symbol) {
    if (!cells[symbol]) return;
    var e = entry(symbol);
    if (e) e.count += 1; else bench.push({ symbol: symbol, count: 1 });
    showAll = false;
    loadCatalog();
    render();
  }
  function remove(symbol) {
    bench = bench.filter(function (b) { return b.symbol !== symbol; });
    showAll = false;
    render();
  }
  function clear() {
    bench = [];
    showAll = false;
    render();
  }

  function chip(b) {
    var c = el('div', 'lb-chip ' + categoryClass(b.symbol) + (usedAnywhere[b.symbol] ? '' : ' is-idle'));
    c.title = usedAnywhere[b.symbol] ? nameOf(b.symbol) : nameOf(b.symbol) + ': nothing here uses it yet';
    c.appendChild(el('span', 'pt-sym', b.symbol));
    c.appendChild(el('small', null, nameOf(b.symbol)));
    if (b.count > 1) c.appendChild(el('span', 'lb-chip__n', '×' + b.count));
    var x = button('lb-chip__x', '×', function () { remove(b.symbol); });
    x.setAttribute('aria-label', 'Take ' + nameOf(b.symbol) + ' out of the beaker');
    c.appendChild(x);
    return c;
  }

  // The liquid rises a step per element, up to six; the glass walls run from (31,34) and (67,34)
  // down to (11,89) and (87,89) in the drawing's 100 by 100 box
  function fillLiquid(n) {
    var level = Math.min(n, 6) / 6;
    var y = 87 - level * 48;
    var spread = (y - 34) * (20 / 55);
    var x1 = (31 - spread + 2).toFixed(1), x2 = (67 + spread - 2).toFixed(1);
    liquid.setAttribute('points', '13,87 85,87 ' + x2 + ',' + y.toFixed(1) + ' ' + x1 + ',' + y.toFixed(1));
    liquid.style.opacity = n ? '' : '0';
  }

  function light(item) {
    table.classList.toggle('is-lighting', !!item);
    Object.keys(cells).forEach(function (s) {
      cells[s].classList.toggle('is-lit', !!item && item.elements.indexOf(s) !== -1);
    });
    Array.prototype.forEach.call(cardsBox.children, function (card) {
      card.classList.toggle('is-lit', !!item && card.dataset.title === item.title);
    });
  }

  // A mineral's cell, drawn when its card appears
  function cellPicture(it, pic) {
    if (!window.crystalCell) return;
    var p = cellCache[it.cod];
    if (!p) {
      p = cellCache[it.cod] = fetch(CELLS + it.cod + '.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    }
    p.then(function (data) {
      pic.textContent = '';
      var svg = data && window.crystalCell.draw(data, it.title);
      if (svg) pic.appendChild(svg);
      else pic.appendChild(el('span', 'lb-pic__none', data ? 'Cell too large to draw' : 'No drawing'));
    });
  }

  // A result card, or with `needs` (an element symbol) a faded card for something one element away
  function card(it, usesAll, needs) {
    var c = el('div', 'lb-card' + (usesAll ? ' is-all' : '') + (it.page ? '' : ' is-db') + (needs ? ' is-ghost' : ''));
    c.dataset.title = it.title;
    var pic = el('div', 'lb-pic');
    if (it.page) {
      var drawn = it.template.content.querySelector('.lb-pic');
      if (drawn) pic = drawn.cloneNode(true);
    } else {
      pic.appendChild(el('span', 'lb-pic__none', '…'));
      cellPicture(it, pic);
    }
    c.appendChild(pic);
    c.appendChild(el('p', 'lb-card__name', it.title));
    var meta = el('p', 'lb-card__meta');
    if (it.page) {
      meta.appendChild(document.createTextNode((it.kind === 'molecule' ? 'Molecule' : 'Compound') + ' · '));
      meta.appendChild(it.template.content.querySelector('.lb-formula').cloneNode(true));
      if (it.isomers > 1) meta.appendChild(document.createTextNode(' · ' + it.isomers + ' isomers'));
    } else {
      meta.appendChild(document.createTextNode('Mineral · '));
      meta.appendChild(formulaNode(it.formula));
      if (it.system) meta.appendChild(document.createTextNode(' · ' + it.system));
    }
    meta.appendChild(el('br'));
    meta.appendChild(document.createTextNode(needs ? 'Needs ' + nameOf(needs).toLowerCase() : usesAll ? 'Uses everything in the beaker' : 'Uses ' + listWords(it.elements) + ' only'));
    if (!needs && !it.page && (it.named || it.locality)) {
      meta.appendChild(el('br'));
      meta.appendChild(document.createTextNode(it.named ? 'Named for ' + it.named : 'First found at ' + it.locality));
    }
    c.appendChild(meta);
    var els = el('p', 'lb-card__els');
    it.elements.forEach(function (s) {
      var tile = button('lb-tile ' + categoryClass(s), s, function () {
        lit = lit === it ? null : it;
        light(lit);
      });
      tile.title = nameOf(s) + ': show on the table';
      els.appendChild(tile);
    });
    c.appendChild(els);
    if (needs) {
      var addBtn = button('lb-add lb-card__add', null, function () { add(needs); });
      addBtn.appendChild(el('span', 'lb-tile ' + categoryClass(needs), needs));
      addBtn.appendChild(document.createTextNode('Add ' + nameOf(needs).toLowerCase()));
      c.appendChild(addBtn);
    } else {
      var open = el('a', 'lb-card__open', it.page ? 'Open page →' : 'Structure at COD →');
      open.href = it.url;
      if (!it.page) open.rel = 'noopener';
      c.appendChild(open);
    }
    c.addEventListener('mouseenter', function () { light(it); });
    c.addEventListener('mouseleave', function () { light(lit); });
    return c;
  }

  function render() {
    var symbols = bench.map(function (b) { return b.symbol; });

    chipsBox.textContent = '';
    bench.forEach(function (b) { chipsBox.appendChild(chip(b)); });
    hint.hidden = bench.length > 0;
    fillLiquid(bench.length);
    clearBtn.hidden = !bench.length;
    var minerals = catalog && catalog !== 'loading' ? catalog.length : 0;
    countEl.textContent = bench.length
      ? bench.length + (bench.length === 1 ? ' element' : ' elements') + ' in the beaker'
        + (minerals ? ' · ' + written.length + ' written up here and ' + minerals.toLocaleString() + ' minerals from the Crystallography Open Database' : '')
      : '';

    // What comes out, and what one more element would finish
    var made = [], near = [];
    oneAway = {};
    items.forEach(function (it) {
      var missing = it.elements.filter(function (s) { return symbols.indexOf(s) === -1; });
      if (!missing.length) {
        made.push(it);
      } else if (bench.length && missing.length === 1) {
        near.push({ item: it, needs: missing[0] });
      }
    });
    made.sort(byRank);
    near.sort(function (m, n) { return byRank(m.item, n.item); });
    near.forEach(function (m) { (oneAway[m.needs] = oneAway[m.needs] || []).push(m.item); });

    lit = null;
    cardsBox.textContent = '';
    var shown = showAll ? made : made.slice(0, SHOW);
    shown.forEach(function (it) { cardsBox.appendChild(card(it, it.elements.length === symbols.length)); });
    outCount.textContent = made.length ? made.length.toLocaleString() + (shown.length < made.length ? ', showing ' + shown.length : '') : '';
    moreBtn.hidden = shown.length >= made.length;
    moreBtn.textContent = 'Show all ' + made.length.toLocaleString();
    emptyP.textContent = made.length ? '' : (!bench.length ? 'Nothing yet.'
      : catalog === 'loading' ? 'Looking through the catalog…'
      : 'Nothing here is made of just ' + listWords(symbols.map(nameOf).map(function (n) { return n.toLowerCase(); })) + '.');

    ghostsBox.textContent = '';
    near.slice(0, GHOSTS).forEach(function (m) { ghostsBox.appendChild(card(m.item, false, m.needs)); });
    var dotted = Object.keys(oneAway).length;
    ghostsEmpty.textContent = near.length
      ? (dotted > 1 ? 'The dots on the table mark all ' + dotted + ' elements that would finish something.' : '')
      : !bench.length ? 'Put something in the beaker first.'
      : catalog === 'loading' ? '…' : 'No single element would finish anything else.';

    Object.keys(cells).forEach(function (s) {
      cells[s].classList.toggle('is-on-bench', symbols.indexOf(s) !== -1);
      cells[s].classList.toggle('is-unlock', !!oneAway[s]);
    });
    light(null);

    // The quick look's button, if one is open, says whether its element is already in
    var addButton = document.querySelector('.pt-look__add');
    var selected = document.querySelector('.pt-cell.is-selected');
    if (addButton && selected) addButton.textContent = addLabel(selected.dataset.symbol);
  }

  function addLabel(symbol) {
    return entry(symbol) ? '+ Add another to the bench' : '+ Add to bench';
  }

  // Dragging with a mouse: a cell dragged onto the beaker goes in. A click that didn't move is left
  // alone, so the quick look still opens; after a drag the click that follows is swallowed.
  var drag = null;
  var swallowClick = false;
  table.addEventListener('pointerdown', function (event) {
    var cell = event.target.closest('.pt-cell');
    if (!cell || event.pointerType !== 'mouse' || event.button !== 0) return;
    drag = { cell: cell, x: event.clientX, y: event.clientY, moved: false, ghost: null, id: event.pointerId };
    cell.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  table.addEventListener('pointermove', function (event) {
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
      drag.moved = true;
      var ghost = el('div', 'lb-ghost ' + categoryClass(drag.cell.dataset.symbol));
      ghost.appendChild(el('span', 'pt-num', drag.cell.dataset.number));
      ghost.appendChild(el('span', 'pt-sym', drag.cell.dataset.symbol));
      drag.ghost = ghost;
      document.body.appendChild(ghost);
      document.body.classList.add('lb-dragging');
    }
    drag.ghost.style.left = event.clientX + 'px';
    drag.ghost.style.top = event.clientY + 'px';
    var under = document.elementFromPoint(event.clientX, event.clientY);
    beaker.classList.toggle('is-over', !!under && beaker.contains(under));
  });
  function endDrag(event, cancelled) {
    if (!drag || event.pointerId !== drag.id) return;
    var d = drag;
    drag = null;
    if (d.ghost) d.ghost.remove();
    document.body.classList.remove('lb-dragging');
    beaker.classList.remove('is-over');
    if (!d.moved) return;
    swallowClick = true;
    if (cancelled) return;
    var under = document.elementFromPoint(event.clientX, event.clientY);
    if (under && beaker.contains(under)) add(d.cell.dataset.symbol);
  }
  table.addEventListener('pointerup', function (event) { endDrag(event, false); });
  table.addEventListener('pointercancel', function (event) { endDrag(event, true); });
  table.addEventListener('click', function (event) {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  clearBtn.addEventListener('click', clear);
  moreBtn.addEventListener('click', function () { showAll = true; render(); });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && lit) { lit = null; light(null); }
  });

  window.labBench = {
    add: add,
    has: function (symbol) { return !!entry(symbol); },
    // The names this element would finish on the bench right now, commonest first
    finishes: function (symbol) { return (oneAway[symbol] || []).map(function (it) { return it.title; }); }
  };
  root.hidden = false;
  render();
})();
