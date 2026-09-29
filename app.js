(function applySavedTheme() {
  const saved = localStorage.getItem("codex-studys-theme");
  if (!saved || saved === "system") return;
  document.documentElement.setAttribute("data-theme", saved);
})();

const FALLBACK_THUMB = "assets/codex-telegram.png";
let allBatches = [];
let activeFilter = "all";
let searchQuery = "";
let sortMode = "relevance";
let langFilter = "all";
let visibleCount = 24;
const PAGE_SIZE = 24;

const $ = (selector) => document.querySelector(selector);
const THUMB_PLACEHOLDER_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
window.__thumbFallback = (img) => { img.outerHTML = THUMB_PLACEHOLDER_SVG; };
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[character]));
}

function categoryFor(batch) {
  const text = `${batch.name || ""} ${batch.byName || ""}`.toLowerCase();
  if (/\bjee\b|iit/.test(text)) return "jee";
  if (/neet|medical/.test(text)) return "neet";
  if (/class|cbse|icse|school|commerce|humanities/.test(text)) return "school";
  return "exam";
}

function deepSearchText(batch) {
  if (batch.__searchText) return batch.__searchText;
  const parts = [batch.name, batch.byName, batch.language, batch.type, (batch.slug || "").replace(/-/g, " ")];
  (batch.subBatches || []).forEach((sub) => parts.push(sub.name, sub.byName));
  const text = parts.filter(Boolean).join(" ").toLowerCase();
  Object.defineProperty(batch, "__searchText", { value: text, enumerable: false, writable: true });
  return text;
}

function deepSearchScore(batch, queryWords, rawQuery) {
  const name = (batch.name || "").toLowerCase();
  const text = deepSearchText(batch);
  if (!queryWords.every((word) => text.includes(word))) return 0;
  if (name === rawQuery) return 100;
  if (name.startsWith(rawQuery)) return 80;
  if (name.includes(rawQuery)) return 60;
  if (queryWords.every((word) => name.includes(word))) return 40;
  return 20;
}

function deepSearch(batches, query) {
  const rawQuery = query.trim().toLowerCase();
  if (!rawQuery) return batches;
  const queryWords = rawQuery.split(/\s+/).filter(Boolean);
  return batches
    .map((batch) => ({ batch, score: deepSearchScore(batch, queryWords, rawQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.batch);
}

function openBatch(batch) {
  const id = batch._id || batch.batch_id;
  if (!id) return showToast("This course is not available right now.");
  rememberHomePosition(id);
  addRecentlyViewed(batch);
  try { window.CXProfile && window.CXProfile.trackBatch(batch); } catch (e) {}
  renderRecentlyWatched();
  $$(".overlay.visible").forEach((overlay) => closeModal(overlay.id));
  openStudy(batch);
}

function getRecentlyViewed() {
  try { return JSON.parse(localStorage.getItem("codex-studys-recent") || "[]"); }
  catch { return []; }
}

function addRecentlyViewed(batch) {
  const id = batch._id || batch.batch_id;
  if (!id) return;
  const entry = { _id: id, name: batch.name || "Untitled course", byName: batch.byName || "", language: batch.language || "", previewImage: batch.previewImage || "" };
  const recent = getRecentlyViewed().filter((item) => item._id !== id);
  recent.unshift(entry);
  localStorage.setItem("codex-studys-recent", JSON.stringify(recent.slice(0, 8)));
}

function renderRecentlyWatched() {
  const statRecent = document.getElementById("statRecent");
  if (statRecent) statRecent.textContent = String(getRecentlyViewed().length);
  const section = document.getElementById("recentSection");
  const row = document.getElementById("recentRow");
  if (!section || !row) return;
  const items = getRecentlyViewed();
  if (!items.length) { section.style.display = "none"; row.innerHTML = ""; return; }
  section.style.display = "block";
  row.innerHTML = items.map((item) => `
    <button class="recent-item" type="button" data-recent-id="${escapeHtml(item._id)}">
      <img class="recent-thumb" src="${escapeHtml(item.previewImage || FALLBACK_THUMB)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.src='${FALLBACK_THUMB}'">
      <span class="recent-info">
        <span class="recent-name">${escapeHtml(item.name || "Course")}</span>
        <span class="recent-sub">${escapeHtml(item.byName || item.language || "Continue watching")}</span>
      </span>
    </button>`).join("");
  row.querySelectorAll("[data-recent-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.recentId;
      const full = allBatches.find((batch) => (batch._id || batch.batch_id) === id);
      openBatch(full || items.find((item) => item._id === id));
    });
  });
}

function setupRecentlyWatched() {
  renderRecentlyWatched();
  document.getElementById("recentClearBtn")?.addEventListener("click", () => {
    localStorage.removeItem("codex-studys-recent");
    renderRecentlyWatched();
    showToast("Recently watched cleared.");
  });
}

function setupQuickInstall() {
  const button = document.getElementById("installQuickBtn");
  if (!button) return;
  button.addEventListener("click", () => openModal("installModal"));
}

function getFavorites() {
  try { return JSON.parse(localStorage.getItem("codex-studys-favorites") || "[]"); }
  catch { return []; }
}

function isFavorite(id) {
  return getFavorites().includes(id);
}

function toggleFavorite(id) {
  const favorites = getFavorites();
  const index = favorites.indexOf(id);
  if (index === -1) favorites.push(id); else favorites.splice(index, 1);
  localStorage.setItem("codex-studys-favorites", JSON.stringify(favorites));
  return favorites.includes(id);
}

function updateFavoritesCount() {
  const count = getFavorites().length;
  const button = $('.filter-row .filter[data-filter="favorites"]');
  if (button) button.textContent = count ? `❤ Favorite Batches (${count})` : "❤ Favorite Batches";
  const navBadge = $("#favNavBadge");
  if (navBadge) {
    navBadge.textContent = String(count);
    navBadge.style.display = count ? "grid" : "none";
  }
  const statFav = $("#statFav");
  if (statFav) statFav.textContent = count.toLocaleString();
}

function filteredBatches() {
  let batches;
  if (activeFilter === "favorites") {
    const favorites = getFavorites();
    batches = allBatches.filter((batch) => favorites.includes(batch._id || batch.batch_id || ""));
  } else {
    batches = allBatches.filter((batch) => activeFilter === "all" || categoryFor(batch) === activeFilter);
  }
  if (langFilter !== "all") {
    batches = batches.filter((batch) => (batch.language || "").toLowerCase().includes(langFilter));
  }
  if (searchQuery.trim()) {
    batches = deepSearch(batches, searchQuery);
  }
  if (sortMode === "az") {
    batches = [...batches].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } else if (sortMode === "za") {
    batches = [...batches].sort((a, b) => (b.name || "").localeCompare(a.name || ""));
  } else if (sortMode === "newest") {
    batches = [...batches].sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0));
  }
  return batches;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date)) return "";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function isRecent(value) {
  if (!value) return false;
  const date = new Date(value);
  if (isNaN(date)) return false;
  const days = (Date.now() - date.getTime()) / 86400000;
  return days >= 0 && days <= 21;
}

function courseCard(batch) {
  const title = escapeHtml(batch.name || "Untitled course");
  const description = escapeHtml(batch.byName || "Structured learning for your next milestone");
  const language = escapeHtml(batch.language || "Self-paced");
  const category = categoryFor(batch);
  const image = escapeHtml(batch.previewImage || FALLBACK_THUMB);
  const id = escapeHtml(batch._id || batch.batch_id || "");
  const favActive = isFavorite(id);
  const startDate = formatDate(batch.startDate);
  const fresh = isRecent(batch.startDate);
  return `
    <article class="course-card" data-id="${id}" tabindex="0" role="button" aria-label="Open ${title}">
      <div class="course-thumb">
        <div class="thumb-fallback thumb-shimmer"></div>
        <img src="${image}" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add('loaded');this.previousElementSibling.style.display='none'" onerror="this.style.display='none'">
        <span class="course-tag">${escapeHtml(category)}</span>
        ${fresh ? '<span class="course-tag course-tag-new">NEW</span>' : ""}
        <button class="fav-btn${favActive ? " active" : ""}" type="button" data-fav-id="${id}" aria-label="${favActive ? "Remove from favorites" : "Add to favorites"}" aria-pressed="${favActive}">
          <svg viewBox="0 0 24 24" fill="${favActive ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M12 21s-7.2-4.5-9.6-9C.6 8.1 2.4 4.5 6 4.2c2.1-.15 3.6 1.05 6 3.3 2.4-2.25 3.9-3.45 6-3.3 3.6.3 5.4 3.9 3.6 7.8-2.4 4.5-9.6 9-9.6 9Z"/></svg>
        </button>
        <button class="info-btn" type="button" data-info-id="${id}" aria-label="Quick view details">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.6"/></svg>
        </button>
        ${getNote(id) ? '<span class="note-badge">📝 Note</span>' : ""}
      </div>
      <div class="course-chips"><span class="chip">${language}</span><span class="chip chip-accent">${escapeHtml(category)}</span></div>
      <div class="course-body">
        <h3 class="course-title">${title}</h3>
        <p class="course-description">${description}</p>
        <div class="course-meta"><span>${startDate ? `📅 ${startDate}` : language}</span><button class="course-cta" type="button">Let's Study <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></div>
      </div>
    </article>`;
}

