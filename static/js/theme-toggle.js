/*  Appearance toggle on the About page: Auto / Light / Dark.
    The choice is stored and applied by window.siteTheme, defined in the <head> of _layouts/default.html.
    The toggle stays hidden without JavaScript, since it could not do anything then.
*/
(function () {
  var toggle = document.getElementById('js-theme-toggle');
  if (!toggle || !window.siteTheme) return;

  var current = toggle.querySelector('input[value="' + window.siteTheme.get() + '"]');
  if (current) current.checked = true;

  toggle.addEventListener('change', function (e) {
    window.siteTheme.set(e.target.value);
  });

  toggle.hidden = false;
})();
