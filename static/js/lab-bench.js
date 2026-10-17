/* Lab bench on /research/elements/ (_includes/research/lab-bench.html): elements go into the beaker,
   and the bench shows which of the molecules and compounds written up here are made of them.
   - An element gets in through the quick look's "Add to bench" button (periodic-table.js calls
     window.labBench.add) or, with a mouse, by dragging its cell onto the beaker. A plain click on a
     cell still opens the quick look, so a drag that moved swallows the click that follows it.
   - Matching is by presence: an item comes out when every element it needs is in the beaker. The
     same element added again raises its chip's count (shown as ×2) but changes nothing yet; counts
     are there for a later rule that checks how many of each.
   - "One element away" lists what one more element would finish, with a button that adds it, and
     that element gets a dot on the table. Elements in the beaker are outlined on the table.
   - Hovering a result lights its elements on the table; clicking its element tiles keeps them lit
     until the next click or Escape.
   The section is hidden until this script runs, so without it nothing is shown. */
(function () {
  var root = document.getElementById('js-lb');
  var table = document.getElementById('js-pt');
  if (!root || !table) return;
  var beaker = document.getElementById('js-lb-beaker');
  var chipsBox = document.getElementById('js-lb-chips');
  var hint = document.getElementById('js-lb-hint');
  var liquid = document.getElementById('js-lb-liquid');
  var countEl = document.getElementById('js-lb-count');
  var clearBtn = document.getElementById('js-lb-clear');
  var cardsBox = document.getElementById('js-lb-cards');
  var outCount = document.getElementById('js-lb-out-count');
  var emptyP = document.getElementById('js-lb-empty');
  var almostList = document.getElementById('js-lb-almost');
  var further = document.getElementById('js-lb-further');

  var cells = {};
  Array.prototype.forEach.call(table.querySelectorAll('.pt-cell'), function (c) { cells[c.dataset.symbol] = c; });
  var items = Array.prototype.map.call(root.querySelectorAll('template.lb-item'), function (t) {
    return {
      kind: t.dataset.kind,
      title: t.dataset.title,
      url: t.dataset.url,
      elements: t.dataset.elements.split(' ').filter(Boolean),
      isomers: Number(t.dataset.isomers || 1),
      template: t
    };
  });
  var usedAnywhere = {};
  items.forEach(function (it) { it.elements.forEach(function (s) { usedAnywhere[s] = true; }); });

  var bench = [];     // [{ symbol, count }] in the order added
  var lit = null;     // the item whose elements stay lit on the table, or null

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
  function entry(symbol) {
    return bench.filter(function (b) { return b.symbol === symbol; })[0] || null;
  }

  function add(symbol) {
    if (!cells[symbol]) return;
    var e = entry(symbol);
    if (e) e.count += 1; else bench.push({ symbol: symbol, count: 1 });
    render();
  }
  function remove(symbol) {
    bench = bench.filter(function (b) { return b.symbol !== symbol; });
    render();
  }
  function clear() {
    bench = [];
    render();
  }

  function chip(b) {
    var c = el('div', 'lb-chip ' + categoryClass(b.symbol) + (usedAnywhere[b.symbol] ? '' : ' is-idle'));
    c.title = usedAnywhere[b.symbol] ? nameOf(b.symbol) : nameOf(b.symbol) + ': nothing written up here uses it yet';
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

  function card(it, usesAll) {
    var c = el('div', 'lb-card' + (usesAll ? ' is-all' : ''));
    c.dataset.title = it.title;
    var pic = it.template.content.querySelector('.lb-pic');
    if (pic) c.appendChild(pic.cloneNode(true));
    c.appendChild(el('p', 'lb-card__name', it.title));
    var meta = el('p', 'lb-card__meta');
    meta.appendChild(document.createTextNode((it.kind === 'molecule' ? 'Molecule' : 'Compound') + ' · '));
    meta.appendChild(it.template.content.querySelector('.lb-formula').cloneNode(true));
    if (it.isomers > 1) meta.appendChild(document.createTextNode(' · ' + it.isomers + ' isomers'));
    meta.appendChild(el('br'));
    meta.appendChild(document.createTextNode(usesAll ? 'Uses everything in the beaker' : 'Uses ' + listWords(it.elements) + ' only'));
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
    var open = el('a', 'lb-card__open', 'Open page →');
    open.href = it.url;
    c.appendChild(open);
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
    countEl.textContent = bench.length ? bench.length + (bench.length === 1 ? ' element' : ' elements') + ' in the beaker' : '';
    clearBtn.hidden = !bench.length;

    // What comes out, what one more element would finish, and what needs more than that
    var made = [], oneAway = {}, moreAway = [];
    items.forEach(function (it) {
      var missing = it.elements.filter(function (s) { return symbols.indexOf(s) === -1; });
      if (!missing.length) {
        made.push(it);
      } else if (!bench.length) {
        return;
      } else if (missing.length === 1) {
        (oneAway[missing[0]] = oneAway[missing[0]] || []).push(it);
      } else if (missing.length < it.elements.length) {
        moreAway.push({ item: it, missing: missing });
      }
    });
    made.sort(function (a, b) { return b.elements.length - a.elements.length || a.title.localeCompare(b.title); });

    lit = null;
    cardsBox.textContent = '';
    made.forEach(function (it) { cardsBox.appendChild(card(it, it.elements.length === symbols.length)); });
    outCount.textContent = made.length ? made.length + ' of ' + items.length : '';
    emptyP.textContent = made.length ? '' : (bench.length
      ? 'Nothing written up here is made of just ' + listWords(symbols.map(nameOf).map(function (n) { return n.toLowerCase(); })) + ' yet.'
      : 'Nothing yet.');

    almostList.textContent = '';
    var keys = Object.keys(oneAway).sort(function (a, b) { return oneAway[b].length - oneAway[a].length || a.localeCompare(b); });
    keys.forEach(function (s) {
      var li = el('li');
      var btn = button('lb-add', null, function () { add(s); });
      btn.appendChild(el('span', 'lb-tile ' + categoryClass(s), s));
      btn.appendChild(document.createTextNode('Add ' + nameOf(s).toLowerCase()));
      li.appendChild(btn);
      li.appendChild(document.createTextNode('→ ' + listWords(oneAway[s].map(function (it) { return it.title.toLowerCase(); }))));
      almostList.appendChild(li);
    });
    if (!keys.length) almostList.appendChild(el('li', 'rs-empty', bench.length ? 'No single element would finish anything else.' : 'Put something in the beaker first.'));
    further.textContent = moreAway.length
      ? 'Further off: ' + moreAway.map(function (m) { return m.item.title.toLowerCase() + ' (needs ' + m.missing.join(' and ') + ')'; }).join('; ') + '.'
      : '';

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
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && lit) { lit = null; light(null); }
  });

  window.labBench = {
    add: add,
    has: function (symbol) { return !!entry(symbol); }
  };
  root.hidden = false;
  render();
})();