function syncUrlParams() {
  if (new URLSearchParams(window.location.search).has("study")) return;
  const params = new URLSearchParams();
  if (activeFilter !== "all") params.set("filter", activeFilter);
  if (searchQuery.trim()) params.set("q", searchQuery.trim());
  if (sortMode !== "relevance") params.set("sort", sortMode);
  if (langFilter !== "all") params.set("lang", langFilter);
  const query = params.toString();
  const newUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState(null, "", newUrl);
}

function renderBatches() {
  const grid = $("#batchGrid");
  const loadMoreBtn = $("#loadMoreBtn");
  const batches = filteredBatches();
  const visible = batches.slice(0, visibleCount);
  const filterLabel = activeFilter === "all" ? "courses" : activeFilter === "favorites" ? "favorite courses" : `${activeFilter.toUpperCase()} courses`;
  const noteText = batches.length
    ? `Showing ${visible.length} of ${batches.length.toLocaleString()} ${filterLabel}.`
    : activeFilter === "favorites" ? "No favorites yet. Tap the heart on any course to save it here." : "No courses matched that filter yet.";
  $("#resultsNote").textContent = noteText;
  const announcer = $("#filterAnnouncer");
  if (announcer) announcer.textContent = noteText;
  grid.innerHTML = visible.length ? visible.map(courseCard).join("") : '<div class="empty">Try another category or search the full library.</div>';
  $$(".course-card").forEach((card, index) => {
    card.addEventListener("click", () => openBatch(visible[index]));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openBatch(visible[index]);
      }
    });
  });
  $$(".fav-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const nowActive = toggleFavorite(button.dataset.favId);
      button.classList.toggle("active", nowActive);
      button.setAttribute("aria-pressed", String(nowActive));
      button.querySelector("svg").setAttribute("fill", nowActive ? "currentColor" : "none");
      if (nowActive) {
        button.classList.remove("pop");
        void button.offsetWidth;
        button.classList.add("pop");
      }
      if (activeFilter === "favorites" && !nowActive) renderBatches();
      updateFavoritesCount();
    });
  });
  $$(".info-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const batch = visible.find((item) => (item._id || item.batch_id || "") === button.dataset.infoId);
      if (batch) openDetail(batch);
    });
  });
  if (loadMoreBtn) {
    const remaining = batches.length - visible.length;
    loadMoreBtn.style.display = remaining > 0 ? "inline-flex" : "none";
    loadMoreBtn.textContent = remaining > 0 ? "Loading more courses…" : "";
  }
  const clearBtn = $("#clearFiltersBtn");
  if (clearBtn) clearBtn.style.display = (activeFilter !== "all" || searchQuery.trim()) ? "inline-flex" : "none";
  syncUrlParams();
}

function getSearchHistory() {
  try { return JSON.parse(localStorage.getItem("codex-studys-search-history") || "[]"); }
  catch { return []; }
}

function addSearchHistory(term) {
  const trimmed = term.trim();
  if (!trimmed) return;
  const history = getSearchHistory().filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
  history.unshift(trimmed);
  localStorage.setItem("codex-studys-search-history", JSON.stringify(history.slice(0, 6)));
}

function highlightMatch(text, query) {
  const safe = escapeHtml(text || "");
  if (!query) return safe;
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean).map((w) => escapeHtml(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return safe;
  return safe.replace(new RegExp(`(${words.join("|")})`, "gi"), "<mark>$1</mark>");
}

function renderSearchResults(query = "") {
  const results = $("#searchResults");
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    const history = getSearchHistory();
    const recent = getRecentlyViewed();
    if (!history.length && !recent.length) {
      results.innerHTML = '<div class="search-hint">Start typing to find your next course.</div>';
      return;
    }
    let html = "";
    if (history.length) {
      html += `<div class="search-hint" style="text-align:left;margin-bottom:2px;">Recent searches</div>
        <div class="search-history-row">${history.map((term) => `<button type="button" class="search-history-chip">${escapeHtml(term)}</button>`).join("")}</div>`;
    }
    if (recent.length) {
      html += `<div class="search-hint" style="text-align:left;margin-bottom:2px;">Recently viewed</div>` + recent.map((batch) => `
        <div class="search-result" data-id="${escapeHtml(batch._id)}">
          <div class="search-result-thumb">${batch.previewImage ? `<img src="${escapeHtml(batch.previewImage)}" alt="" referrerpolicy="no-referrer" onerror="window.__thumbFallback(this)">` : THUMB_PLACEHOLDER_SVG}</div>
          <div><strong>${escapeHtml(batch.name)}</strong><small>${escapeHtml(batch.byName || batch.language || "Course")}</small></div>
        </div>`).join("");
    }
    results.innerHTML = html;
    $$(".search-history-chip").forEach((chip, index) => chip.addEventListener("click", () => {
      const input = $("#searchInput");
      if (input) { input.value = history[index]; renderSearchResults(history[index]); }
    }));
    $$(".search-result").forEach((result, index) => result.addEventListener("click", () => {
      openBatch(recent[index]);
      closeModal("searchModal");
    }));
    return;
  }
  const matches = deepSearch(allBatches, normalized).slice(0, 40);
  if (!matches.length) {
    results.innerHTML = '<div class="search-hint">No matches yet. Try a subject, exam or class.</div>';
    return;
  }
  results.innerHTML = `<div class="search-hint" style="text-align:left;margin-bottom:2px;">${matches.length} result${matches.length === 1 ? "" : "s"}</div>` + matches.map((batch) => `
    <div class="search-result" data-id="${escapeHtml(batch._id || batch.batch_id || "")}">
      <div class="search-result-thumb">${batch.previewImage ? `<img src="${escapeHtml(batch.previewImage)}" alt="" referrerpolicy="no-referrer" onerror="window.__thumbFallback(this)">` : THUMB_PLACEHOLDER_SVG}</div>
      <div><strong>${highlightMatch(batch.name || "Untitled course", normalized)}</strong><small>${escapeHtml(batch.byName || batch.language || "Course")}</small></div>
      ${isRecent(batch.startDate) ? '<span class="search-new-badge">new</span>' : ""}
    </div>`).join("");
  $$(".search-result").forEach((result, index) => result.addEventListener("click", () => {
    openBatch(matches[index]);
    closeModal("searchModal");
  }));
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  $$(".overlay.visible").forEach((other) => { if (other.id !== id) other.classList.remove("visible"); });
  modal.classList.add("visible");
  document.body.classList.add("modal-open");
  modal.querySelector("input")?.focus();
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove("visible");
  if (!$$(".overlay.visible").length) document.body.classList.remove("modal-open");
}

function showToast(message) {
  const oldToast = $(".toast");
  oldToast?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2800);
}

const BATCH_CACHE_KEY = "cx-batches-cache-v2";

function readBatchCache() {
  try {
    const raw = sessionStorage.getItem(BATCH_CACHE_KEY);
    const list = raw ? JSON.parse(raw) : null;
    return Array.isArray(list) && list.length ? list : null;
  } catch (e) { return null; }
}

function restoreScroll() {
  try {
    const y = Number(sessionStorage.getItem("cx-scroll") || 0);
    sessionStorage.removeItem("cx-scroll");
    if (y > 0) window.requestAnimationFrame(() => window.scrollTo(0, y));
  } catch (e) {}
}

async function loadBatches() {
  const cached = readBatchCache();
  let usedCache = false;
  try {
    const grid = $("#batchGrid");
    if (cached) {
      // coming back from a batch: show the list instantly, refresh quietly in the background
      allBatches = cached;
      usedCache = true;
      updateStats();
      renderBatches();
      $("#globalPreloader").classList.add("hidden");
      restoreScroll();
    } else if (grid && !allBatches.length) {
      grid.innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton-card"><div class="skeleton-thumb"></div><div class="skeleton-body"><div class="skeleton-line" style="width:88%"></div><div class="skeleton-line" style="width:60%"></div><div class="skeleton-line" style="width:40%"></div></div></div>').join("");
    }
    const fresh = (await fetchVkBatches()).map(normalizeVkBatch);
    const changed = JSON.stringify(fresh) !== JSON.stringify(allBatches);
    allBatches = fresh;
    try { sessionStorage.setItem(BATCH_CACHE_KEY, JSON.stringify(fresh)); sessionStorage.setItem("cx-loaded", "1"); } catch (e) {}
    if (changed || !usedCache) { updateStats(); renderBatches(); }
    if (!fresh.length) $("#batchGrid").innerHTML = `<div style="grid-column:1/-1">${stState("empty", "No batches available", "New batches will show up here as soon as they're added.")}</div>`;
    pruneRecentlyViewed();
    const studyName = document.getElementById("stBatchName");
    const studyId = studyParams().batch;
    if (studyName && studyId) studyName.textContent = studyBatch(studyId).name;
    const updatedNote = $("#dataUpdatedNote");
    if (updatedNote) updatedNote.textContent = `· library refreshed ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch (error) {
    console.error(error);
    if (!usedCache) {
      $("#resultsNote").textContent = "The course library could not be loaded.";
      $("#batchGrid").innerHTML = `<div style="grid-column:1/-1">${stErrorHtml(error)}</div>`;
      $("#batchGrid .st-state [data-st-retry]")?.addEventListener("click", () => { $("#batchGrid").innerHTML = ""; loadBatches(); });
      showToast("Course library unavailable");
    }
  } finally {
    $("#globalPreloader").classList.add("hidden");
  }
}

function setupNavigation() {
  const menu = $("#navLinks");
  const menuButton = $("#menuBtn");
  menuButton.addEventListener("click", () => {
    const open = menu.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(open));
  });
  $$(".nav-link").forEach((link) => link.addEventListener("click", () => {
    menu.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
  }));
  const sections = $$("main section[id]");
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) {
      $$(".nav-link").forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${entry.target.id}`));
    }
  }), { rootMargin: "-35% 0px -55% 0px" });
  sections.forEach((section) => observer.observe(section));
}

