// Applies the saved theme before the page paints to avoid a flash.
(function() {
  if (localStorage.getItem('sli-theme') === 'light') {
    document.documentElement.classList.add('theme-light');
  }
})();
