/* Periodic table on /research/elements/: a click on an element shows a quick look instead of following
   the cell's link, and highlights the molecule and compound rows that contain it. A second click on the
   same element follows the link. Without this script every cell is a plain link to its page. */
(function () {
  var table = document.getElementById('js-pt');
  var look = document.getElementById('js-pt-look');
  if (!table || !look) return;
  var inner = look.firstElementChild;
  var rows = document.querySelectorAll('tr[data-elements]');
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

  function prompt() {
    inner.textContent = '';
    inner.appendChild(el('p', 'pt-look__hint', 'Click an element for a quick look. Click it again to open its page.'));
  }

  function show(cell) {
    var d = cell.dataset;
    inner.textContent = '';
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
    inner.appendChild(text);
  }

  function select(cell) {
    if (selected) selected.classList.remove('is-selected');
    selected = cell;
    var symbol = cell && cell.dataset.category ? cell.dataset.symbol : null;
    rows.forEach(function (row) {
      var match = !!symbol && row.dataset.elements.split(' ').indexOf(symbol) !== -1;
      row.classList.toggle('is-match', match);
    });
    if (cell) {
      cell.classList.add('is-selected');
      show(cell);
    } else {
      prompt();
    }
  }

  table.addEventListener('click', function (event) {
    var cell = event.target.closest('.pt-cell');
    if (!cell) return;
    // Let modified clicks (new tab, new window) and a second click on the same element follow the link
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (cell === selected) return;
    event.preventDefault();
    select(cell);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && selected) select(null);
  });

  look.hidden = false;
  prompt();
})();