function setupHeaderActions() {
  const refreshBtn = $("#refreshBtn");
  refreshBtn?.addEventListener("click", async () => {
    if (refreshBtn.classList.contains("spinning")) return;
    refreshBtn.classList.add("spinning");
    await loadBatches();
    showToast("Course library refreshed.");
    refreshBtn.classList.remove("spinning");
  });
  $("#favNavBtn")?.addEventListener("click", () => {
    activeFilter = "favorites";
    localStorage.setItem("codex-studys-last-filter", "favorites");
    visibleCount = PAGE_SIZE;
    $$(".filter-row .filter").forEach((item) => item.classList.toggle("active", item.dataset.filter === "favorites"));
    renderBatches();
    $("#courses")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function setupModals() {
  $("#searchBtn").addEventListener("click", () => {
    openModal("searchModal");
    renderSearchResults($("#searchInput").value);
  });
  let modalSearchDebounce;
  $("#searchInput").addEventListener("input", (event) => {
    const value = event.target.value;
    clearTimeout(modalSearchDebounce);
    modalSearchDebounce = setTimeout(() => renderSearchResults(value), 120);
  });
  $("#searchInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.value.trim()) addSearchHistory(event.target.value);
  });
  $$("[data-close]").forEach((button) => button.addEventListener("click", () => closeModal(button.dataset.close)));
  $$(".overlay").forEach((overlay) => overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeModal(overlay.id);
  }));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") $$(".overlay.visible").forEach((modal) => closeModal(modal.id));
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openModal("searchModal");
      renderSearchResults($("#searchInput").value);
    }
  });
}

function setupFilters() {
  updateFavoritesCount();
  const filterKey = "codex-studys-last-filter";
  const urlParams = new URLSearchParams(window.location.search);
  const urlFilter = urlParams.get("filter");
  const urlQuery = urlParams.get("q");
  const urlSort = urlParams.get("sort");
  const savedFilter = urlFilter || localStorage.getItem(filterKey);
  const savedButton = savedFilter && $(`.filter-row .filter[data-filter="${savedFilter}"]`);
  if (savedButton) {
    activeFilter = savedFilter;
    $$(".filter-row .filter").forEach((item) => item.classList.toggle("active", item === savedButton));
  }
  if (urlQuery) {
    searchQuery = urlQuery;
    const inlineSearchEl = $("#inlineSearchInput");
    if (inlineSearchEl) inlineSearchEl.value = urlQuery;
  }
  if (urlSort && ["relevance", "newest", "az", "za"].includes(urlSort)) {
    sortMode = urlSort;
    const sortSelectEl = $("#sortSelect");
    if (sortSelectEl) sortSelectEl.value = urlSort;
  }
  const urlLang = urlParams.get("lang");
  if (urlLang && ["hindi", "english", "hinglish"].includes(urlLang)) {
    langFilter = urlLang;
    const langSelectEl = $("#langSelect");
    if (langSelectEl) langSelectEl.value = urlLang;
  }
  $$(".filter-row .filter").forEach((button) => button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    localStorage.setItem(filterKey, activeFilter);
    visibleCount = PAGE_SIZE;
    $$(".filter-row .filter").forEach((item) => item.classList.toggle("active", item === button));
    renderBatches();
  }));
  const inlineSearch = $("#inlineSearchInput");
  let searchDebounce;
  inlineSearch?.addEventListener("input", (event) => {
    const value = event.target.value;
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      searchQuery = value;
      visibleCount = PAGE_SIZE;
      renderBatches();
    }, 150);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
    const active = document.activeElement;
    const typing = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
    if (typing) return;
    event.preventDefault();
    inlineSearch?.focus();
  });
  $("#sortSelect")?.addEventListener("change", (event) => {
    sortMode = event.target.value;
    visibleCount = PAGE_SIZE;
    renderBatches();
  });
  $("#langSelect")?.addEventListener("change", (event) => {
    langFilter = event.target.value;
    visibleCount = PAGE_SIZE;
    renderBatches();
  });
  $("#copyLinkBtn")?.addEventListener("click", () => {
    syncUrlParams();
    const url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => showToast("Link copied!")).catch(() => showToast("Could not copy link"));
    } else {
      showToast("Copy not supported on this browser");
    }
  });
  $("#clearFiltersBtn")?.addEventListener("click", () => {
    activeFilter = "all";
    searchQuery = "";
    sortMode = "relevance";
    langFilter = "all";
    const langSelectEl = $("#langSelect");
    if (langSelectEl) langSelectEl.value = "all";
    visibleCount = PAGE_SIZE;
    localStorage.setItem(filterKey, "all");
    if (inlineSearch) inlineSearch.value = "";
    const sortSelectEl = $("#sortSelect");
    if (sortSelectEl) sortSelectEl.value = "relevance";
    $$(".filter-row .filter").forEach((item) => item.classList.toggle("active", item.dataset.filter === "all"));
    renderBatches();
  });
}

function setupLoadMore() {
  const loadMoreBtn = $("#loadMoreBtn");
  if (!loadMoreBtn) return;
  const loadNext = () => {
    visibleCount += PAGE_SIZE;
    renderBatches();
  };
  loadMoreBtn.addEventListener("click", loadNext);
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && loadMoreBtn.style.display !== "none") loadNext();
    });
  }, { rootMargin: "600px" });
  observer.observe(loadMoreBtn);
}

function setupAnnouncements() {
  const key = "codex-studys-announce-seen";
  const badge = document.querySelector("#announceBtn .icon-badge");
  if (localStorage.getItem(key) === "true") badge?.remove();
  $("#announceBtn")?.addEventListener("click", () => {
    openModal("announceModal");
    localStorage.setItem(key, "true");
    badge?.remove();
  });
  $("#announceCopyLink")?.addEventListener("click", () => {
    const url = window.location.origin + window.location.pathname;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => showToast("Link copied!")).catch(() => showToast("Could not copy link"));
    } else {
      showToast("Copy not supported on this browser");
    }
  });
}

const THEME_COLORS = {
  light: "#f4f5f9", dark: "#090b10", sandalwood: "#1c130c", "forest-emerald": "#06140f",
  "ocean-deep": "#050e17", "sakura-blossom": "#fff3f6", "dracula-midnight": "#14121f",
  "lavender-mist": "#f5f2fc", "cyberpunk-neon": "#05020a"
};

function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const current = document.documentElement.getAttribute("data-theme");
  meta.setAttribute("content", THEME_COLORS[current] || THEME_COLORS.dark);
}

