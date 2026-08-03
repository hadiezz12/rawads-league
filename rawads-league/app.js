(() => {
  "use strict";

  const PAGE_SIZE = 8;
  const DEFAULT_SETTINGS = {
    leagueName: "Rawad's League",
    leagueSubtitle: "Every action has consequences."
  };

  const state = {
    client: null,
    session: null,
    role: "spectator",
    loading: true,
    error: null,
    settings: { ...DEFAULT_SETTINGS },
    friends: [],
    events: [],
    search: "",
    pointFilter: "all",
    friendFilter: "all",
    activityLimit: PAGE_SIZE,
    modal: null,
    realtimeChannel: null,
    pendingRealtimeRefresh: false
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheDom();
    bindEvents();
    renderLoading();
    registerServiceWorker();

    if (!configureSupabase()) {
      state.loading = false;
      render();
      return;
    }

    boot();
  }

  async function boot() {
    await hydrateAuth();
    await loadData(true);
    setupRealtime();
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
    dom.refreshBtn = document.getElementById("refreshBtn");
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
    dom.settingsBtn.addEventListener("click", () => {
      closeOpenMenus();
      openSettingsForm();
    });
    dom.refreshBtn.addEventListener("click", async () => {
      closeOpenMenus();
      await loadData(true);
      showToast("Data refreshed.", "success");
    });

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
      if (event.key === "Escape") {
        if (state.modal) closeModal();
        closeOpenMenus();
      }
      if (event.key === "Tab" && state.modal) trapModalFocus(event);
    });

    document.addEventListener("click", (event) => {
      document.querySelectorAll("details.action-menu[open]").forEach((details) => {
        if (!details.contains(event.target)) details.removeAttribute("open");
      });
    });
  }

  function configureSupabase() {
    const config = window.RAWADS_LEAGUE_CONFIG || {};

    if (!isConfigured(config)) {
      state.error = new Error("Supabase is not configured yet. Fill in config.js after creating the Supabase project.");
      return false;
    }

    if (!window.supabase?.createClient) {
      state.error = new Error("The Supabase script did not load. Check the internet connection and refresh.");
      return false;
    }

    state.client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    return true;
  }

  function isConfigured(config) {
    return (
      typeof config.supabaseUrl === "string" &&
      config.supabaseUrl.startsWith("https://") &&
      !config.supabaseUrl.includes("YOUR_SUPABASE") &&
      typeof config.supabaseAnonKey === "string" &&
      config.supabaseAnonKey.length > 20 &&
      !config.supabaseAnonKey.includes("YOUR_SUPABASE") &&
      isUuid(config.rawadUserId)
    );
  }

  function isAdminConfigured() {
    return isUuid(window.RAWADS_LEAGUE_CONFIG?.rawadUserId);
  }

  async function hydrateAuth() {
    const { data, error } = await state.client.auth.getSession();
    if (error) showToast("Could not restore login session.", "error");
    await applySession(data?.session || null);

    state.client.auth.onAuthStateChange(async (_event, session) => {
      await applySession(session);
    });
  }

  async function applySession(session) {
    state.session = session;

    if (!session?.user) {
      state.role = "spectator";
      render();
      return;
    }

    if (!isAdminConfigured() || session.user.id !== window.RAWADS_LEAGUE_CONFIG.rawadUserId) {
      state.role = "spectator";
      render();
      await state.client.auth.signOut();
      showToast("This Supabase account is not the Rawad admin account.", "error");
      return;
    }

    state.role = "admin";
    render();
  }

  async function loadData(showLoader = false) {
    if (!state.client) return;

    if (showLoader) {
      state.loading = true;
      state.error = null;
      render();
    }

    try {
      const [settingsResult, friendsResult, eventsResult] = await Promise.all([
        state.client.from("league_settings").select("*").eq("id", 1).maybeSingle(),
        state.client.from("friends").select("*").order("name", { ascending: true }),
        state.client
          .from("point_events")
          .select("*")
          .order("event_date", { ascending: false })
          .order("created_at", { ascending: false })
      ]);

      if (settingsResult.error) throw settingsResult.error;
      if (friendsResult.error) throw friendsResult.error;
      if (eventsResult.error) throw eventsResult.error;

      state.settings = fromSettingsRow(settingsResult.data);
      state.friends = (friendsResult.data || []).map(fromFriendRow);
      state.events = (eventsResult.data || []).map(fromEventRow);
      state.loading = false;
      state.error = null;
      render();
    } catch (error) {
      state.loading = false;
      state.error = error;
      render();
      showToast("Could not load Supabase data.", "error");
    }
  }

  function renderLoading() {
    dom.podium.replaceChildren(skeleton("card"), skeleton("card"), skeleton("card"));
    dom.leaderboard.replaceChildren(skeleton("row"), skeleton("row"), skeleton("row"));
    dom.activity.replaceChildren(skeleton("row"), skeleton("row"), skeleton("row"));
  }

  function render() {
    const isAdmin = state.role === "admin";
    document.title = `${state.settings.leagueName} | Friendship League`;
    dom.leagueName.textContent = state.settings.leagueName;
    dom.leagueSubtitle.textContent = state.settings.leagueSubtitle;
    dom.roleBadge.textContent = isAdmin ? "Admin" : "Spectator";
    dom.roleBadge.classList.toggle("admin", isAdmin);
    dom.loginBtn.hidden = isAdmin;
    dom.logoutBtn.hidden = !isAdmin;
    dom.adminPanel.hidden = !isAdmin;

    dom.friendCount.textContent = state.loading ? "..." : String(state.friends.length);
    dom.eventCount.textContent = state.loading ? "..." : String(state.events.length);
    dom.latestEventText.textContent = state.loading ? "Loading..." : latestSummary();

    renderFriendFilter();
    renderPodium();
    renderLeaderboard();
    renderActivity();
  }

  function renderFriendFilter() {
    const current = state.friends.some((friend) => friend.id === state.friendFilter) ? state.friendFilter : "all";
    state.friendFilter = current;
    dom.friendFilter.replaceChildren(option("All friends", "all"));
    sortByName(state.friends).forEach((friend) => dom.friendFilter.appendChild(option(friend.name, friend.id)));
    dom.friendFilter.value = state.friendFilter;
  }

  function renderPodium() {
    dom.podium.replaceChildren();

    if (state.loading) {
      renderLoading();
      return;
    }

    if (state.error) {
      dom.podium.appendChild(errorState("Setup or loading problem", state.error.message));
      return;
    }

    const standings = calculateStandings();
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
    dom.leaderboard.replaceChildren();

    if (state.loading) {
      dom.leaderboard.replaceChildren(skeleton("row"), skeleton("row"), skeleton("row"));
      return;
    }

    if (state.error) {
      dom.leaderboard.appendChild(errorState("Leaderboard unavailable", state.error.message));
      return;
    }

    const standings = calculateStandings();
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

    dom.activity.replaceChildren();

    if (state.loading) {
      dom.activity.replaceChildren(skeleton("row"), skeleton("row"), skeleton("row"));
      dom.showMoreBtn.hidden = true;
      return;
    }

    if (state.error) {
      dom.activity.appendChild(errorState("Activity unavailable", state.error.message));
      dom.showMoreBtn.hidden = true;
      return;
    }

    const events = getFilteredEvents();
    if (!state.events.length) {
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
      meta.appendChild(
        actionMenu("Manage", [
          { label: "Edit", action: () => openEventForm(event) },
          { label: "Delete", action: () => confirmDeleteEvent(event), danger: true }
        ])
      );
    }

    card.append(top, reason, meta);
    return card;
  }

  function openLoginModal() {
    if (!state.client) {
      showToast("Finish config.js first.", "error");
      return;
    }

    const form = el("form", "form");
    const email = input("email", "Email", "email");
    email.control.autocomplete = "email";
    const password = input("password", "Password", "password");
    password.control.autocomplete = "current-password";
    const toggle = button("Show", "secondary", () => {
      password.control.type = password.control.type === "password" ? "text" : "password";
      toggle.textContent = password.control.type === "password" ? "Show" : "Hide";
    });
    const passwordRow = el("div", "password-row");
    passwordRow.append(password.control, toggle);
    const status = formStatus();
    const submit = button("Login", "primary");
    submit.type = "submit";

    form.append(field(email), labelWrap("Password", passwordRow), status, actionRow(button("Cancel", "ghost", closeModal), submit));
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setStatus(status, "");

      const emailValue = email.control.value.trim();
      const passwordValue = password.control.value;
      if (!emailValue || !passwordValue) {
        setStatus(status, "Enter Rawad's email and password.", "error");
        return;
      }

      setBusy(submit, true, "Checking...");
      const { data, error } = await state.client.auth.signInWithPassword({
        email: emailValue,
        password: passwordValue
      });

      if (error) {
        setBusy(submit, false);
        setStatus(status, error.message, "error");
        return;
      }

      await applySession(data.session);
      if (state.role !== "admin") {
        setBusy(submit, false);
        setStatus(status, "This account is not authorized as Rawad.", "error");
        return;
      }

      closeModal();
      showToast("Admin mode enabled.", "success");
      await loadData(false);
    });

    openModal("Admin login", "Use the Rawad Supabase Auth user. There is no public sign-up.", form);
  }

  async function logout() {
    if (!state.client) return;
    const { error } = await state.client.auth.signOut();
    if (error) {
      showToast(error.message, "error");
      return;
    }
    state.role = "spectator";
    state.session = null;
    render();
    showToast("Logged out.", "success");
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

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = {
        name: cleanText(name.control.value),
        nickname: nullableText(nickname.control.value),
        emoji: nullableText(emoji.control.value),
        avatar_url: nullableText(avatarUrl.control.value),
        bio: nullableText(bio.control.value)
      };

      if (!payload.name) return setStatus(status, "Name is required.", "error");
      if (payload.avatar_url && !isUrl(payload.avatar_url)) return setStatus(status, "Avatar URL must start with http:// or https://.", "error");

      setBusy(submit, true, editing ? "Saving..." : "Adding...");
      const result = editing
        ? await state.client.from("friends").update(payload).eq("id", friend.id)
        : await state.client.from("friends").insert(payload);

      if (result.error) {
        setBusy(submit, false);
        setStatus(status, result.error.message, "error");
        return;
      }

      closeModal();
      await loadData(false);
      showToast(editing ? "Friend updated." : "Friend added.", "success");
    });

    openModal(editing ? "Edit friend" : "Add friend", "This saves to Supabase for every device.", form);
  }

  function openEventForm(eventRecord = null, preselectedFriendId = "") {
    if (!requireAdmin()) return;
    if (!state.friends.length) {
      showToast("Add a friend first.", "error");
      openFriendForm();
      return;
    }

    const editing = Boolean(eventRecord);
    const form = el("form", "form");
    const friend = select("Friend", sortByName(state.friends).map((item) => [item.name, item.id]));
    const type = select("Type", [["Award points", "award"], ["Deduct points", "deduct"]]);
    const amount = input("number", "Amount", "number", eventRecord ? String(Math.abs(eventRecord.points)) : "1");
    amount.control.min = "1";
    amount.control.step = "1";
    const reason = textarea("Reason", eventRecord?.reason || "");
    const date = input("datetime-local", "Date and time", "datetime-local", toDateTimeLocal(eventRecord?.eventDate || new Date().toISOString()));
    const status = formStatus();
    const submit = button(editing ? "Save activity" : "Record activity", "primary");
    submit.type = "submit";

    friend.control.value = eventRecord?.friendId || preselectedFriendId || state.friends[0].id;
    type.control.value = eventRecord && eventRecord.points < 0 ? "deduct" : "award";

    form.append(field(friend), field(type), field(amount), field(reason), field(date), status, actionRow(button("Cancel", "ghost", closeModal), submit));
    form.addEventListener("submit", async (submitEvent) => {
      submitEvent.preventDefault();
      const points = Number(amount.control.value);
      const eventDate = new Date(date.control.value);
      const payload = {
        friend_id: friend.control.value,
        points: type.control.value === "deduct" ? -points : points,
        reason: cleanText(reason.control.value),
        event_date: eventDate.toISOString()
      };

      if (!payload.friend_id) return setStatus(status, "Choose a friend.", "error");
      if (!Number.isInteger(points) || points <= 0) return setStatus(status, "Amount must be a whole number above zero.", "error");
      if (!payload.reason) return setStatus(status, "Reason is required.", "error");
      if (Number.isNaN(eventDate.getTime())) return setStatus(status, "Choose a valid date.", "error");

      setBusy(submit, true, editing ? "Saving..." : "Recording...");
      const result = editing
        ? await state.client.from("point_events").update(payload).eq("id", eventRecord.id)
        : await state.client.from("point_events").insert(payload);

      if (result.error) {
        setBusy(submit, false);
        setStatus(status, result.error.message, "error");
        return;
      }

      closeModal();
      await loadData(false);
      showToast(editing ? "Activity updated." : "Points recorded.", "success");
    });

    openModal(editing ? "Edit activity" : "Add point event", "Awards are positive. Deductions are stored as negative.", form);
  }

  function openSettingsForm() {
    if (!requireAdmin()) return;
    const form = el("form", "form");
    const name = input("text", "League name", "text", state.settings.leagueName);
    const subtitle = input("text", "League subtitle", "text", state.settings.leagueSubtitle);
    const status = formStatus();
    const submit = button("Save settings", "primary");
    submit.type = "submit";

    form.append(field(name), field(subtitle), status, actionRow(button("Cancel", "ghost", closeModal), submit));
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const leagueName = cleanText(name.control.value);
      if (!leagueName) return setStatus(status, "League name is required.", "error");

      setBusy(submit, true, "Saving...");
      const { error } = await state.client
        .from("league_settings")
        .update({
          league_name: leagueName,
          league_subtitle: cleanText(subtitle.control.value) || DEFAULT_SETTINGS.leagueSubtitle
        })
        .eq("id", 1);

      if (error) {
        setBusy(submit, false);
        setStatus(status, error.message, "error");
        return;
      }

      closeModal();
      await loadData(false);
      showToast("Settings saved.", "success");
    });

    openModal("Settings", "Saved to Supabase for every visitor.", form);
  }

  function openProfile(friendId) {
    const friend = friendById(friendId);
    if (!friend) return;

    const standing = calculateStandings().find((item) => item.id === friendId);
    const events = state.events.filter((event) => event.friendId === friendId).sort(oldestFirst);
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
        actionMenu("Manage friend", [
          {
            label: "Edit friend",
            action: () => {
              closeModal();
              openFriendForm(friend);
            }
          },
          {
            label: "Delete friend",
            danger: true,
            action: () => {
              closeModal();
              confirmDeleteFriend(friend);
            }
          }
        ])
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
          row.append(
            actionMenu("Manage", [
              {
                label: "Edit",
                action: () => {
                  closeModal();
                  openEventForm(event);
                }
              },
              {
                label: "Delete",
                danger: true,
                action: () => {
                  closeModal();
                  confirmDeleteEvent(event);
                }
              }
            ])
          );
        }
        history.appendChild(row);
      });
    }
    content.appendChild(history);

    openModal(`${friend.name}'s profile`, `${ordinal(standing.rank)} place, ${signedNumber(standing.total, false)} points.`, content, true);
  }

  function confirmDeleteFriend(friend) {
    confirmModal("Delete friend?", `Delete ${friend.name} and all their point history?`, "Delete friend", async () => {
      const { error } = await state.client.from("friends").delete().eq("id", friend.id);
      if (error) throw error;
      await loadData(false);
      showToast("Friend deleted.", "success");
    });
  }

  function confirmDeleteEvent(eventRecord) {
    confirmModal("Delete activity?", "Remove this point event and recalculate the table?", "Delete activity", async () => {
      const { error } = await state.client.from("point_events").delete().eq("id", eventRecord.id);
      if (error) throw error;
      await loadData(false);
      showToast("Activity deleted.", "success");
    });
  }

  function confirmModal(title, message, confirmText, action) {
    const box = el("div", "form");
    const status = formStatus();
    const confirmButton = button(confirmText, "danger", async () => {
      setStatus(status, "");
      setBusy(confirmButton, true, "Working...");
      try {
        await action();
        closeModal();
      } catch (error) {
        setBusy(confirmButton, false);
        setStatus(status, error.message || "Something went wrong.", "error");
      }
    });
    box.append(textEl("p", message), status, actionRow(button("Cancel", "ghost", closeModal), confirmButton));
    openModal(title, "Please confirm.", box);
  }

  function calculateTotals(events = state.events) {
    const totals = new Map(state.friends.map((friend) => [friend.id, 0]));
    events.forEach((event) => {
      if (totals.has(event.friendId)) totals.set(event.friendId, totals.get(event.friendId) + event.points);
    });
    return totals;
  }

  function calculateStandings(events = state.events) {
    const totals = calculateTotals(events);
    const sorted = state.friends
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
      state.friends.forEach((friend) => movements.set(friend.id, { type: "same", label: "-" }));
      return movements;
    }

    const previousEvents = state.events.filter((event) => event.id !== latest.id);
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
    return state.events
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
    return state.events.slice().sort(newestFirst)[0] || null;
  }

  function latestSummary() {
    if (state.error) return "Setup needed";
    const latest = latestEvent();
    if (!latest) return "No activity yet";
    const friend = friendById(latest.friendId);
    return `${friend?.name || "Someone"} ${signedPoints(latest.points)}`;
  }

  function setupRealtime() {
    if (!state.client || state.realtimeChannel) return;

    state.realtimeChannel = state.client
      .channel("rawads-league-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "league_settings" }, scheduleRealtimeRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "friends" }, scheduleRealtimeRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "point_events" }, scheduleRealtimeRefresh)
      .subscribe();
  }

  function scheduleRealtimeRefresh() {
    if (state.pendingRealtimeRefresh) return;
    state.pendingRealtimeRefresh = true;
    window.setTimeout(async () => {
      state.pendingRealtimeRefresh = false;
      await loadData(false);
    }, 300);
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
      const focusTarget = dialog.querySelector("input, select, textarea, button, summary");
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
    const items = [...state.modal.dialog.querySelectorAll("button, input, select, textarea, a[href], summary")].filter((item) => !item.disabled);
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
      showToast("Admin login required.", "error");
      return false;
    }
    return true;
  }

  function closeOpenMenus() {
    document.querySelectorAll("details.action-menu[open]").forEach((details) => details.removeAttribute("open"));
  }

  function friendById(id) {
    return state.friends.find((friend) => friend.id === id);
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
    return button(text, "tiny", onClick);
  }

  function actionMenu(label, items) {
    const details = el("details", "action-menu");
    const summary = document.createElement("summary");
    summary.textContent = label;
    const list = el("div", "action-menu-list");

    items.forEach((item) => {
      const menuButton = document.createElement("button");
      menuButton.type = "button";
      menuButton.textContent = item.label;
      if (item.danger) menuButton.className = "danger-item";
      menuButton.addEventListener("click", () => {
        details.removeAttribute("open");
        item.action();
      });
      list.appendChild(menuButton);
    });

    details.append(summary, list);
    return details;
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

  function setBusy(buttonNode, busy, text = "Working...") {
    if (busy) {
      buttonNode.dataset.originalText = buttonNode.textContent;
      buttonNode.textContent = text;
      buttonNode.disabled = true;
      return;
    }
    buttonNode.textContent = buttonNode.dataset.originalText || buttonNode.textContent;
    buttonNode.disabled = false;
    delete buttonNode.dataset.originalText;
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

  function errorState(title, message) {
    const box = emptyState(title, message);
    if (state.client) {
      box.appendChild(button("Try again", "secondary", () => loadData(true)));
    }
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

  function cleanText(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function nullableText(value) {
    const text = cleanText(value);
    return text ? text : null;
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

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanText(value));
  }

  function makeId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function fromSettingsRow(row) {
    return {
      leagueName: row?.league_name || DEFAULT_SETTINGS.leagueName,
      leagueSubtitle: row?.league_subtitle || DEFAULT_SETTINGS.leagueSubtitle
    };
  }

  function fromFriendRow(row) {
    return {
      id: row.id,
      name: row.name || "",
      nickname: row.nickname || "",
      emoji: row.emoji || "",
      avatarUrl: row.avatar_url || "",
      bio: row.bio || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function fromEventRow(row) {
    return {
      id: row.id,
      friendId: row.friend_id,
      points: Number(row.points) || 0,
      reason: row.reason || "",
      eventDate: row.event_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }
})();
