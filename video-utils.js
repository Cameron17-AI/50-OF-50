(function () {
  function normalizeBaseUrl(rawBaseUrl) {
    return String(rawBaseUrl || '').trim().replace(/\/+$/, '');
  }

  function normalizePath(rawPath) {
    return String(rawPath || '').trim().replace(/^\/+/, '');
  }

  function getFileName(rawPath) {
    const normalizedPath = normalizePath(rawPath);
    const parts = normalizedPath.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : normalizedPath;
  }

  function getVideoUrlCandidates(videoPath) {
    if (!videoPath) return [];

    const normalizedPath = String(videoPath).trim();
    if (!normalizedPath) return [];

    if (/^(?:https?:)?\/\//i.test(normalizedPath) || normalizedPath.startsWith('data:') || normalizedPath.startsWith('blob:')) {
      return [normalizedPath];
    }

    const baseUrl = normalizeBaseUrl(window.APP_CONFIG && window.APP_CONFIG.videoBaseUrl);
    if (!baseUrl) {
      return [normalizedPath];
    }

    const fullPath = normalizePath(normalizedPath);
    const fileName = getFileName(normalizedPath);
    const candidates = [`${baseUrl}/${fullPath}`];

    if (fileName && fileName !== fullPath) {
      candidates.push(`${baseUrl}/${fileName}`);
    }

    return [...new Set(candidates)];
  }

  function resolveVideoUrl(videoPath) {
    return getVideoUrlCandidates(videoPath)[0] || '';
  }

  function setVideoElementSource(videoEl, videoPath) {
    if (!videoEl) return;

    const candidates = getVideoUrlCandidates(videoPath);
    if (!candidates.length) {
      videoEl.removeAttribute('src');
      videoEl.load();
      return;
    }

    let candidateIndex = 0;

    const applyCandidate = () => {
      videoEl.src = candidates[candidateIndex];
      videoEl.load();
    };

    videoEl.onerror = () => {
      if (candidateIndex >= candidates.length - 1) {
        videoEl.onerror = null;
        return;
      }

      candidateIndex += 1;
      applyCandidate();
    };

    applyCandidate();
  }

  window.resolveVideoUrl = resolveVideoUrl;
  window.getVideoUrlCandidates = getVideoUrlCandidates;
  window.setVideoElementSource = setVideoElementSource;
})();