function setupThemePicker() {
  syncThemeColor();
  const key = "codex-studys-theme";
  const markActive = () => {
    const current = localStorage.getItem(key) || "system";
    $$(".theme-option").forEach((option) => option.classList.toggle("active", option.dataset.theme === current));
  };
  $("#themeBtn")?.addEventListener("click", () => {
    markActive();
    openModal("themeModal");
  });
  $$(".theme-option").forEach((option) => option.addEventListener("click", () => {
    const theme = option.dataset.theme;
    localStorage.setItem(key, theme);
    if (theme === "system") {
      document.documentElement.removeAttribute("data-theme");
      const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
      if (prefersLight) document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
    syncThemeColor();
    markActive();
  }));
}

/* ================= Animation Effects ================= */
function setupFxEngine() {
  const ENABLED_KEY = "codex-studys-fx-enabled";
  const EFFECT_KEY = "codex-studys-fx-effect";
  const INTENSITY_KEY = "codex-studys-fx-intensity";
  const SCALE = [0.55, 1, 1.85];

  const enableToggle = $("#fxEnableToggle");
  const grid = $("#effectsGrid");
  const intensityInput = $("#fxIntensity");
  const fxBtn = $("#fxBtn");
  if (!grid) return;

  let canvas = null, ctx = null, rafId = null, dpr = 1, running = false, last = 0;
  let particles = [], bolts = [], flash = 0, burstTimer = 0, boltTimer = 0;
  let effect = localStorage.getItem(EFFECT_KEY) || "rain";
  let intensity = Number(localStorage.getItem(INTENSITY_KEY));
  if (!Number.isInteger(intensity) || intensity < 0 || intensity > 2) intensity = 1;
  let enabled = localStorage.getItem(ENABLED_KEY) === "true";

  const reducedMotion = () =>
    document.documentElement.getAttribute("data-reduced-motion") === "true" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.id = "fxCanvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
  }

  function resizeCanvas() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function density(base) {
    const w = window.innerWidth;
    const dscale = w < 480 ? 0.5 : w < 900 ? 0.75 : 1;
    return Math.max(6, Math.round(base * dscale * SCALE[intensity]));
  }

  function seed() {
    const w = window.innerWidth, h = window.innerHeight;
    particles = []; bolts = []; flash = 0; burstTimer = 0; boltTimer = 0;
    if (effect === "rain" || effect === "storm") {
      const n = density(effect === "storm" ? 100 : 75);
      for (let i = 0; i < n; i++) particles.push({
        x: Math.random() * w, y: Math.random() * h - h,
        len: 14 + Math.random() * 16, speed: 7 + Math.random() * 7,
        drift: effect === "storm" ? 2.6 : 0.7
      });
    } else if (effect === "snow") {
      const n = density(70);
      for (let i = 0; i < n; i++) particles.push({
        x: Math.random() * w, y: Math.random() * h,
        r: 1.5 + Math.random() * 2.6, speed: 0.6 + Math.random() * 1.3,
        phase: Math.random() * Math.PI * 2, amp: 10 + Math.random() * 20
      });
    } else if (effect === "hail") {
      const n = density(55);
      for (let i = 0; i < n; i++) particles.push({
        x: Math.random() * w, y: Math.random() * h - h,
        r: 2 + Math.random() * 2, speed: 10 + Math.random() * 6, drift: 1.4
      });
    } else if (effect === "fireball") {
      const n = density(40);
      for (let i = 0; i < n; i++) particles.push({
        x: Math.random() * w, y: h + Math.random() * 100,
        r: 2 + Math.random() * 3.2, speed: 0.7 + Math.random() * 1.3,
        drift: Math.random() * 1.2 - 0.6, flick: Math.random() * Math.PI * 2
      });
    }
  }

  function spawnBurst(w, h) {
    const cx = 40 + Math.random() * (w - 80);
    const cy = 60 + Math.random() * (h * 0.45);
    const hue = Math.floor(Math.random() * 360);
    const count = density(26);
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const sp = 1.6 + Math.random() * 2.2;
      particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, hue });
    }
  }

  function spawnBolt(w, h) {
    const points = [];
    let x = 60 + Math.random() * Math.max(w - 120, 20), y = 0;
    points.push({ x, y });
    while (y < h * 0.7) {
      y += 18 + Math.random() * 22;
      x += (Math.random() - 0.5) * 40;
      points.push({ x, y });
    }
    bolts.push({ points, life: 1 });
    flash = 0.35;
  }

  function step(dt, w, h) {
    ctx.clearRect(0, 0, w, h);
    if (effect === "rain" || effect === "storm") {
      ctx.strokeStyle = "rgba(160,200,255,.55)";
      ctx.lineWidth = 1.3;
      particles.forEach((p) => {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.drift * 3, p.y + p.len);
        ctx.stroke();
        p.y += p.speed * dt * 60; p.x += p.drift * dt * 60;
        if (p.y > h) { p.y = -p.len; p.x = Math.random() * w; }
      });
      if (effect === "storm") {
        boltTimer -= dt;
        if (boltTimer <= 0) { spawnBolt(w, h); boltTimer = 2.5 + Math.random() * 4; }
      }
    } else if (effect === "snow") {
      ctx.fillStyle = "rgba(255,255,255,.85)";
      particles.forEach((p) => {
        p.phase += dt;
        const x = p.x + Math.sin(p.phase) * p.amp * 0.02;
        ctx.beginPath(); ctx.arc(x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        p.y += p.speed * dt * 60;
        if (p.y > h) { p.y = -4; p.x = Math.random() * w; }
      });
    } else if (effect === "hail") {
      ctx.fillStyle = "rgba(220,235,255,.9)";
      particles.forEach((p) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        p.y += p.speed * dt * 60; p.x += p.drift * dt * 60;
        if (p.y > h) { p.y = -6; p.x = Math.random() * w; }
      });
    } else if (effect === "fireball") {
      particles.forEach((p) => {
        p.flick += dt * 6;
        const alpha = 0.5 + Math.sin(p.flick) * 0.3;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3);
        grad.addColorStop(0, `rgba(255,180,80,${alpha})`);
        grad.addColorStop(1, "rgba(255,80,20,0)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2); ctx.fill();
        p.y -= p.speed * dt * 60; p.x += p.drift * dt * 30;
        if (p.y < -10) { p.y = h + Math.random() * 40; p.x = Math.random() * w; }
      });
    } else if (effect === "firecracker") {
      burstTimer -= dt;
      if (burstTimer <= 0) { spawnBurst(w, h); burstTimer = 1.1 + Math.random() * (2.6 - intensity * 0.7); }
      particles = particles.filter((p) => p.life > 0);
      particles.forEach((p) => {
        p.vy += dt * 1.6; p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.life -= dt * 0.9;
        ctx.fillStyle = `hsla(${p.hue},95%,65%,${Math.max(p.life, 0)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
      });
    } else if (effect === "lightning") {
      boltTimer -= dt;
      if (boltTimer <= 0) { spawnBolt(w, h); boltTimer = 2.6 + Math.random() * (5 - intensity); }
    }

    if (effect === "storm" || effect === "lightning") {
      bolts = bolts.filter((b) => b.life > 0);
      bolts.forEach((b) => {
        ctx.strokeStyle = `rgba(220,235,255,${b.life})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        b.points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.stroke();
        b.life -= dt * 1.8;
      });
      if (flash > 0) {
        ctx.fillStyle = `rgba(210,225,255,${flash})`;
        ctx.fillRect(0, 0, w, h);
        flash -= dt * 0.9;
      }
    }
  }

  function loop(ts) {
    if (!running) return;
    const dt = Math.min((ts - last) / 1000 || 0, 0.05);
    last = ts;
    step(dt, window.innerWidth, window.innerHeight);
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (running) return;
    ensureCanvas();
    seed();
    running = true;
    last = 0;
    rafId = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  function apply() {
    if (enabled && !reducedMotion() && !document.hidden) start(); else stop();
  }

  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else apply(); });
  window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", apply);
  window.__codexFxApply = apply;

  function markActive() {
    $$(".effect-option").forEach((btn) => btn.classList.toggle("active", btn.dataset.effect === effect));
  }
  enableToggle?.setAttribute("aria-checked", String(enabled));
  if (intensityInput) intensityInput.value = String(intensity);
  markActive();

  enableToggle?.addEventListener("click", () => {
    enabled = enableToggle.getAttribute("aria-checked") !== "true";
    enableToggle.setAttribute("aria-checked", String(enabled));
    localStorage.setItem(ENABLED_KEY, String(enabled));
    apply();
  });

  grid.addEventListener("click", (event) => {
    const btn = event.target.closest(".effect-option");
    if (!btn) return;
    effect = btn.dataset.effect;
    localStorage.setItem(EFFECT_KEY, effect);
    markActive();
    if (running) { stop(); apply(); }
  });

  intensityInput?.addEventListener("input", () => {
    intensity = Number(intensityInput.value);
    localStorage.setItem(INTENSITY_KEY, String(intensity));
    if (running) seed();
  });

  fxBtn?.addEventListener("click", () => openModal("effectsModal"));

  if (enabled) apply();
}

/* ================= Network Status ================= */
function setupNetworkStatus() {
  const netBtn = $("#netBtn");
  const typeEl = $("#netType");
  const pingEl = $("#netPing");
  const latencyEl = $("#netLatency");
  const bwEl = $("#netBandwidth");
  const statusEl = $("#netStatus");
  const refreshBtn = $("#netRefreshBtn");
  if (!netBtn || !typeEl) return;

  let pollTimer = null;
  const PING_ASSET = "assets/icon-192.png";

  function connInfo() {
    return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  }
  function typeLabel() {
    const c = connInfo();
    if (c) {
      const t = c.type && c.type !== "unknown" ? c.type : c.effectiveType;
      if (t) return t === "wifi" ? "Wi-Fi" : t.toUpperCase();
    }
    return "Unknown";
  }
  function bandwidthLabel() {
    const c = connInfo();
    return c && typeof c.downlink === "number" ? `${c.downlink} Mbps` : "—";
  }
  function setStatus(online) {
    statusEl.innerHTML = `<span class="net-status-dot${online ? "" : " offline"}"></span>${online ? "Online" : "Offline"}`;
  }

  async function measure() {
    if (!navigator.onLine) {
      typeEl.textContent = "Offline"; pingEl.textContent = "—"; latencyEl.textContent = "—";
      bwEl.textContent = "—"; setStatus(false);
      return;
    }
    typeEl.textContent = typeLabel();
    bwEl.textContent = bandwidthLabel();
    setStatus(true);
    const samples = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      try {
        await fetch(`${PING_ASSET}?_=${Date.now()}_${i}`, { method: "HEAD", cache: "no-store" });
        samples.push(performance.now() - t0);
      } catch (error) { /* ignore a single dropped sample */ }
    }
    if (samples.length) {
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      pingEl.textContent = `${Math.round(avg)} ms`;
      const entries = performance.getEntriesByType("resource").filter((r) => r.name.includes(PING_ASSET));
      const lastEntry = entries[entries.length - 1];
      const ttfb = lastEntry ? Math.max(0, lastEntry.responseStart - lastEntry.requestStart) : avg * 0.4;
      latencyEl.textContent = `${Math.round(ttfb || avg * 0.4)} ms`;
    } else {
      pingEl.textContent = "Timeout"; latencyEl.textContent = "—"; setStatus(false);
    }
  }

  function startPolling() {
    measure();
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = window.setInterval(() => {
      const modal = document.getElementById("networkModal");
      if (!modal || !modal.classList.contains("visible")) {
        window.clearInterval(pollTimer); pollTimer = null; return;
      }
      measure();
    }, 8000);
  }

  netBtn.addEventListener("click", () => { openModal("networkModal"); startPolling(); });
  refreshBtn?.addEventListener("click", measure);
}

const POPUP_SNOOZE_KEY = "codex-studys-popups-snooze";
const POPUP_SNOOZE_MS = 24 * 60 * 60 * 1000;

function popupsSnoozed() {
  try {
    const until = Number(localStorage.getItem(POPUP_SNOOZE_KEY) || 0);
    return until > Date.now();
  } catch (e) { return false; }
}

