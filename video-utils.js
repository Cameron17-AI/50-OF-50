(function () {
  function normalizeBaseUrl(rawBaseUrl) {
    return String(rawBaseUrl || '').trim().replace(/\/+$/, '');
  }

  function normalizePath(rawPath) {
    return String(rawPath || '').trim().replace(/^\/+/, '');
  }

  function resolveVideoUrl(videoPath) {
    if (!videoPath) return '';

    const normalizedPath = String(videoPath).trim();
    if (!normalizedPath) return '';

    if (/^(?:https?:)?\/\//i.test(normalizedPath) || normalizedPath.startsWith('data:') || normalizedPath.startsWith('blob:')) {
      return normalizedPath;
    }

    const baseUrl = normalizeBaseUrl(window.APP_CONFIG && window.APP_CONFIG.videoBaseUrl);
    if (!baseUrl) {
      return normalizedPath;
    }

    return `${baseUrl}/${normalizePath(normalizedPath)}`;
  }

  window.resolveVideoUrl = resolveVideoUrl;
})();