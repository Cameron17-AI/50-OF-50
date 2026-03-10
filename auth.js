(function () {
  const USERS_KEY = "50of50_users";
  const CURRENT_USER_KEY = "50of50_currentUser";

  function getApiBaseUrl() {
    const host = window.location.hostname;
    const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "::1";
    const isAppServer = window.location.port === "3001";

    if (isLocalHost && !isAppServer) {
      return "http://localhost:3001";
    }

    return window.location.origin;
  }

  function apiUrl(path) {
    return getApiBaseUrl() + path;
  }

  function parseStoredJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function normalizeUser(user) {
    if (!user) return null;

    const paymentConsumedAt = user.paymentConsumedAt || user.entryConsumedAt || null;
    const challengeAccess = Boolean(user.challengeAccess) && !paymentConsumedAt;
    const paymentStatus = paymentConsumedAt
      ? "consumed"
      : (challengeAccess ? "paid" : (user.paymentStatus || "pending"));

    return {
      ...user,
      challengeAccess,
      paymentStatus,
      paymentUnlockedAt: user.paymentUnlockedAt || null,
      paymentConsumedAt,
      accessSource: user.accessSource || null,
      devBypass: Boolean(user.devBypass)
    };
  }

  function getUsers() {
    return parseStoredJson(USERS_KEY, []).map(normalizeUser);
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users.map(normalizeUser)));
  }

  function purgeUsersByNames(namesToRemove) {
    const normalizedNames = new Set(
      (namesToRemove || []).map((name) => String(name || '').trim().toLowerCase()).filter(Boolean)
    );

    if (!normalizedNames.size) return;

    const users = getUsers();
    const filteredUsers = users.filter((user) => !normalizedNames.has(String(user?.name || '').trim().toLowerCase()));

    if (filteredUsers.length !== users.length) {
      saveUsers(filteredUsers);
    }

    const currentUser = getCurrentUser();
    if (currentUser && normalizedNames.has(String(currentUser.name || '').trim().toLowerCase())) {
      setCurrentUser(null);
    }
  }

  function getCurrentUser() {
    return normalizeUser(parseStoredJson(CURRENT_USER_KEY, null));
  }

  function setCurrentUser(user) {
    if (!user) {
      localStorage.removeItem(CURRENT_USER_KEY);
      return;
    }

    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(normalizeUser(user)));
  }

  function upsertUser(updatedUser) {
    const normalizedUser = normalizeUser(updatedUser);
    const users = getUsers();
    const index = users.findIndex((user) => user.id === normalizedUser.id);

    if (index === -1) {
      users.push(normalizedUser);
    } else {
      users[index] = normalizedUser;
    }

    saveUsers(users);

    const currentUser = getCurrentUser();
    if (currentUser && currentUser.id === normalizedUser.id) {
      setCurrentUser(normalizedUser);
    }

    return normalizedUser;
  }

  function syncCurrentUserFromUsers() {
    const currentUser = getCurrentUser();
    if (!currentUser) return null;

    const storedUser = getUsers().find((user) => user.id === currentUser.id);
    if (!storedUser) {
      setCurrentUser(null);
      return null;
    }

    setCurrentUser(storedUser);
    return storedUser;
  }

  function hasChallengeAccess(user) {
    const resolvedUser = normalizeUser(user || getCurrentUser());
    return Boolean(resolvedUser && resolvedUser.challengeAccess);
  }

  function getChallengeEntryPath(user) {
    return hasChallengeAccess(user) ? "challenge.html" : "payment.html";
  }

  function grantChallengeAccess(userId, options) {
    const config = options || {};
    const users = getUsers();
    const index = users.findIndex((user) => user.id === userId);

    if (index === -1) return null;

    const unlockedUser = normalizeUser({
      ...users[index],
      challengeAccess: true,
      paymentStatus: "paid",
      paymentUnlockedAt: new Date().toISOString(),
      paymentConsumedAt: null,
      accessSource: config.source || "payment-placeholder",
      paymentReference: config.reference || null,
      devBypass: config.source === "dev-bypass"
    });

    users[index] = unlockedUser;
    saveUsers(users);

    const currentUser = getCurrentUser();
    if (currentUser && currentUser.id === unlockedUser.id) {
      setCurrentUser(unlockedUser);
    }

    return unlockedUser;
  }

  function revokeChallengeAccess(userId, options) {
    const config = options || {};
    const users = getUsers();
    const index = users.findIndex((user) => user.id === userId);

    if (index === -1) return null;

    const revokedUser = normalizeUser({
      ...users[index],
      challengeAccess: false,
      paymentStatus: config.paymentStatus || "pending",
      paymentUnlockedAt: null,
      paymentConsumedAt: null,
      accessSource: config.source || null,
      paymentReference: null,
      devBypass: false
    });

    users[index] = revokedUser;
    saveUsers(users);

    const currentUser = getCurrentUser();
    if (currentUser && currentUser.id === revokedUser.id) {
      setCurrentUser(revokedUser);
    }

    return revokedUser;
  }

  function consumeChallengeAccess(userId, options) {
    const config = options || {};
    const users = getUsers();
    const index = users.findIndex((user) => user.id === userId);

    const currentUser = getCurrentUser();
    const baseUser = index === -1
      ? (currentUser && currentUser.id === userId ? currentUser : null)
      : users[index];

    if (!baseUser) return null;

    const consumedUser = normalizeUser({
      ...baseUser,
      challengeAccess: false,
      paymentStatus: "consumed",
      paymentConsumedAt: config.consumedAt || new Date().toISOString(),
      accessSource: config.source || baseUser.accessSource || "challenge-complete",
      paymentReference: config.reference || baseUser.paymentReference || null,
      devBypass: false
    });

    if (index === -1) {
      users.push(consumedUser);
    } else {
      users[index] = consumedUser;
    }

    saveUsers(users);

    if (currentUser && currentUser.id === consumedUser.id) {
      setCurrentUser(consumedUser);
    }

    return consumedUser;
  }

  function clearCurrentUser() {
    localStorage.removeItem(CURRENT_USER_KEY);
  }

  async function syncChallengeAccessFromServer(user) {
    const resolvedUser = normalizeUser(user || getCurrentUser());
    if (!resolvedUser) return resolvedUser;

    try {
      const response = await fetch(apiUrl(`/api/payments/status?email=${encodeURIComponent(resolvedUser.email)}`));
      if (!response.ok) return resolvedUser;

      const data = await response.json();
      if (!data.paid) {
        if (resolvedUser.devBypass) return resolvedUser;
        return revokeChallengeAccess(resolvedUser.id, {
          source: null,
          paymentStatus: 'pending'
        });
      }

      if (!data.accessAvailable) {
        return consumeChallengeAccess(resolvedUser.id, {
          source: "stripe-server-sync",
          consumedAt: data.payment?.consumedAt || null,
          reference: data.payment?.stripeSessionId || null
        });
      }

      return grantChallengeAccess(resolvedUser.id, {
        source: "stripe-server-sync",
        reference: data.payment?.stripeSessionId || null
      });
    } catch (error) {
      return resolvedUser;
    }
  }

  function shouldShowDeveloperBypass() {
    const params = new URLSearchParams(window.location.search);
    const host = window.location.hostname;
    return params.get("dev") === "1" || host === "localhost" || host === "127.0.0.1";
  }

  purgeUsersByNames(["Cameron Bolt", "Van Williams"]);
  syncCurrentUserFromUsers();

  window.authStore = {
    getUsers,
    getCurrentUser,
    setCurrentUser,
    upsertUser,
    hasChallengeAccess,
    getChallengeEntryPath,
    grantChallengeAccess,
    revokeChallengeAccess,
    consumeChallengeAccess,
    clearCurrentUser,
    purgeUsersByNames,
    syncChallengeAccessFromServer,
    shouldShowDeveloperBypass,
    syncCurrentUserFromUsers,
    getApiBaseUrl,
    apiUrl
  };
})();