function setupTelegramPopup() {
  document.querySelectorAll("[data-snooze-popups]").forEach((btn) => {
    btn.addEventListener("click", () => {
      try { localStorage.setItem(POPUP_SNOOZE_KEY, String(Date.now() + POPUP_SNOOZE_MS)); } catch (e) {}
      closeModal("telegramModal");
      closeModal("installModal");
      showToast("Popups 24 ghante ke liye band");
    });
  });
  if (popupsSnoozed()) return;
  let seen = false;
  try { seen = sessionStorage.getItem("cx-popups-shown") === "1"; } catch (e) {}
  if (seen) return; // already shown this session (e.g. coming back from a batch)
  window.setTimeout(() => {
    try { sessionStorage.setItem("cx-popups-shown", "1"); } catch (e) {}
    openModal("telegramModal");
    const modal = document.getElementById("telegramModal");
    if (!modal) return;
    const watcher = window.setInterval(() => {
      if (!modal.classList.contains("visible")) {
        window.clearInterval(watcher);
        window.setTimeout(() => { if (!isStandaloneApp() && !popupsSnoozed()) openModal("installModal"); }, 200);
      }
    }, 150);
  }, 700);
}

let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function setupInstallPrompt() {
  if (isStandaloneApp()) return;
  const installBtn = $("#installActionBtn");
  const iosSteps = $("#iosInstallSteps");
  const body = $("#installBody");

  const showForIOS = () => {
    if (installBtn) installBtn.style.display = "none";
    if (iosSteps) iosSteps.style.display = "grid";
    if (body) body.textContent = "Add CODEX STUDYS to your home screen for a faster, app-like experience.";
  };

  installBtn?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    closeModal("installModal");
    if (outcome === "accepted") showToast("Installing CODEX STUDYS…");
  });

  window.addEventListener("appinstalled", () => {
    closeModal("installModal");
    showToast("CODEX STUDYS installed!");
  });

  if (isIOSDevice()) showForIOS();
}

function setupOfflineBanner() {
  const banner = $("#offlineBanner");
  if (!banner) return;
  const update = () => banner.classList.toggle("visible", !navigator.onLine);
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

function setupViewToggle() {
  const key = "codex-studys-view";
  const grid = $("#batchGrid");
  const gridBtn = $("#gridViewBtn");
  const listBtn = $("#listViewBtn");
  if (!grid || !gridBtn || !listBtn) return;
  const apply = (mode) => {
    grid.classList.toggle("list-view", mode === "list");
    gridBtn.classList.toggle("active", mode !== "list");
    gridBtn.setAttribute("aria-pressed", String(mode !== "list"));
    listBtn.classList.toggle("active", mode === "list");
    listBtn.setAttribute("aria-pressed", String(mode === "list"));
  };
  apply(localStorage.getItem(key) || "grid");
  gridBtn.addEventListener("click", () => { localStorage.setItem(key, "grid"); apply("grid"); });
  listBtn.addEventListener("click", () => { localStorage.setItem(key, "list"); apply("list"); });
}

function setupPreferences() {
  const contrastToggle = $("#contrastToggle");
  const motionToggle = $("#motionToggle");

  const applyContrast = (on) => {
    document.documentElement.setAttribute("data-contrast", on ? "high" : "normal");
    contrastToggle?.setAttribute("aria-checked", String(on));
  };
  const applyMotion = (on) => {
    document.documentElement.setAttribute("data-reduced-motion", String(on));
    motionToggle?.setAttribute("aria-checked", String(on));
  };
  applyContrast(localStorage.getItem("codex-studys-contrast") === "true");
  applyMotion(localStorage.getItem("codex-studys-reduced-motion") === "true");

  contrastToggle?.addEventListener("click", () => {
    const on = contrastToggle.getAttribute("aria-checked") !== "true";
    localStorage.setItem("codex-studys-contrast", String(on));
    applyContrast(on);
  });
  motionToggle?.addEventListener("click", () => {
    const on = motionToggle.getAttribute("aria-checked") !== "true";
    localStorage.setItem("codex-studys-reduced-motion", String(on));
    applyMotion(on);
    window.__codexFxApply?.();
  });

  $("#exportFavBtn")?.addEventListener("click", () => {
    const favorites = getFavorites();
    if (!favorites.length) return showToast("No favorites to export yet.");
    const details = allBatches.filter((batch) => favorites.includes(batch._id || batch.batch_id || ""));
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), favorites: details }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "codex-studys-favorites.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Favorites exported.");
  });

  const importInput = $("#importFavFile");
  $("#importFavBtn")?.addEventListener("click", () => importInput?.click());
  importInput?.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const ids = (data.favorites || []).map((batch) => batch._id || batch.batch_id).filter(Boolean);
        const current = getFavorites();
        const merged = [...new Set([...current, ...ids])];
        localStorage.setItem("codex-studys-favorites", JSON.stringify(merged));
        updateFavoritesCount();
        renderBatches();
        showToast(`Imported ${ids.length} favorite${ids.length === 1 ? "" : "s"}.`);
      } catch {
        showToast("That file could not be read.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  });

  $("#clearDataBtn")?.addEventListener("click", () => {
    if (!confirm("This clears favorites, theme, search history and all saved preferences on this device. Continue?")) return;
    Object.keys(localStorage).filter((key) => key.startsWith("codex-studys")).forEach((key) => localStorage.removeItem(key));
    showToast("App data cleared. Reloading…");
    setTimeout(() => window.location.reload(), 900);
  });
}

function animateCount(element, target) {
  if (!element) return;
  if (target <= 0) { element.textContent = "0"; return; }
  const duration = 700;
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = Math.round(target * eased).toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function updateStats() {
  const strip = $("#statsStrip");
  if (!strip) return;
  strip.style.display = "grid";
  const freshCount = allBatches.filter((batch) => isRecent(batch.startDate)).length;
  animateCount($("#statTotal"), allBatches.length);
  animateCount($("#statNew"), freshCount);
  const statFav = $("#statFav");
  if (statFav) statFav.textContent = getFavorites().length.toLocaleString();
  const statRecent = $("#statRecent");
  if (statRecent) statRecent.textContent = String(getRecentlyViewed().length);
}

function setupBackToTop() {
  const button = $("#backToTopBtn");
  if (!button) return;
  const onScroll = () => button.classList.toggle("visible", window.scrollY > 480);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
}


/* ---------- Personal notes ---------- */
function getPersonalNotes() {
  try { return JSON.parse(localStorage.getItem("codex-studys-notes") || "{}"); }
  catch { return {}; }
}

function getNote(id) {
  return getPersonalNotes()[id] || "";
}

function setNote(id, text) {
  const notes = getPersonalNotes();
  if (text.trim()) notes[id] = text.trim(); else delete notes[id];
  localStorage.setItem("codex-studys-notes", JSON.stringify(notes));
}

/* ---------- Quick view ---------- */
let detailBatch = null;

function openDetail(batch) {
  detailBatch = batch;
  const id = batch._id || batch.batch_id || "";
  const hero = document.getElementById("detailHero");
  if (hero) {
    hero.src = batch.previewImage || FALLBACK_THUMB;
    hero.onerror = () => { hero.onerror = null; hero.src = FALLBACK_THUMB; };
  }
  const titleEl = document.getElementById("detailTitle");
  if (titleEl) titleEl.textContent = batch.name || "Untitled course";
  const subEl = document.getElementById("detailSub");
  if (subEl) subEl.textContent = batch.byName || "Structured learning for your next milestone";
  const facts = [
    ["Category", categoryFor(batch).toUpperCase()],
    ["Language", batch.language || "Self-paced"],
    ["Starts", formatDate(batch.startDate) || "Anytime"],
    ["Subjects", String((batch.subBatches || []).length || "—")]
  ];
  const factsEl = document.getElementById("detailFacts");
  if (factsEl) factsEl.innerHTML = facts.map(([k, v]) => `<div class="detail-fact"><span>${escapeHtml(k)}</span><span>${escapeHtml(String(v))}</span></div>`).join("");
  const noteEl = document.getElementById("detailNote");
  if (noteEl) noteEl.value = getNote(id);
  syncDetailFavButton(id);
  openModal("detailModal");
}

function syncDetailFavButton(id) {
  const favBtn = document.getElementById("detailFavBtn");
  if (favBtn) favBtn.textContent = isFavorite(id) ? "❤ Saved" : "❤ Save";
}

function setupDetailModal() {
  document.getElementById("detailFavBtn")?.addEventListener("click", () => {
    if (!detailBatch) return;
    const id = detailBatch._id || detailBatch.batch_id || "";
    const active = toggleFavorite(id);
    syncDetailFavButton(id);
    updateFavoritesCount();
    renderBatches();
    showToast(active ? "Added to favorites." : "Removed from favorites.");
  });
  document.getElementById("detailOpenBtn")?.addEventListener("click", () => {
    if (detailBatch) openBatch(detailBatch);
  });
  const noteEl = document.getElementById("detailNote");
  let noteTimer;
  noteEl?.addEventListener("input", () => {
    if (!detailBatch) return;
    const id = detailBatch._id || detailBatch.batch_id || "";
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      setNote(id, noteEl.value);
      renderBatches();
    }, 400);
  });
}

/* ---------- Reading progress ---------- */
function setupScrollProgress() {
  const bar = document.getElementById("scrollProgress");
  if (!bar) return;
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = `${max > 0 ? Math.min((window.scrollY / max) * 100, 100) : 0}%`;
  };
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
}

/* ---------- Shortcuts ---------- */
function setupShortcuts() {
  document.getElementById("shortcutsBtn")?.addEventListener("click", () => openModal("shortcutsModal"));
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const active = document.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) return;
    const key = event.key.toLowerCase();
    if (event.key === "?") { event.preventDefault(); openModal("shortcutsModal"); }
    else if (key === "f") { event.preventDefault(); document.getElementById("favNavBtn")?.click(); }
    else if (key === "t") { event.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  });
}

