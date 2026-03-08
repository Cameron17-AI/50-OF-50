(function () {
  const USERS_KEY = "50of50_users";
  const CURRENT_USER_KEY = "50of50_currentUser";

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

    const challengeAccess = Boolean(user.challengeAccess);
    return {
      ...user,
      challengeAccess,
      paymentStatus: challengeAccess ? "paid" : (user.paymentStatus || "pending"),
      paymentUnlockedAt: user.paymentUnlockedAt || null,
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

  function clearCurrentUser() {
    localStorage.removeItem(CURRENT_USER_KEY);
  }

  async function syncChallengeAccessFromServer(user) {
    const resolvedUser = normalizeUser(user || getCurrentUser());
    if (!resolvedUser || resolvedUser.challengeAccess) return resolvedUser;

    try {
      const response = await fetch(`/api/payments/status?email=${encodeURIComponent(resolvedUser.email)}`);
      if (!response.ok) return resolvedUser;

      const data = await response.json();
      if (!data.paid) return resolvedUser;

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

  syncCurrentUserFromUsers();

  window.authStore = {
    getUsers,
    getCurrentUser,
    setCurrentUser,
    upsertUser,
    hasChallengeAccess,
    getChallengeEntryPath,
    grantChallengeAccess,
    clearCurrentUser,
    syncChallengeAccessFromServer,
    shouldShowDeveloperBypass,
    syncCurrentUserFromUsers
  };
})();
