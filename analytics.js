(function () {
  const measurementId = 'G-SKG6MYJ68E';

  if (!measurementId || window.gtag) {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };

  const scriptEl = document.createElement('script');
  scriptEl.async = true;
  scriptEl.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
  document.head.appendChild(scriptEl);

  window.gtag('js', new Date());
  window.gtag('config', measurementId);
})();