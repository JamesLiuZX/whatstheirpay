// Loaded in <head> (blocking, tiny) so the saved theme applies before first paint.
(function () {
  var root = document.documentElement;
  try {
    var saved = localStorage.getItem('wtp-theme');
    if (saved === 'dark' || saved === 'light') root.setAttribute('data-theme', saved);
  } catch (_) {}
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var current = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        var next = current === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        try {
          localStorage.setItem('wtp-theme', next);
        } catch (_) {}
      });
    });
  });
})();