/* ---------- Vidyakul study flow: Batches → Subjects → Lectures → Player ---------- */
const VK_API = "https://bkl-tawny.vercel.app/api";
const study = { token: 0, homeScroll: 0, speed: 1 };
const vkCache = { subjects: new Map(), lectures: new Map(), notes: new Map() };

/* Playback / PDF fallbacks. Adjust these if Vidyakul exposes a real stream/PDF proxy. */
const VK_STREAM_PROXY = "";   // e.g. "https://your-proxy.example/stream?url={url}" — applied to lecture stream URLs when set
const VK_NOTE_URL_TEMPLATE = `${VK_API}/note?id={id}`;   // used only when a note has no direct link; {id} = note._id
const VK_FALLBACK_VIDEO = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
const studyEl = () => document.getElementById("studyView");
const ST_ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  chev: '<svg class="st-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.4v.1"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6H3v-6z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>'
};

/* API: same endpoints and response shapes the Vidyakul app uses */
async function vkGet(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(VK_API + path, { signal: controller.signal });
    if (!response.ok) throw new Error(`Server responded with ${response.status}`);
    try { return await response.json(); } catch (e) { throw new Error("Server sent an unreadable response"); }
  } catch (error) {
    if (error && error.name === "AbortError") throw new Error("The request timed out");
    throw error;
  } finally { clearTimeout(timer); }
}

async function fetchVkBatches() {
  const body = await vkGet("/batches");
  return Array.isArray(body && body.data) ? body.data : Array.isArray(body) ? body : [];
}

// Vidyakul batch fields (_id, title, image) → the field names Codexyt's cards already use.
function normalizeVkBatch(batch) {
  return Object.assign({}, batch, { _id: batch._id, name: batch.title, previewImage: batch.image || "", byName: "Tap to explore subjects" });
}

async function getSubjects(batchId) {
  if (vkCache.subjects.has(batchId)) return vkCache.subjects.get(batchId);
  const body = await vkGet(`/subjects?batchId=${encodeURIComponent(batchId)}`);
  const list = (body && body.data && body.data.subjects) || [];
  vkCache.subjects.set(batchId, list);
  return list;
}

async function getLectures(batchId, subjectId) {
  const key = `${batchId}|${subjectId}`;
  if (vkCache.lectures.has(key)) return vkCache.lectures.get(key);
  const body = await vkGet(`/lectures?batchId=${encodeURIComponent(batchId)}&subjectId=${encodeURIComponent(subjectId)}`);
  const list = (body && body.data && body.data.chapters) || [];
  vkCache.lectures.set(key, list);
  return list;
}

async function getNotes(batchId, subjectId) {
  const key = `${batchId}|${subjectId}`;
  if (vkCache.notes.has(key)) return vkCache.notes.get(key);
  const body = await vkGet(`/notes?batchId=${encodeURIComponent(batchId)}&subjectId=${encodeURIComponent(subjectId)}`);
  const list = (body && body.data && body.data.chapters) || [];
  vkCache.notes.set(key, list);
  return list;
}

