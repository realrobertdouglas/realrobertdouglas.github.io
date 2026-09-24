/*  Site search
    Loads /search.json the first time someone uses the box, so most visitors never download it.
    Every word must match, in any order, at the start of a word ("star" finds "stars", "art" does not find "start").
    Title matches rank above body matches; words of 4+ letters also match with one typo ("dangrous" finds "dangerous").
    Keys: "/" jumps to the box, arrows move through results, Enter opens one, Escape clears.
*/
(function () {
  var input = document.getElementById('js-search__input');
  var list = document.getElementById('js-search__results');
  var status = document.getElementById('js-search__status');
  if (!input || !list || !status) return;

  var MAX_RESULTS = 10;
  var SNIPPET_BEFORE = 50;
  var SNIPPET_AFTER = 110;
  var WORD_SPLIT = /[^\p{L}\p{N}]+/u;

  var posts = null;
  var loading = null;
  var results = [];
  var active = -1;

  function load() {
    if (!loading) {
      loading = fetch('/search.json')
        .then(function (response) { return response.json(); })
        .then(function (data) {
          posts = data.map(function (post) {
            post.titleLc = post.title.toLowerCase();
            post.textLc = post.text.toLowerCase();
            post.categoriesLc = post.categories.toLowerCase();
            return post;
          });
        })
        .catch(function () {
          loading = null;
          status.textContent = 'Search is unavailable right now.';
        });
    }
    return loading;
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Matches `word` at the start of a word, e.g. "star" in "the stars" but not in "restart".
  function wordStart(word, flags) {
    return new RegExp('(?:^|[^\\p{L}\\p{N}])(' + escapeRegExp(word) + ')', 'u' + (flags || ''));
  }

  // True when a and b differ by at most one inserted, deleted or changed letter.
  function withinOneEdit(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    var i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length > b.length) i++;
      else if (a.length < b.length) j++;
      else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  }

  function wordsOf(post) {
    if (!post.words) {
      post.words = Array.from(new Set((post.titleLc + ' ' + post.textLc).split(WORD_SPLIT)));
    }
    return post.words;
  }

  function countMatches(regex, text, cap) {
    var count = 0;
    regex.lastIndex = 0;
    while (count < cap && regex.exec(text)) count++;
    return count;
  }

  // Scores one post against the query terms; returns null unless every term matches.
  function scorePost(post, terms) {
    var score = 0;
    var highlights = [];

    for (var t = 0; t < terms.length; t++) {
      var term = terms[t];
      var pattern = wordStart(term, 'g');
      var inTitle = pattern.test(post.titleLc);
      var inCategories = wordStart(term).test(post.categoriesLc);
      var inText = countMatches(pattern, post.textLc, 5);

      if (inTitle || inCategories || inText) {
        score += (inTitle ? 10 : 0) + (inCategories ? 4 : 0) + inText;
        highlights.push(term);
        continue;
      }

      if (term.length < 4) return null;
      var near = wordsOf(post).filter(function (word) {
        return word.length >= 3 && withinOneEdit(term, word);
      });
      if (!near.length) return null;
      score += near.some(function (word) { return wordStart(word).test(post.titleLc); }) ? 5 : 1;
      highlights = highlights.concat(near);
    }

    return { post: post, score: score, highlights: highlights };
  }

  // Returns HTML for `text` with every word-start occurrence of `words` wrapped in <mark>.
  function highlight(text, words) {
    var lower = text.toLowerCase();
    var ranges = [];
    words.forEach(function (word) {
      var regex = wordStart(word, 'g');
      var match;
      while ((match = regex.exec(lower))) {
        var start = match.index + match[0].length - match[1].length;
        ranges.push([start, start + word.length]);
      }
    });
    ranges.sort(function (a, b) { return a[0] - b[0]; });

    var html = '';
    var pos = 0;
    ranges.forEach(function (range) {
      if (range[0] < pos) return;
      html += escapeHtml(text.slice(pos, range[0])) + '<mark>' + escapeHtml(text.slice(range[0], range[1])) + '</mark>';
      pos = range[1];
    });
    return html + escapeHtml(text.slice(pos));
  }

  // A short piece of the post around its first matching word, cut at word boundaries.
  function snippet(result) {
    var text = result.post.text;
    var lower = result.post.textLc;
    var first = -1;
    result.highlights.forEach(function (word) {
      var match = wordStart(word).exec(lower);
      if (match) {
        var at = match.index + match[0].length - match[1].length;
        if (first === -1 || at < first) first = at;
      }
    });
    if (first === -1) first = 0;

    var start = Math.max(0, first - SNIPPET_BEFORE);
    var end = Math.min(text.length, first + SNIPPET_AFTER);
    if (start > 0) start = text.indexOf(' ', start) + 1 || start;
    if (end < text.length) end = text.lastIndexOf(' ', end) > first ? text.lastIndexOf(' ', end) : end;

    return (start > 0 ? '… ' : '') + highlight(text.slice(start, end), result.highlights) + (end < text.length ? ' …' : '');
  }

  function setActive(index) {
    var items = list.children;
    if (active >= 0 && items[active]) items[active].classList.remove('is-active');
    active = index;
    if (active >= 0 && items[active]) {
      items[active].classList.add('is-active');
      items[active].scrollIntoView({ block: 'nearest' });
      input.setAttribute('aria-activedescendant', items[active].id);
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function clearResults(message) {
    results = [];
    list.innerHTML = '';
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    status.textContent = message || '';
    setActive(-1);
  }

  function run() {
    var query = input.value.trim().toLowerCase();
    if (query.length < 2) return clearResults();
    if (!posts) return;

    var terms = query.split(WORD_SPLIT).filter(Boolean);
    if (!terms.length) return clearResults();

    var matches = posts
      .map(function (post) { return scorePost(post, terms); })
      .filter(Boolean)
      .sort(function (a, b) { return b.score - a.score; });

    if (!matches.length) return clearResults('No posts match “' + input.value.trim() + '”.');

    results = matches.slice(0, MAX_RESULTS);
    list.innerHTML = results.map(function (result, i) {
      return '<li class="search__result" role="option" id="search-result-' + i + '">' +
        '<a href="' + escapeHtml(result.post.url) + '" tabindex="-1">' +
        '<span class="search__result-title">' + highlight(result.post.title, result.highlights) + '</span>' +
        '<span class="search__result-date">' + escapeHtml(result.post.date) + '</span>' +
        '<span class="search__result-snippet">' + snippet(result) + '</span>' +
        '</a></li>';
    }).join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    status.textContent = matches.length > MAX_RESULTS
      ? 'Top ' + MAX_RESULTS + ' of ' + matches.length + ' posts'
      : matches.length + (matches.length === 1 ? ' post' : ' posts');
    setActive(-1);
  }

  input.addEventListener('focus', load);
  input.addEventListener('input', function () {
    load().then(run);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' && results.length) {
      e.preventDefault();
      setActive(Math.min(active + 1, results.length - 1));
    } else if (e.key === 'ArrowUp' && results.length) {
      e.preventDefault();
      setActive(Math.max(active - 1, -1));
    } else if (e.key === 'Enter' && results.length) {
      e.preventDefault();
      window.location.href = results[Math.max(active, 0)].post.url;
    } else if (e.key === 'Escape') {
      if (input.value) {
        input.value = '';
        clearResults();
      } else {
        input.blur();
      }
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    var target = e.target;
    if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    e.preventDefault();
    input.focus();
  });
})();
