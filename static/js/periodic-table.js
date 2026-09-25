/* Periodic table on /research/elements/: a click on an element shows a quick look instead of following
   the cell's link, and highlights the molecule and compound rows that contain it. A second click on the
   same element follows the link. Without this script every cell is a plain link to its page.
   The 57–71 and 89–103 markers open their whole series in the quick look, as tiles, and outline that
   series' row under the table while dimming the rest.
   When the table is wider than the screen and scrolls sideways (phones), the quick look is a card at the
   bottom of the screen instead, so it is never half off-screen. */
(function () {
  var table = document.getElementById('js-pt');
  var look = document.getElementById('js-pt-look');
  if (!table || !look) return;
  var inner = look.firstElementChild;
  var scroller = table.parentElement;
  var rows = document.querySelectorAll('tr[data-elements]');
  var cells = Array.prototype.slice.call(table.querySelectorAll('.pt-cell'));
  var markers = Array.prototype.slice.call(table.querySelectorAll('.pt-series'));
  var selected = null;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // "0.91754(36)" to "91.754%": the uncertainty in brackets is dropped
  function percent(abundance) {
    return Number((parseFloat(abundance) * 100).toPrecision(6)) + '%';
  }

  function isotopeLabel(massNumber, symbol) {
    var span = el('span');
    span.appendChild(el('sup', null, massNumber));
    span.appendChild(document.createTextNode(symbol));
    return span;
  }

  function button(className, text, onClick) {
    var node = el('button', className, text);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  }

  function inSeries(cell, marker) {
    var n = Number(cell.dataset.number);
    return n >= Number(marker.dataset.first) && n <= Number(marker.dataset.last);
  }

  function seriesOf(cell) {
    return markers.filter(function (marker) { return inSeries(cell, marker); })[0] || null;
  }

  function clear() {
    inner.textContent = '';
    var close = button('pt-look__close', '×', function () { select(null); });
    close.setAttribute('aria-label', 'Close');
    inner.appendChild(close);
  }

  function prompt() {
    inner.textContent = '';
    inner.appendChild(el('p', 'pt-look__hint', 'Click an element for a quick look, or 57–71 or 89–103 for a whole series. Click an element again to open its page.'));
  }

  // A whole series as tiles; a tile opens that element's quick look
  function showSeries(marker) {
    var d = marker.dataset;
    clear();
    var box = el('div', 'pt-look__series');
    var title = el('p', 'pt-look__title');
    title.appendChild(el('strong', null, d.label));
    title.appendChild(document.createTextNode(' ' + marker.textContent));
    box.appendChild(title);
    var tiles = el('div', 'pt-look__tiles');
    cells.filter(function (cell) { return inSeries(cell, marker); }).forEach(function (cell) {
      var tile = button('pt-tile ' + cell.className.split(' ').filter(function (c) {
        return c.indexOf('pt-') === 0 && c !== 'pt-cell';
      }).join(' '), null, function () { select(cell); });
      tile.title = cell.dataset.name;
      tile.setAttribute('aria-label', cell.dataset.name + ', ' + cell.dataset.number);
      tile.appendChild(el('small', null, cell.dataset.number));
      tile.appendChild(el('b', null, cell.dataset.symbol));
      tiles.appendChild(tile);
    });
    box.appendChild(tiles);
    inner.appendChild(box);
  }

  function show(cell) {
    var d = cell.dataset;
    clear();
    inner.appendChild(el('span', 'pt-look__sym', d.symbol));
    var text = el('div', 'pt-look__text');

    var title = el('p', 'pt-look__title');
    title.appendChild(el('strong', null, d.name));
    title.appendChild(document.createTextNode(' ' + d.number));
    var open = el('a', 'pt-look__open', 'Open page →');
    open.href = cell.getAttribute('href');
    title.appendChild(open);
    text.appendChild(title);

    if (d.category) {
      text.appendChild(el('p', null, d.category + ' · ' + d.place));

      var isotopes = d.isotopes ? d.isotopes.split(',').map(function (pair) {
        var parts = pair.split(':');
        return { mass: parts[0], abundance: parts[1] };
      }) : [];
      if (isotopes.length) {
        var top = isotopes.reduce(function (a, b) { return parseFloat(b.abundance) > parseFloat(a.abundance) ? b : a; });
        var iso = el('p');
        if (isotopes.length === 1) {
          iso.appendChild(document.createTextNode('One natural isotope, '));
          iso.appendChild(isotopeLabel(top.mass, d.symbol));
        } else {
          iso.appendChild(document.createTextNode(isotopes.length + ' natural isotopes, most common '));
          iso.appendChild(isotopeLabel(top.mass, d.symbol));
          iso.appendChild(document.createTextNode(' (' + percent(top.abundance) + ')'));
        }
        text.appendChild(iso);
      }

      var found = [];
      rows.forEach(function (row) {
        if (row.classList.contains('is-match')) found.push(row.querySelector('a').textContent.toLowerCase());
      });
      var last = found.pop();
      text.appendChild(el('p', null, last ? 'In ' + (found.length ? found.join(', ') + ' and ' : '') + last : 'Not in any molecule or compound here yet'));
    }

    var series = seriesOf(cell);
    if (series) {
      var back = el('p');
      back.appendChild(button('pt-look__back', '← All ' + series.dataset.label.toLowerCase(), function () { select(series); }));
      text.appendChild(back);
    }
    inner.appendChild(text);
  }

  // target is an element's cell, a series marker, or null to clear
  function select(target) {
    if (selected) selected.classList.remove('is-selected');
    selected = target;
    var marker = target && target.classList.contains('pt-series') ? target : null;
    var cell = marker ? null : target;
    table.classList.toggle('is-series', !!marker);
    cells.forEach(function (c) {
      c.classList.toggle('in-series', !!marker && inSeries(c, marker));
    });
    var symbol = cell && cell.dataset.category ? cell.dataset.symbol : null;
    rows.forEach(function (row) {
      var match = !!symbol && row.dataset.elements.split(' ').indexOf(symbol) !== -1;
      row.classList.toggle('is-match', match);
    });
    look.classList.toggle('is-open', !!target);
    if (marker) {
      marker.classList.add('is-selected');
      showSeries(marker);
    } else if (cell) {
      cell.classList.add('is-selected');
      show(cell);
    } else {
      prompt();
    }
  }

  table.addEventListener('click', function (event) {
    var target = event.target.closest('.pt-cell, .pt-series');
    if (!target) return;
    // Let modified clicks (new tab, new window) and a second click on the same element follow the link
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var marker = target.classList.contains('pt-series');
    if (target === selected && !marker) return;
    event.preventDefault();
    // A second click on a series marker closes it
    select(target === selected ? null : target);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && selected) select(null);
  });

  function fit() {
    scroller.classList.toggle('is-narrow', scroller.scrollWidth > scroller.clientWidth + 1);
  }
  window.addEventListener('resize', fit);
  fit();

  look.hidden = false;
  prompt();
})();
