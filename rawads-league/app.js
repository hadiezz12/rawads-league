(() => {
  "use strict";

  const STORAGE_KEY = "rawadsLeagueDb.v2";
  const SESSION_KEY = "rawadsLeagueRole.v2";
  const DB_PATH = "./db.json";
  const PAGE_SIZE = 8;

  const blankDb = {
    version: 1,
    settings: {
      leagueName: "Rawad's League",
      leagueSubtitle: "Every action has consequences.",
      adminPasswordHash: "249d5aeb37368f2d6f9ddce20662eb92a38b314f7bccf7d858d621d121d31b51"
    },
    friends: [],
    events: []
  };

  const state = {
    db: structuredClone(blankDb),
    role: sessionStorage.getItem(SESSION_KEY) === "admin" ? "admin" : "spectator",
    search: "",
    pointFilter: "all",
    friendFilter: "all",
    activityLimit: PAGE_SIZE,
    modal: null
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheDom();
    bindEvents();
    renderLoading();
    state.db = await loadDatabase();
    render();
    registerServiceWorker();
  }

  function cacheDom() {
    dom.leagueName = document.getElementById("leagueName");
    dom.leagueSubtitle = document.getElementById("leagueSubtitle");
    dom.roleBadge = document.getElementById("roleBadge");
    dom.loginBtn = document.getElementById("loginBtn");
    dom.logoutBtn = document.getElementById("logoutBtn");
    dom.adminPanel = document.getElementById("adminPanel");
    dom.addFriendBtn = document.getElementById("addFriendBtn");
    dom.addEventBtn = document.getElementById("addEventBtn");
    dom.settingsBtn = document.getElementById("settingsBtn");
    dom.exportBtn = document.getElementById("exportBtn");
    dom.importInput = document.getElementById("importInput");
    dom.friendCount = document.getElementById("friendCount");
    dom.eventCount = document.getElementById("eventCount");
    dom.latestEventText = document.getElementById("latestEventText");
    dom.podium = document.getElementById("podium");
    dom.leaderboard = document.getElementById("leaderboard");
    dom.activity = document.getElementById("activity");
    dom.searchInput = document.getElementById("searchInput");
    dom.friendFilter = document.getElementById("friendFilter");
    dom.showMoreBtn = document.getElementById("showMoreBtn");
    dom.modalRoot = document.getElementById("modalRoot");
    dom.toastRoot = document.getElementById("toastRoot");
  }

  function bindEvents() {
    dom.loginBtn.addEventListener("click", openLoginModal);
    dom.logoutBtn.addEventListener("click", logout);
    dom.addFriendBtn.addEventListener("click", () => openFriendForm());
    dom.addEventBtn.addEventListener("click", () => openEventForm());
    dom.settingsBtn.addEventListener("click", openSettingsForm);
    dom.exportBtn.addEventListener("click", exportDatabase);
    dom.importInput.addEventListener("change", importDatabase);

    dom.searchInput.addEventListener("input", () => {
      state.search = dom.searchInput.value.trim().toLowerCase();
      renderLeaderboard();
    });

    document.querySelectorAll("[data-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        state.pointFilter = button.dataset.filter;
        state.activityLimit = PAGE_SIZE;
        renderActivity();
      });
    });

    dom.friendFilter.addEventListener("change", () => {
      state.friendFilter = dom.friendFilter.value;
      state.activityLimit = PAGE_SIZE;
      renderActivity();
    });

    dom.showMoreBtn.addEventListener("click", () => {
      const total = getFilteredEvents().length;
      state.activityLimit = state.activityLimit >= total ? PAGE_SIZE : total;
      renderActivity();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal();
      if (event.key === "Tab" && state.modal) trapModalFocus(event);
    });
  }

  async function loadDatabase() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return sanitizeDb(JSON.parse(stored));
      } catch (_error) {
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    try {
      const response = await fetch(DB_PATH, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load db.json");
      return sanitizeDb(await response.json());
    } catch (_error) {
      showToast("Using an empty local database because db.json could not be loaded.", "error");
      return structuredClone(blankDb);
    }
  }

  function saveDatabase() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.db));
  }

  function sanitizeDb(input) {
    const db = {
      version: 1,
      settings: {
        leagueName: cleanText(input?.settings?.leagueName) || blankDb.settings.leagueName,
        leagueSubtitle: cleanText(input?.settings?.leagueSubtitle) || blankDb.settings.leagueSubtitle,
        adminPasswordHash: isHash(input?.settings?.adminPasswordHash)
          ? input.settings.adminPasswordHash
          : blankDb.settings.adminPasswordHash
      },
      friends: Array.isArray(input?.friends) ? input.friends.map(sanitizeFriend).filter(Boolean) : [],
      events: Array.isArray(input?.events) ? input.events.map(sanitizeEvent).filter(Boolean) : []
    };

    const friendIds = new Set(db.friends.map((friend) => friend.id));
    db.events = db.events.filter((event) => friendIds.has(event.friendId));
    return db;
  }

  function sanitizeFriend(friend) {
    const name = cleanText(friend?.name);
    if (!name) return null;
    return {
      id: cleanText(friend.id) || makeId(),
      name,
      nickname: cleanText(friend.nickname),
      emoji: cleanText(friend.emoji),
      avatarUrl: cleanText(friend.avatarUrl),
      bio: cleanText(friend.bio),
      createdAt: validDate(friend.createdAt) || new Date().toISOString(),
      updatedAt: validDate(friend.updatedAt) || new Date().toISOString()
    };
  }

  function sanitizeEvent(event) {
    const points = Number(event?.points);
    const reason = cleanText(event?.reason);
    if (!Number.isInteger(points) || points === 0 || !reason) return null;
    return {
      id: cleanText(event.id) || makeId(),
      friendId: cleanText(event.friendId),
      points,
      reason,
      eventDate: validDate(event.eventDate) || new Date().toISOString(),
      createdAt: validDate(event.createdAt) || new Date().toISOString(),
      updatedAt: validDate(event.updatedAt) || new Date().toISOString()
    };
  }

  function renderLoading() {
    dom.podium.replaceChildren(skeleton("card"), skeleton("card"), skeleton("card"));
    dom.leaderboard.replaceChildren(skeleton("row"), skeleton("row"), skeleton("row"));
    dom.activity.replaceChildren(skeleton("row"), skeleton("row"), skeleton("row"));
  }

  function render() {
    document.title = `${state.db.settings.leagueName} | Friendship League`;
    dom.leagueName.textContent = state.db.settings.leagueName;
    dom.leagueSubtitle.textContent = state.db.settings.leagueSubtitle;
    dom.roleBadge.textContent = state.role === "admin" ? "Admin" : "Spectator";
    dom.roleBadge.classList.toggle("admin", state.role === "admin");
    dom.loginBtn.hidden = state.role === "admin";
    dom.logoutBtn.hidden = state.role !== "admin";
    dom.adminPanel.hidden = state.role !== "admin";

    dom.friendCount.textContent = String(state.db.friends.length);
    dom.eventCount.textContent = String(state.db.events.length);
    dom.latestEventText.textContent = latestSummary();

    renderFriendFilter();
    renderPodium();
    renderLeaderboard();
    renderActivity();
  }

  function renderFriendFilter() {
    const current = state.db.friends.some((friend) => friend.id === state.friendFilter) ? state.friendFilter : "all";
    state.friendFilter = current;
    dom.friendFilter.replaceChildren(option("All friends", "all"));
    sortByName(state.db.friends).forEach((friend) => dom.friendFilter.appendChild(option(friend.name, friend.id)));
    dom.friendFilter.value = state.friendFilter;
  }

  function renderPodium() {
    const standings = calculateStandings();
    dom.podium.replaceChildren();

    if (!standings.length) {
      dom.podium.appendChild(emptyState("No friends yet", state.role === "admin" ? "Add the first friend." : "Rawad has not added friends yet."));
      return;
    }

    const top = standings.slice(0, 3);
    const ordered = top.length >= 3 ? [top[1], top[0], top[2]] : top;

    ordered.forEach((item) => {
      const card = el("button", "podium-card");
      card.type = "button";
      card.classList.add(`rank-${item.rank <= 3 ? item.rank : "other"}`);
      card.setAttribute("aria-label", `Open ${item.name}'s profile`);
      card.addEventListener("click", () => openProfile(item.id));
      card.append(rankMedal(item.rank), avatar(item, "large"), textEl("strong", item.name), pointsPill(item.total));
      dom.podium.appendChild(card);
    });
  }

  function renderLeaderboard() {
    const standings = calculateStandings();
    dom.leaderboard.replaceChildren();

    if (!standings.length) {
      dom.leaderboard.appendChild(emptyState("Empty leaderboard", state.role === "admin" ? "Use Add friend to start." : "Nothing to show yet."));
      return;
    }

    const filtered = standings.filter((friend) => {
      if (!state.search) return true;
      return `${friend.name} ${friend.nickname}`.toLowerCase().includes(state.search);
    });

    if (!filtered.length) {
      dom.leaderboard.appendChild(emptyState("No search results", "No friend matches that search."));
      return;
    }

    const movement = calculateMovement();
    filtered.forEach((item) => {
      const row = el("button", "leader-row");
      row.type = "button";
      row.setAttribute("aria-label", `Open ${item.name}'s profile`);
      row.addEventListener("click", () => openProfile(item.id));

      const person = el("span", "person");
      person.append(avatar(item, "medium"), nameBlock(item));

      row.append(rankChip(item.rank), person, pointsPill(item.total), movementPill(movement.get(item.id)));
      dom.leaderboard.appendChild(row);
    });
  }

  function renderActivity() {
    document.querySelectorAll("[data-filter]").forEach((button) => {
      const active = button.dataset.filter === state.pointFilter;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    const events = getFilteredEvents();
    dom.activity.replaceChildren();

    if (!state.db.events.length) {
      dom.activity.appendChild(emptyState("No point events", state.role === "admin" ? "Record the first award or deduction." : "No activities have been recorded yet."));
      dom.showMoreBtn.hidden = true;
      return;
    }

    if (!events.length) {
      dom.activity.appendChild(emptyState("No matching activity", "Try another filter."));
      dom.showMoreBtn.hidden = true;
      return;
    }

    events.slice(0, state.activityLimit).forEach((event) => dom.activity.appendChild(activityCard(event)));
    dom.showMoreBtn.hidden = events.length <= PAGE_SIZE;
    dom.showMoreBtn.textContent = state.activityLimit >= events.length ? "Show fewer" : `Show all ${events.length}`;
  }

  function activityCard(event) {
    const friend = friendById(event.friendId);
    const card = el("article", "activity-card");
    const top = el("div", "activity-top");
    const title = el("div", "activity-title");
    title.append(textEl("strong", friend?.name || "Deleted friend"), textEl("span", formatDate(event.eventDate)));
    top.append(avatar(friend, "small"), title, pointBadge(event.points));

    const reason = textEl("p", event.reason);
    reason.className = "reason";

    const meta = el("div", "activity-meta");
    meta.appendChild(textEl("span", relativeDate(event.eventDate)));
    if (state.role === "admin") {
      const actions = el("span", "mini-actions");
      actions.append(
        smallButton("Edit", () => openEventForm(event)),
        smallButton("Delete", () => confirmDeleteEvent(event))
      );
      meta.appendChild(actions);
    }

    card.append(top, reason, meta);
    return card;
  }

  function openLoginModal() {
    const form = el("form", "form");
    const password = input("password", "Password", "password");
    password.control.autocomplete = "current-password";
    password.control.setAttribute("aria-label", "Admin password");
    const toggle = button("Show", "secondary", () => {
      password.control.type = password.control.type === "password" ? "text" : "password";
      toggle.textContent = password.control.type === "password" ? "Show" : "Hide";
    });
    const passwordRow = el("div", "password-row");
    passwordRow.append(password.control, toggle);
    const status = formStatus();
    const submit = button("Login", "primary");
    submit.type = "submit";

    form.append(labelWrap("Admin password", passwordRow), status, actionRow(button("Cancel", "ghost", closeModal), submit));
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setStatus(status, "");
      submit.disabled = true;
      submit.textContent = "Checking...";
      const hash = await sha256(password.control.value);
      if (hash !== state.db.settings.adminPasswordHash) {
        state.role = "spectator";
        sessionStorage.removeItem(SESSION_KEY);
        submit.disabled = false;
        submit.textContent = "Login";
        setStatus(status, "Wrong password.", "error");
        return;
      }
      state.role = "admin";
      sessionStorage.setItem(SESSION_KEY, "admin");
      closeModal();
      render();
      showToast("Admin mode enabled.", "success");
    });

    openModal("Admin login", "Spectators can view only. Admin can edit local JSON data.", form);
  }

  function logout() {
    state.role = "spectator";
    sessionStorage.removeItem(SESSION_KEY);
    render();
    showToast("Back to spectator mode.", "success");
  }

  function openFriendForm(friend = null) {
    if (!requireAdmin()) return;
    const editing = Boolean(friend);
    const form = el("form", "form");
    const name = input("text", "Name", "text", friend?.name || "");
    const nickname = input("text", "Nickname", "text", friend?.nickname || "");
    const emoji = input("text", "Emoji", "text", friend?.emoji || "");
    const avatarUrl = input("url", "Avatar URL", "url", friend?.avatarUrl || "");
    const bio = textarea("Bio", friend?.bio || "");
    const status = formStatus();
    const submit = button(editing ? "Save friend" : "Add friend", "primary");
    submit.type = "submit";

    form.append(
      field(name), field(nickname), field(emoji), field(avatarUrl), field(bio),
      status,
      actionRow(button("Cancel", "ghost", closeModal), submit)
    );

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const payload = {
        name: cleanText(name.control.value),
        nickname: cleanText(nickname.control.value),
        emoji: cleanText(emoji.control.value),
        avatarUrl: cleanText(avatarUrl.control.value),
        bio: cleanText(bio.control.value)
      };

      if (!payload.name) {
        setStatus(status, "Name is required.", "error");
        return;
      }

      if (payload.avatarUrl && !isUrl(payload.avatarUrl)) {
        setStatus(status, "Avatar URL must start with http:// or https://.", "error");
        return;
      }

      const now = new Date().toISOString();
      if (editing) {
        Object.assign(friend, payload, { updatedAt: now });
      } else {
        state.db.friends.push({ id: makeId(), ...payload, createdAt: now, updatedAt: now });
      }
      saveDatabase();
      closeModal();
      render();
      showToast(editing ? "Friend updated." : "Friend added.", "success");
    });

    openModal(editing ? "Edit friend" : "Add friend", "Simple local JSON record.", form);
  }

  function openEventForm(eventRecord = null, preselectedFriendId = "") {
    if (!requireAdmin()) return;
    if (!state.db.friends.length) {
      showToast("Add a friend first.", "error");
      openFriendForm();
      return;
    }

    const editing = Boolean(eventRecord);
    const form = el("form", "form");
    const friend = select("Friend", sortByName(state.db.friends).map((item) => [item.name, item.id]));
    const type = select("Type", [["Award points", "award"], ["Deduct points", "deduct"]]);
    const amount = input("number", "Amount", "number", eventRecord ? String(Math.abs(eventRecord.points)) : "1");
    amount.control.min = "1";
    amount.control.step = "1";
    const reason = textarea("Reason", eventRecord?.reason || "");
    const date = input("datetime-local", "Date and time", "datetime-local", toDateTimeLocal(eventRecord?.eventDate || new Date().toISOString()));
    const status = formStatus();
    const submit = button(editing ? "Save activity" : "Record activity", "primary");
    submit.type = "submit";

    friend.control.value = eventRecord?.friendId || preselectedFriendId || state.db.friends[0].id;
    type.control.value = eventRecord && eventRecord.points < 0 ? "deduct" : "award";

    form.append(field(friend), field(type), field(amount), field(reason), field(date), status, actionRow(button("Cancel", "ghost", closeModal), submit));
    form.addEventListener("submit", (submitEvent) => {
      submitEvent.preventDefault();
      const points = Number(amount.control.value);
      const eventDate = new Date(date.control.value);
      const payload = {
        friendId: friend.control.value,
        points: type.control.value === "deduct" ? -points : points,
        reason: cleanText(reason.control.value),
        eventDate: eventDate.toISOString()
      };

      if (!payload.friendId) return setStatus(status, "Choose a friend.", "error");
      if (!Number.isInteger(points) || points <= 0) return setStatus(status, "Amount must be a whole number above zero.", "error");
      if (!payload.reason) return setStatus(status, "Reason is required.", "error");
      if (Number.isNaN(eventDate.getTime())) return setStatus(status, "Choose a valid date.", "error");

      const now = new Date().toISOString();
      if (editing) {
        Object.assign(eventRecord, payload, { updatedAt: now });
      } else {
        state.db.events.push({ id: makeId(), ...payload, createdAt: now, updatedAt: now });
      }
      saveDatabase();
      closeModal();
      render();
      showToast(editing ? "Activity updated." : "Points recorded.", "success");
    });

    openModal(editing ? "Edit activity" : "Add point event", "Awards are positive. Deductions are stored as negative.", form);
  }

  function openSettingsForm() {
    if (!requireAdmin()) return;
    const form = el("form", "form");
    const name = input("text", "League name", "text", state.db.settings.leagueName);
    const subtitle = input("text", "League subtitle", "text", state.db.settings.leagueSubtitle);
    const newPassword = input("password", "New admin password", "password");
    const status = formStatus();
    const submit = button("Save settings", "primary");
    submit.type = "submit";

    const help = textEl("p", "Leave the password blank to keep the current one.");
    help.className = "help";
    form.append(field(name), field(subtitle), field(newPassword), help, status, actionRow(button("Cancel", "ghost", closeModal), submit));
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const leagueName = cleanText(name.control.value);
      if (!leagueName) return setStatus(status, "League name is required.", "error");
      state.db.settings.leagueName = leagueName;
      state.db.settings.leagueSubtitle = cleanText(subtitle.control.value) || blankDb.settings.leagueSubtitle;
      if (newPassword.control.value) {
        if (newPassword.control.value.length < 4) return setStatus(status, "Use at least 4 characters.", "error");
        state.db.settings.adminPasswordHash = await sha256(newPassword.control.value);
      }
      saveDatabase();
      closeModal();
      render();
      showToast("Settings saved.", "success");
    });

    openModal("Settings", "Saved in this browser's local JSON database.", form);
  }

  function openProfile(friendId) {
    const friend = friendById(friendId);
    if (!friend) return;

    const standing = calculateStandings().find((item) => item.id === friendId);
    const events = state.db.events.filter((event) => event.friendId === friendId).sort(oldestFirst);
    const positive = events.filter((event) => event.points > 0);
    const negative = events.filter((event) => event.points < 0);
    const content = el("div", "profile");
    const hero = el("div", "profile-hero");
    const heroText = el("div");
    heroText.append(textEl("h3", friend.name), textEl("p", friend.nickname || "No nickname"), textEl("p", friend.bio || "No bio yet."));
    hero.append(avatar(friend, "xlarge"), heroText);
    content.appendChild(hero);

    if (state.role === "admin") {
      const actions = el("div", "profile-actions");
      actions.append(
        button("Award/deduct", "primary", () => {
          closeModal();
          openEventForm(null, friend.id);
        }),
        button("Edit friend", "secondary", () => {
          closeModal();
          openFriendForm(friend);
        }),
        button("Delete friend", "danger", () => {
          closeModal();
          confirmDeleteFriend(friend);
        })
      );
      content.appendChild(actions);
    }

    const stats = el("div", "stats");
    stats.append(
      stat("Total", signedNumber(standing.total, false)),
      stat("Rank", ordinal(standing.rank)),
      stat("Positive events", String(positive.length)),
      stat("Negative events", String(negative.length)),
      stat("Biggest award", positive.length ? signedPoints(Math.max(...positive.map((event) => event.points))) : "None"),
      stat("Biggest deduction", negative.length ? signedPoints(Math.min(...negative.map((event) => event.points))) : "None")
    );
    content.appendChild(stats);

    content.appendChild(textEl("h3", "History"));
    const history = el("div", "history");
    if (!events.length) {
      history.appendChild(emptyState("No history", "No point events for this friend yet."));
    } else {
      events.forEach((event) => {
        const row = el("article", "history-row");
        row.append(pointBadge(event.points), textEl("strong", formatDate(event.eventDate)), textEl("span", event.reason));
        if (state.role === "admin") {
          row.append(smallButton("Edit", () => {
            closeModal();
            openEventForm(event);
          }));
        }
        history.appendChild(row);
      });
    }
    content.appendChild(history);

    openModal(`${friend.name}'s profile`, `${ordinal(standing.rank)} place, ${signedNumber(standing.total, false)} points.`, content, true);
  }

  function confirmDeleteFriend(friend) {
    confirmModal("Delete friend?", `Delete ${friend.name} and all their point history?`, "Delete friend", () => {
      state.db.friends = state.db.friends.filter((item) => item.id !== friend.id);
      state.db.events = state.db.events.filter((event) => event.friendId !== friend.id);
      saveDatabase();
      render();
      showToast("Friend deleted.", "success");
    });
  }

  function confirmDeleteEvent(eventRecord) {
    confirmModal("Delete activity?", "Remove this point event and recalculate the table?", "Delete activity", () => {
      state.db.events = state.db.events.filter((item) => item.id !== eventRecord.id);
      saveDatabase();
      render();
      showToast("Activity deleted.", "success");
    });
  }

  function confirmModal(title, message, confirmText, action) {
    const box = el("div", "form");
    box.append(textEl("p", message), actionRow(button("Cancel", "ghost", closeModal), button(confirmText, "danger", () => {
      action();
      closeModal();
    })));
    openModal(title, "Please confirm.", box);
  }

  function calculateTotals(events = state.db.events) {
    const totals = new Map(state.db.friends.map((friend) => [friend.id, 0]));
    events.forEach((event) => {
      if (totals.has(event.friendId)) totals.set(event.friendId, totals.get(event.friendId) + event.points);
    });
    return totals;
  }

  function calculateStandings(events = state.db.events) {
    const totals = calculateTotals(events);
    const sorted = state.db.friends
      .map((friend) => ({ ...friend, total: totals.get(friend.id) || 0 }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    let lastTotal = null;
    let lastRank = 0;
    return sorted.map((friend, index) => {
      const rank = index === 0 || friend.total !== lastTotal ? index + 1 : lastRank;
      lastTotal = friend.total;
      lastRank = rank;
      return { ...friend, rank };
    });
  }

  function calculateMovement() {
    const movements = new Map();
    const latest = latestEvent();
    if (!latest) {
      state.db.friends.forEach((friend) => movements.set(friend.id, { type: "same", label: "-" }));
      return movements;
    }

    const previousEvents = state.db.events.filter((event) => event.id !== latest.id);
    const previousRanks = new Map(calculateStandings(previousEvents).map((item) => [item.id, item.rank]));
    const latestHadPreviousEvents = previousEvents.some((event) => event.friendId === latest.friendId);

    calculateStandings().forEach((item) => {
      if (item.id === latest.friendId && !latestHadPreviousEvents) {
        movements.set(item.id, { type: "new", label: "NEW" });
        return;
      }
      const oldRank = previousRanks.get(item.id);
      const delta = oldRank - item.rank;
      if (delta > 0) movements.set(item.id, { type: "up", label: `UP ${delta}` });
      else if (delta < 0) movements.set(item.id, { type: "down", label: `DOWN ${Math.abs(delta)}` });
      else movements.set(item.id, { type: "same", label: "-" });
    });
    return movements;
  }

  function getFilteredEvents() {
    return state.db.events
      .slice()
      .sort(newestFirst)
      .filter((event) => {
        if (state.pointFilter === "positive" && event.points <= 0) return false;
        if (state.pointFilter === "negative" && event.points >= 0) return false;
        if (state.friendFilter !== "all" && event.friendId !== state.friendFilter) return false;
        return true;
      });
  }

  function latestEvent() {
    return state.db.events.slice().sort(newestFirst)[0] || null;
  }

  function latestSummary() {
    const latest = latestEvent();
    if (!latest) return "No activity yet";
    const friend = friendById(latest.friendId);
    return `${friend?.name || "Someone"} ${signedPoints(latest.points)}`;
  }

  function exportDatabase() {
    if (!requireAdmin()) return;
    const blob = new Blob([JSON.stringify(state.db, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "db.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importDatabase(event) {
    if (!requireAdmin()) return;
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      state.db = sanitizeDb(imported);
      saveDatabase();
      render();
      showToast("JSON imported.", "success");
    } catch (_error) {
      showToast("That JSON file could not be imported.", "error");
    }
  }

  function openModal(title, subtitle, content, wide = false) {
    closeModal();
    const backdrop = el("div", "modal-backdrop");
    const dialog = el("section", `modal${wide ? " wide" : ""}`);
    const titleId = `modal-title-${Date.now()}`;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", titleId);
    const header = el("header", "modal-header");
    const heading = el("div");
    const h2 = textEl("h2", title);
    h2.id = titleId;
    heading.append(h2, textEl("p", subtitle || ""));
    header.append(heading, smallButton("Close", closeModal));
    dialog.append(header, content);
    backdrop.appendChild(dialog);
    backdrop.addEventListener("mousedown", (event) => {
      if (event.target === backdrop) closeModal();
    });
    dom.modalRoot.replaceChildren(backdrop);
    document.body.classList.add("modal-open");
    state.modal = { dialog, returnFocus: document.activeElement };
    setTimeout(() => {
      const focusTarget = dialog.querySelector("input, select, textarea, button");
      if (focusTarget) focusTarget.focus();
    }, 0);
  }

  function closeModal() {
    if (!state.modal) return;
    const returnFocus = state.modal.returnFocus;
    dom.modalRoot.replaceChildren();
    document.body.classList.remove("modal-open");
    state.modal = null;
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
  }

  function trapModalFocus(event) {
    const items = [...state.modal.dialog.querySelectorAll("button, input, select, textarea, a[href]")].filter((item) => !item.disabled);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function showToast(message, type = "info") {
    const toast = el("div", `toast ${type}`);
    toast.textContent = message;
    toast.setAttribute("role", type === "error" ? "alert" : "status");
    dom.toastRoot.appendChild(toast);
    setTimeout(() => toast.remove(), 4200);
  }

  function requireAdmin() {
    if (state.role !== "admin") {
      showToast("Admin password required.", "error");
      return false;
    }
    return true;
  }

  function friendById(id) {
    return state.db.friends.find((friend) => friend.id === id);
  }

  function sortByName(friends) {
    return friends.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  function newestFirst(a, b) {
    return new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime() || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }

  function oldestFirst(a, b) {
    return newestFirst(b, a);
  }

  function el(tag, className = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function textEl(tag, text) {
    const node = document.createElement(tag);
    node.textContent = cleanText(text);
    return node;
  }

  function button(text, kind, onClick) {
    const node = el("button", `button ${kind || "secondary"}`);
    node.type = "button";
    node.textContent = text;
    if (onClick) node.addEventListener("click", onClick);
    return node;
  }

  function smallButton(text, onClick) {
    const node = button(text, "tiny", onClick);
    return node;
  }

  function input(type, label, name, value = "") {
    const control = document.createElement("input");
    control.type = type;
    control.name = name;
    control.id = `${name}-${makeId()}`;
    control.value = value;
    return { label, control };
  }

  function textarea(label, value = "") {
    const control = document.createElement("textarea");
    control.id = `textarea-${makeId()}`;
    control.value = value;
    return { label, control };
  }

  function select(label, options) {
    const control = document.createElement("select");
    control.id = `select-${makeId()}`;
    options.forEach(([name, value]) => control.appendChild(option(name, value)));
    return { label, control };
  }

  function option(name, value) {
    const node = document.createElement("option");
    node.value = value;
    node.textContent = name;
    return node;
  }

  function field(item) {
    return labelWrap(item.label, item.control);
  }

  function labelWrap(labelText, control) {
    const label = control.id ? el("label", "field") : el("div", "field");
    const labelSpan = textEl("span", labelText);
    if (control.id) label.htmlFor = control.id;
    label.append(labelSpan, control);
    return label;
  }

  function actionRow(...items) {
    const row = el("div", "actions");
    row.append(...items);
    return row;
  }

  function formStatus() {
    const node = el("div", "form-status");
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    return node;
  }

  function setStatus(node, message, type = "") {
    node.textContent = message;
    node.className = `form-status ${type}`;
  }

  function avatar(friend, size) {
    const node = el("span", `avatar ${size}`);
    const fallback = friend ? cleanText(friend.emoji) || initials(friend.name) : "?";
    if (friend?.avatarUrl) {
      const image = document.createElement("img");
      image.src = friend.avatarUrl;
      image.alt = "";
      image.loading = "lazy";
      image.addEventListener("error", () => {
        node.replaceChildren(document.createTextNode(fallback));
      });
      node.appendChild(image);
    } else {
      node.textContent = fallback;
    }
    return node;
  }

  function nameBlock(friend) {
    const block = el("span", "name-block");
    block.append(textEl("strong", friend.name), textEl("small", friend.nickname || "No nickname"));
    return block;
  }

  function rankChip(rank) {
    const node = el("span", "rank-chip");
    node.textContent = ordinal(rank);
    return node;
  }

  function rankMedal(rank) {
    const node = el("span", "medal");
    node.textContent = rank === 1 ? "1st" : rank === 2 ? "2nd" : rank === 3 ? "3rd" : ordinal(rank);
    return node;
  }

  function pointsPill(total) {
    const node = el("span", `points ${total > 0 ? "positive" : total < 0 ? "negative" : "zero"}`);
    node.textContent = `${signedNumber(total, false)} pts`;
    return node;
  }

  function pointBadge(points) {
    const node = el("span", `point-badge ${points > 0 ? "positive" : "negative"}`);
    node.textContent = signedPoints(points);
    return node;
  }

  function movementPill(movement = { type: "same", label: "-" }) {
    const node = el("span", `movement ${movement.type}`);
    node.textContent = movement.label;
    return node;
  }

  function stat(label, value) {
    const node = el("article", "stat");
    node.append(textEl("span", label), textEl("strong", value));
    return node;
  }

  function emptyState(title, message) {
    const box = el("div", "empty");
    const mark = el("div", "empty-mark");
    mark.setAttribute("aria-hidden", "true");
    box.append(mark, textEl("h3", title), textEl("p", message));
    return box;
  }

  function skeleton(kind) {
    return el("div", `skeleton ${kind}`);
  }

  function signedNumber(value, includePlus = true) {
    const number = Number(value) || 0;
    return `${includePlus && number > 0 ? "+" : ""}${new Intl.NumberFormat().format(number)}`;
  }

  function signedPoints(value) {
    const number = Number(value) || 0;
    return `${signedNumber(number)} ${Math.abs(number) === 1 ? "point" : "points"}`;
  }

  function ordinal(number) {
    const value = Number(number);
    const mod = value % 100;
    if (mod >= 11 && mod <= 13) return `${value}th`;
    if (value % 10 === 1) return `${value}st`;
    if (value % 10 === 2) return `${value}nd`;
    if (value % 10 === 3) return `${value}rd`;
    return `${value}th`;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown date";
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function relativeDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    const steps = [
      [60, "second"],
      [60, "minute"],
      [24, "hour"],
      [7, "day"],
      [4.345, "week"],
      [12, "month"],
      [Infinity, "year"]
    ];
    let duration = seconds;
    for (const [amount, unit] of steps) {
      if (Math.abs(duration) < amount) return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(Math.round(duration), unit);
      duration /= amount;
    }
    return "";
  }

  function toDateTimeLocal(value) {
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function validDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  function cleanText(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function initials(name) {
    const parts = cleanText(name).split(/\s+/).filter(Boolean).slice(0, 2);
    return parts.map((part) => part[0]).join("").toUpperCase() || "?";
  }

  function isUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch (_error) {
      return false;
    }
  }

  function isHash(value) {
    return /^[a-f0-9]{64}$/i.test(cleanText(value));
  }

  function makeId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function sha256(text) {
    const bytes = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }
})();