const subjectTitle = (subject) => subject.title || subject.subjectName || subject.name || "Untitled Subject";
const lectureTitle = (lecture) => lecture.title || lecture.name || "Untitled Lecture";
const sortLectures = (list) => [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const isHttpUrl = (value) => typeof value === "string" && /^https?:\/\//i.test(value.trim());

/* Notes / resources: only URLs the API actually returned on the lecture (never invented). */
const RES_KEY = /note|pdf|dpp|resource|attach|document|material|handout|sheet|slide|file|doc/i;
const RES_EXT = /\.(pdf|docx?|pptx?|xlsx?|zip|rar|txt)(\?|#|$)/i;
function prettyKey(key) {
  const text = String(key).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Resource";
}
function extractResources(lecture) {
  const found = [];
  const seen = new Set();
  const push = (url, label, topKey) => {
    const clean = url.trim();
    if (seen.has(clean) || clean === (lecture.link || "").trim()) return;
    if (!(RES_KEY.test(topKey) || RES_EXT.test(clean))) return;
    seen.add(clean);
    found.push({ url: clean, label: label || prettyKey(topKey) });
  };
  const walk = (value, topKey, label, depth) => {
    if (isHttpUrl(value)) push(value, label, topKey);
    else if (Array.isArray(value) && depth < 3) value.forEach((item) => walk(item, topKey, label, depth + 1));
    else if (value && typeof value === "object" && depth < 3) {
      const own = typeof value.title === "string" ? value.title : typeof value.name === "string" ? value.name : label;
      Object.values(value).forEach((item) => walk(item, topKey, own, depth + 1));
    }
  };
  Object.entries(lecture || {}).forEach(([key, value]) => { if (key !== "link") walk(value, key, "", 0); });
  return found;
}

/* Notes: resolve a PDF URL from the note (direct link fields first, then _id template) */
const NOTE_LINK_KEYS = ["link", "url", "pdf", "pdfUrl", "pdfLink", "file", "fileUrl", "downloadUrl", "path"];
function noteUrl(note) {
  if (!note) return "";
  for (const key of NOTE_LINK_KEYS) if (isHttpUrl(note[key])) return note[key].trim();
  if (note._id && VK_NOTE_URL_TEMPLATE) return VK_NOTE_URL_TEMPLATE.replace("{id}", encodeURIComponent(note._id));
  return "";
}
const noteDate = (note) => {
  if (!note.date) return "";
  const d = new Date(note.date);
  return isNaN(d) ? String(note.date) : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

/* Lecture ↔ note matching: "DL-1", "L-1", "Lecture 01", "Lec 1" → same key ("l1"); "DPP-2" → "dpp2" */
function lectureKey(title) {
  const text = String(title || "").toLowerCase();
  const match = text.match(/\b(dpp|dl|lec(?:ture)?|l)\s*[-_.:#]?\s*0*(\d+)\b/);
  if (!match) return "";
  const kind = match[1] === "dpp" ? "dpp" : "l";   // DL / L / Lec / Lecture all mean lecture number N
  return kind + Number(match[2]);
}
function linkNotesToLectures(lectures, notes) {
  const byKey = new Map();
  (notes || []).forEach((note) => {
    const key = lectureKey(note.title || note.name);
    if (!key) return;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(note);
  });
  return new Map(lectures.map((lecture) => {
    const own = extractResources(lecture);
    const linked = (byKey.get(lectureKey(lectureTitle(lecture))) || [])
      .map((note) => ({ url: noteUrl(note), label: note.title || "PDF" }))
      .filter((res) => res.url && !own.some((o) => o.url === res.url));
    return [String(lecture._id), own.concat(linked)];
  }));
}

/* Stream URL: real link → alternate fields → placeholder. Optional proxy wraps real streams. */
function resolveStream(lecture) {
  const candidates = [lecture.link, lecture.streamUrl, lecture.videoUrl];
  const real = candidates.find(isHttpUrl);
  if (real) {
    const url = real.trim();
    return { url: VK_STREAM_PROXY ? VK_STREAM_PROXY.replace("{url}", encodeURIComponent(url)) : url, original: url, isFallback: false };
  }
  return { url: VK_FALLBACK_VIDEO, original: "", isFallback: true };
}

/* Routing (URL is the source of truth, so browser/mobile back just works) */
function studyParams() {
  const params = new URLSearchParams(window.location.search);
  return { view: params.get("study"), batch: params.get("batch"), subject: params.get("subject"), lecture: params.get("lecture") };
}

function studyUrl(view, ids) {
  const params = new URLSearchParams({ study: view, batch: ids.batch });
  if (ids.subject) params.set("subject", ids.subject);
  if (ids.lecture) params.set("lecture", ids.lecture);
  return `${window.location.pathname}?${params.toString()}`;
}

function studyGo(view, ids, replace) {
  const depth = (window.history.state && window.history.state.cx && window.history.state.depth) || 0;
  if (replace) window.history.replaceState({ cx: 1, depth }, "", studyUrl(view, ids));
  else window.history.pushState({ cx: 1, depth: depth + 1 }, "", studyUrl(view, ids));
  routeStudy();
}

function studyParent() {
  const p = studyParams();
  if (p.view === "player") return { view: "lectures", ids: { batch: p.batch, subject: p.subject } };
  if (p.view === "lectures") return { view: "subjects", ids: { batch: p.batch } };
  return null;
}

function studyBack() {
  const state = window.history.state;
  if (state && state.cx && state.depth > 0) { window.history.back(); return; }
  const parent = studyParent();
  if (parent) studyGo(parent.view, parent.ids, true);
  else exitStudy();
}

function exitStudy() {
  const state = window.history.state;
  if (state && state.cx && state.depth > 0) { window.history.go(-state.depth); return; }
  window.history.replaceState(null, "", window.location.pathname);
  routeStudy();
}

function rememberHomePosition(id) {
  study.homeScroll = window.scrollY;
  const card = document.querySelector(`.course-card[data-id="${escapeHtml(id)}"]`);
  study.anchor = card ? { id: escapeHtml(id), top: card.getBoundingClientRect().top } : null;
}

function restoreHomePosition() {
  const anchor = study.anchor;
  const card = anchor && document.querySelector(`.course-card[data-id="${anchor.id}"]`);
  if (card) card.getAnimations().forEach((animation) => animation.finish());
  const top = card ? window.scrollY + card.getBoundingClientRect().top - anchor.top : study.homeScroll || 0;
  window.scrollTo({ top, left: 0, behavior: "instant" });
}

function openStudy(batch) {
  studyGo("subjects", { batch: batch._id || batch.batch_id });
}

function studyBatch(batchId) {
  return allBatches.find((item) => (item._id || item.batch_id) === batchId) || { _id: batchId, name: "Batch" };
}

function teardownPlayer() {
  const video = document.getElementById("stVideo");
  if (video) { try { video.pause(); video.removeAttribute("src"); video.load(); } catch (e) {} }
}

function showHome() {
  teardownPlayer();
  study.token++;
  const wasOpen = document.body.classList.contains("study-open");
  document.body.classList.remove("study-open");
  const host = studyEl();
  if (host) host.innerHTML = "";
  if (wasOpen) window.requestAnimationFrame(restoreHomePosition);
}

function routeStudy() {
  const p = studyParams();
  if (!p.view || !p.batch) { showHome(); return; }
  teardownPlayer();
  if (!document.body.classList.contains("study-open")) document.body.classList.add("study-open");
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  if (p.view === "subjects") viewSubjects(p.batch);
  else if (p.view === "lectures" && p.subject) viewLectures(p.batch, p.subject);
  else if (p.view === "player" && p.subject && p.lecture) viewPlayer(p.batch, p.subject, p.lecture);
  else showHome();
}

/* Shared UI pieces */
const stBackBtn = (label) => `<button class="st-back" type="button" data-st-back>${ST_ICON.back}${escapeHtml(label)}</button>`;
const stSkeleton = (count, kind) => `<div class="${kind === "row" ? "st-list" : "st-grid"}">${Array.from({ length: count }, () => `<div class="st-skel ${kind}"></div>`).join("")}</div>`;
function stState(kind, title, text, detail) {
  return `<div class="st-state${kind === "error" ? " is-error" : ""}"><div class="st-state-ico">${kind === "error" ? ST_ICON.alert : ST_ICON.inbox}</div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}${kind === "error" ? '<button class="st-btn st-btn-primary" type="button" data-st-retry>Try again</button>' : ""}</div>`;
}
function stErrorHtml(error) {
  const offline = navigator.onLine === false;
  return stState("error", offline ? "You're offline" : "Couldn't load this right now", offline ? "Check your internet connection and try again." : "The Vidyakul server didn't respond as expected. Please try again in a moment.", offline ? "" : (error && error.message) || "");
}
function stFrame(html) {
  const host = studyEl();
  host.innerHTML = html;
  host.querySelector("[data-st-back]")?.addEventListener("click", studyBack);
  return host;
}
function stSearchBox(placeholder) {
  return `<div class="search-box st-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input id="stSearch" type="search" placeholder="${escapeHtml(placeholder)}" autocomplete="off" aria-label="${escapeHtml(placeholder)}"></div>`;
}

/* Subjects */
async function viewSubjects(batchId) {
  const token = ++study.token;
  const batch = studyBatch(batchId);
  const host = stFrame(`${stBackBtn("Back to Batches")}
    <div class="st-eyebrow"><i class="st-dot"></i><span id="stBatchName">${escapeHtml(batch.name)}</span></div>
    <h2 class="st-title">Subjects</h2><p class="st-sub">Choose a subject to start learning</p>
    ${stSearchBox("Search subjects…")}<div id="stBody">${stSkeleton(6, "card")}</div>`);
  const body = host.querySelector("#stBody");
  const search = host.querySelector("#stSearch");
  let subjects;
  try { subjects = await getSubjects(batchId); }
  catch (error) {
    if (token !== study.token) return;
    body.innerHTML = stErrorHtml(error);
    body.querySelector("[data-st-retry]")?.addEventListener("click", () => viewSubjects(batchId));
    return;
  }
  if (token !== study.token) return;
  const paint = () => {
    const query = search.value.trim().toLowerCase();
    const shown = subjects.filter((subject) => subjectTitle(subject).toLowerCase().includes(query));
    if (!shown.length) { body.innerHTML = stState("empty", query ? "No subjects match your search" : "No subjects available", query ? "Try a different keyword." : "This batch doesn't have any subjects yet."); return; }
    body.innerHTML = `<div class="st-grid">${shown.map((subject, index) => `
      <button class="st-card" type="button" data-subject="${escapeHtml(subject._id)}" style="animation-delay:${Math.min(index, 12) * 45}ms">
        <div class="st-card-top"><div class="st-ico">${ST_ICON.book}</div>${ST_ICON.chev}</div>
        <h3>${escapeHtml(subjectTitle(subject))}</h3>
        ${subject.totalVideos !== undefined ? `<span class="st-badge">${escapeHtml(String(subject.totalVideos))} Videos</span>` : ""}
      </button>`).join("")}</div>`;
    body.querySelectorAll("[data-subject]").forEach((card) => card.addEventListener("click", () => studyGo("lectures", { batch: batchId, subject: card.dataset.subject })));
  };
  search.addEventListener("input", paint);
  paint();
}

/* Lectures */
function openResources(resources, title) {
  if (resources.length === 1) { window.open(resources[0].url, "_blank", "noopener,noreferrer"); return; }
  let overlay = document.getElementById("stResModal");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.id = "stResModal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.addEventListener("click", (event) => { if (event.target === overlay || event.target.closest("[data-st-close]")) closeModal("stResModal"); });
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="modal"><button class="close-btn" type="button" data-st-close aria-label="Close">×</button><h2 style="margin:0 0 4px;font:600 18px 'Space Grotesk',sans-serif;">Notes &amp; Resources</h2><p style="margin:0;color:var(--muted);font-size:12px;">${escapeHtml(title)}</p><div class="st-res-list">${resources.map((res) => `<a href="${escapeHtml(res.url)}" target="_blank" rel="noopener noreferrer">${ST_ICON.file}<span>${escapeHtml(res.label)}</span></a>`).join("")}</div></div>`;
  openModal("stResModal");
}

async function viewLectures(batchId, subjectId) {
  const token = ++study.token;
  const batch = studyBatch(batchId);
  const host = stFrame(`${stBackBtn("Back to Subjects")}
    <div class="st-eyebrow"><i class="st-dot"></i><span><span id="stBatchName">${escapeHtml(batch.name)}</span> • <span id="stSubjectName">Subject</span></span></div>
    <h2 class="st-title">Lectures</h2><p class="st-sub" id="stCount">Loading lectures…</p>
    <div class="st-tabs" id="stTabs" role="tablist" hidden></div>
    ${stSearchBox("Search lectures…")}<div id="stBody">${stSkeleton(7, "row")}</div>`);
  const body = host.querySelector("#stBody");
  const search = host.querySelector("#stSearch");
  const tabsEl = host.querySelector("#stTabs");
  let lectures, notes = [], subjects = null;
  try {
    // Lectures are required; notes/subjects are best-effort so a notes failure never blocks lectures.
    [lectures, notes, subjects] = await Promise.all([
      getLectures(batchId, subjectId),
      getNotes(batchId, subjectId).catch(() => []),
      getSubjects(batchId).catch(() => null)
    ]);
  } catch (error) {
    if (token !== study.token) return;
    host.querySelector("#stCount").textContent = "Something went wrong";
    body.innerHTML = stErrorHtml(error);
    body.querySelector("[data-st-retry]")?.addEventListener("click", () => viewLectures(batchId, subjectId));
    return;
  }
  if (token !== study.token) return;
  const subject = subjects && subjects.find((item) => String(item._id) === String(subjectId));
  if (subject) host.querySelector("#stSubjectName").textContent = subjectTitle(subject);
  const sorted = sortLectures(lectures);
  const resourceMap = linkNotesToLectures(sorted, notes);
  let tab = "lectures";

  tabsEl.hidden = false;
  tabsEl.innerHTML = `<button class="st-tab active" type="button" role="tab" aria-selected="true" data-tab="lectures">Lectures (${sorted.length})</button>
    <button class="st-tab" type="button" role="tab" aria-selected="false" data-tab="notes">Notes / PDFs (${notes.length})</button>`;
  const setCount = () => {
    host.querySelector("#stCount").textContent = tab === "lectures"
      ? `${sorted.length} lecture${sorted.length === 1 ? "" : "s"} available`
      : `${notes.length} note${notes.length === 1 ? "" : "s"} available`;
    host.querySelector(".st-title").textContent = tab === "lectures" ? "Lectures" : "Notes / PDFs";
    search.placeholder = tab === "lectures" ? "Search lectures…" : "Search notes…";
    search.setAttribute("aria-label", search.placeholder);
  };

  const paintLectures = (query) => {
    const shown = sorted.filter((lecture) => lectureTitle(lecture).toLowerCase().includes(query));
    if (!shown.length) { body.innerHTML = stState("empty", query ? "No lectures match your search" : "No lectures available", query ? "Try a different keyword." : "Lectures for this subject haven't been added yet."); return; }
    body.innerHTML = `<div class="st-list">${shown.map((lecture, index) => {
      const resources = resourceMap.get(String(lecture._id)) || [];
      return `<div class="st-lec" role="button" tabindex="0" data-lecture="${escapeHtml(lecture._id)}" style="animation-delay:${Math.min(index, 12) * 40}ms">
        <span class="st-num">${escapeHtml(String(lecture.order ?? sorted.indexOf(lecture) + 1))}</span>
        <div class="st-lec-main"><h3>${escapeHtml(lectureTitle(lecture))}</h3>
          <div class="st-lec-meta">${lecture.duration ? `<span class="st-dur">${ST_ICON.clock}${escapeHtml(String(lecture.duration))}</span>` : ""}${resources.length ? `<button class="st-pill" type="button" data-res="${escapeHtml(lecture._id)}">${ST_ICON.file}${resources.length === 1 ? escapeHtml(resources[0].label) : `Resources (${resources.length})`}</button>` : ""}</div></div>
        <span class="st-play">${ST_ICON.play}</span>
      </div>`;
    }).join("")}</div>`;
    const open = (id) => studyGo("player", { batch: batchId, subject: subjectId, lecture: id });
    body.querySelectorAll("[data-lecture]").forEach((row) => {
      row.addEventListener("click", () => open(row.dataset.lecture));
      row.addEventListener("keydown", (event) => { if (event.target === row && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); open(row.dataset.lecture); } });
    });
    body.querySelectorAll("[data-res]").forEach((pill) => pill.addEventListener("click", (event) => {
      event.stopPropagation();
      const lecture = sorted.find((item) => String(item._id) === pill.dataset.res);
      if (lecture) openResources(resourceMap.get(String(lecture._id)) || [], lectureTitle(lecture));
    }));
  };

  const paintNotes = (query) => {
    const shown = notes.filter((note) => String(note.title || note.name || "").toLowerCase().includes(query));
    if (!shown.length) { body.innerHTML = stState("empty", query ? "No notes match your search" : "No notes available", query ? "Try a different keyword." : "Notes for this subject haven't been added yet."); return; }
    body.innerHTML = `<div class="st-list">${shown.map((note, index) => {
      const url = noteUrl(note);
      const date = noteDate(note);
      return `<div class="st-lec st-note" style="animation-delay:${Math.min(index, 12) * 40}ms">
        <span class="st-num st-pdf">${ST_ICON.file}</span>
        <div class="st-lec-main"><h3>${escapeHtml(note.title || note.name || "Untitled Note")}</h3>
          <div class="st-lec-meta"><span class="st-dur">PDF</span>${date ? `<span class="st-dur">${ST_ICON.clock}${escapeHtml(date)}</span>` : ""}</div></div>
        ${url ? `<a class="st-btn st-btn-primary st-note-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${ST_ICON.ext}Open / Download PDF</a>` : `<span class="st-dur">Link unavailable</span>`}
      </div>`;
    }).join("")}</div>`;
  };

  const paint = () => {
    const query = search.value.trim().toLowerCase();
    if (tab === "lectures") paintLectures(query); else paintNotes(query);
  };
  tabsEl.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => {
    tab = button.dataset.tab;
    tabsEl.querySelectorAll("[data-tab]").forEach((other) => {
      const on = other === button;
      other.classList.toggle("active", on);
      other.setAttribute("aria-selected", on ? "true" : "false");
    });
    search.value = "";
    setCount();
    paint();
  }));
  search.addEventListener("input", paint);
  setCount();
  paint();
}

/* Player */
async function viewPlayer(batchId, subjectId, lectureId) {
  const token = ++study.token;
  const batch = studyBatch(batchId);
  const host = stFrame(`${stBackBtn("Back to Lectures")}<div id="stBody"><div class="st-skel" style="height:min(52vw,360px)"></div></div>`);
  const body = host.querySelector("#stBody");
  let lectures, notes = [], subjects = null;
  try { [lectures, notes, subjects] = await Promise.all([getLectures(batchId, subjectId), getNotes(batchId, subjectId).catch(() => []), getSubjects(batchId).catch(() => null)]); }
  catch (error) {
    if (token !== study.token) return;
    body.innerHTML = stErrorHtml(error);
    body.querySelector("[data-st-retry]")?.addEventListener("click", () => viewPlayer(batchId, subjectId, lectureId));
    return;
  }
  if (token !== study.token) return;
  const sorted = sortLectures(lectures);
  const index = sorted.findIndex((item) => String(item._id) === String(lectureId));
  if (index < 0) { body.innerHTML = stState("empty", "Lecture not found", "This lecture isn't part of the selected subject."); return; }
  const lecture = sorted[index];
  const subject = subjects && subjects.find((item) => String(item._id) === String(subjectId));
  const resources = linkNotesToLectures([lecture], notes).get(String(lecture._id)) || [];
  const stream = resolveStream(lecture);
  const link = stream.url;
  const prev = sorted[index - 1], next = sorted[index + 1];
  body.innerHTML = `
    <div class="st-player">${link ? '<video id="stVideo" controls playsinline preload="metadata"></video>' : ""}
      <div class="st-vfail" id="stVideoFail" ${link ? "hidden" : ""}><strong>${link ? "This video couldn't be played" : "No video available"}</strong>
        <span>${link ? "Your browser may not support this video format." : "This lecture has no playable video link."}</span>
        <div class="st-vfail-actions">${link ? `<a class="st-btn st-btn-primary" href="${escapeHtml(stream.original || link)}" target="_blank" rel="noopener noreferrer">${ST_ICON.ext}Open video link</a><button class="st-btn" type="button" id="stRetryVideo">Retry</button>` : ""}</div></div></div>
    ${stream.isFallback ? '<p class="st-fallback-note" role="status">This lecture has no stream link from Vidyakul yet — playing a placeholder video.</p>' : ""}
    <h3 class="st-ptitle">${escapeHtml(lectureTitle(lecture))}</h3>
    <p class="st-pmeta"><span id="stBatchName">${escapeHtml(batch.name)}</span> • ${escapeHtml(subject ? subjectTitle(subject) : "Subject")}${lecture.duration ? ` • ${escapeHtml(String(lecture.duration))}` : ""}</p>
    <div class="st-ctrls">
      <button class="st-btn" type="button" id="stPrev" ${prev ? "" : "disabled"}>${ST_ICON.prev}Previous</button>
      <button class="st-btn st-btn-primary" type="button" id="stNext" ${next ? "" : "disabled"}>Next${ST_ICON.next}</button>
      ${resources.map((res, i) => `<a class="st-btn st-btn-res" href="${escapeHtml(res.url)}" target="_blank" rel="noopener noreferrer">${ST_ICON.file}${escapeHtml(res.label)}${resources.length > 1 && !res.label ? ` ${i + 1}` : ""}</a>`).join("")}
    </div>
    ${link ? `<div class="st-speed" role="group" aria-label="Playback speed"><span>Speed</span>${[0.75, 1, 1.25, 1.5, 2].map((s) => `<button class="st-chip${s === study.speed ? " active" : ""}" type="button" data-speed="${s}">${s}x</button>`).join("")}</div>` : ""}`;
  const go = (target) => studyGo("player", { batch: batchId, subject: subjectId, lecture: target._id }, true);
  body.querySelector("#stPrev")?.addEventListener("click", () => prev && go(prev));
  body.querySelector("#stNext")?.addEventListener("click", () => next && go(next));
  const video = body.querySelector("#stVideo");
  if (!video) return;
  const fail = body.querySelector("#stVideoFail");
  const load = () => { fail.hidden = true; video.src = link; video.playbackRate = study.speed; const attempt = video.play(); if (attempt && attempt.catch) attempt.catch(() => {}); };
  video.addEventListener("error", () => { fail.hidden = false; });
  video.addEventListener("loadedmetadata", () => { video.playbackRate = study.speed; });
  body.querySelector("#stRetryVideo")?.addEventListener("click", load);
  body.querySelectorAll("[data-speed]").forEach((chip) => chip.addEventListener("click", () => {
    study.speed = Number(chip.dataset.speed);
    video.playbackRate = study.speed;
    body.querySelectorAll("[data-speed]").forEach((other) => other.classList.toggle("active", other === chip));
  }));
  load();
}

function setupStudy() {
  window.addEventListener("popstate", routeStudy);
  document.addEventListener("click", (event) => {
    if (!document.body.classList.contains("study-open")) return;
    const target = event.target.closest('a[href="#home"], a[href="#courses"], #cxBnav button[data-n="home"]');
    if (!target) return;
    event.preventDefault();
    exitStudy();
  });
  if (studyParams().view) { window.history.replaceState({ cx: 1, depth: 0 }, "", window.location.href); routeStudy(); }
}

function pruneRecentlyViewed() {
  if (!allBatches.length) return;
  const ids = new Set(allBatches.map((batch) => batch._id));
  const recent = getRecentlyViewed();
  const kept = recent.filter((item) => ids.has(item._id));
  if (kept.length !== recent.length) {
    try { localStorage.setItem("codex-studys-recent", JSON.stringify(kept)); } catch (e) {}
    renderRecentlyWatched();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setupDetailModal();
  setupScrollProgress();
  setupShortcuts();
  setupNavigation();
  setupModals();
  setupFilters();
  setupLoadMore();
  setupViewToggle();
  setupThemePicker();
  setupPreferences();
  setupFxEngine();
  setupNetworkStatus();
  setupAnnouncements();
  setupHeaderActions();
  setupTelegramPopup();
  setupInstallPrompt();
  setupQuickInstall();
  setupRecentlyWatched();
  setupBackToTop();
  setupOfflineBanner();
  registerServiceWorker();
  setupStudy();
  loadBatches();
});


/* Disable page zoom (pinch, double-tap, ctrl+wheel, ctrl +/-) */
(() => {
  ["gesturestart", "gesturechange", "gestureend"].forEach((t) =>
    document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener("touchmove", (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  let lastTouch = 0;
  document.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTouch < 300) e.preventDefault();
    lastTouch = now;
  }, { passive: false });
  document.addEventListener("wheel", (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && ["+", "=", "-", "_", "0"].includes(e.key)) e.preventDefault();
  });
})();
