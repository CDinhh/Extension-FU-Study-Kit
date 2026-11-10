(() => {
  const siteId = FuoCore.siteFromHost(location.hostname);
  if (!siteId) return;

  // In-memory copy of this site's data; every render reads from here.
  let cache = FuoCore.emptySite();

  const alive = () => typeof chrome !== "undefined" && !!chrome.runtime?.id;

  const extractThreadId = (url) => {
    if (!url) return null;
    const match = url.match(/\/threads\/(?:[^\/]*?\.)?(\d+)/) || url.match(/\.(\d+)\/?/);
    return match ? match[1] : null;
  };

  const threadId = (item) => {
    const link =
      item.querySelector('.structItem-title a[href*="/threads/"]:not(.labelLink)') ||
      item.querySelector('.structItem-title a[href*="/threads/"]');
    return link ? extractThreadId(link.getAttribute("href") || "") : null;
  };

  // After an extension update this tab's script is orphaned and cannot save: say so instead
  // of pretending the change stuck.
  const showStaleNotice = () => {
    if (document.querySelector(".fuo-notice")) return;
    const notice = document.createElement("div");
    notice.className = "fuo-notice";
    notice.setAttribute("role", "alert");
    notice.textContent = "Extension vừa được cập nhật nên thay đổi chưa được lưu. Nhấn F5 để tải lại trang.";
    document.body.append(notice);
  };

  // Apply to the cache right away (instant UI), then persist with read-merge-write.
  const write = (mutate) => {
    if (!alive()) {
      showStaleNotice();
      decorate(); // puts checkboxes/badges back to the saved state
      return Promise.resolve(false);
    }
    mutate(cache, Date.now());
    decorate();
    return FuoStorage.updateSite(siteId, mutate).then(
      (site) => {
        cache = site;
        decorate();
      },
      (err) => console.warn("[fuo] save failed:", err)
    );
  };

  const setDone = (id, done) => write((d, now) => (d.checklist[id] = { done, at: now }));

  const markStudying = (id) => {
    const p = cache.progress[id];
    if (!id || (p && !p.removed)) return;
    write((d, now) => (d.progress[id] = { current: null, total: null, at: now }));
  };

  // Opening a thread page marks it once per page view, so a later × (here, in another tab
  // or on another device) is not undone by the next re-render.
  let pageMarked = false;

  const removeStudying = (id) =>
    write((d, now) => (d.progress[id] = { current: null, total: null, removed: true, at: now }));

  const studyLabel = (id) => {
    const p = cache.progress[id];
    if (p?.current && p?.total) return `Đang học tới câu ${p.current}/${p.total}`;
    if (p?.current) return `Đang học tới câu ${p.current}`;
    return "Đang học";
  };

  const openThread = (title) => {
    const link =
      title.querySelector('a[href*="/threads/"]:not(.labelLink)') || title.querySelector('a[href*="/threads/"]');
    if (link) link.click();
  };

  // Shared by list rows and the thread page title. Skips no-op rewrites so the
  // MutationObserver does not loop.
  const renderBadge = (title, id, clickable) => {
    let badge = title.querySelector(".fuo-badge");
    const done = FuoCore.isDone(cache, id);
    const studying = FuoCore.isStudying(cache, id);

    if (!done && !studying) {
      if (badge) badge.remove();
      return;
    }
    const labelText = done ? "Đã ôn xong" : studyLabel(id);
    if (badge && badge.dataset.fuoText === labelText && badge.dataset.fuoDone === String(done)) return;
    if (!badge) {
      badge = document.createElement("span");
      title.appendChild(badge);
    }
    badge.className = `fuo-badge ${done ? "fuo-badge--done" : "fuo-badge--learning"}`;
    badge.dataset.fuoText = labelText;
    badge.dataset.fuoDone = String(done);
    badge.title = done ? "Đã ôn xong đề này" : `${labelText} (Bấm × để xoá trạng thái)`;
    badge.innerHTML = done
      ? `<svg class="fuo-badge__ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>
        <span class="fuo-badge__text">${labelText}</span>`
      : `<span class="fuo-badge__dot"></span>
        <span class="fuo-badge__text">${labelText}</span>
        <button type="button" class="fuo-badge__remove" title="Xoá trạng thái đang học" aria-label="Xoá trạng thái đang học"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg></button>`;

    badge.onclick = (e) => {
      if (e.target.closest(".fuo-badge__remove")) {
        e.stopPropagation();
        e.preventDefault();
        removeStudying(id);
      } else if (clickable) {
        openThread(title);
      }
    };
  };

  const renderItemStatus = (item, id) => {
    const done = FuoCore.isDone(cache, id);
    item.classList.toggle("fuo-done", done);
    item.classList.toggle("fuo-learning", FuoCore.isStudying(cache, id));
    const box = item.querySelector(".fuo-check");
    if (box && box.checked !== done) box.checked = done;
    const title = item.querySelector(".structItem-title");
    if (title) renderBadge(title, id, true);
  };

  const updateProgress = () => {
    const items = document.querySelectorAll(".structItem--thread[data-fuo-id]");
    let bar = document.querySelector(".fuo-progress");
    if (!items.length) return bar && bar.remove();

    if (!bar) {
      bar = document.createElement("div");
      bar.className = "fuo-progress";
      bar.innerHTML = `<div class="fuo-progress__row"><span class="fuo-progress__total"></span><span class="fuo-progress__page"></span></div>
        <div class="fuo-progress__track"><i class="fuo-progress__fill fuo-progress__fill--learn"></i><i class="fuo-progress__fill fuo-progress__fill--done"></i></div>`;
      items[0].parentElement.parentElement.insertBefore(bar, items[0].parentElement);
    }
    const { done: totalDone, studying: totalLearning } = FuoCore.countSite(cache);
    const doneOnPage = document.querySelectorAll(".structItem--thread.fuo-done").length;
    const learningOnPage = document.querySelectorAll(".structItem--thread.fuo-learning").length;

    const total = `Đã ôn ${totalDone} đề` + (totalLearning ? ` · Đang học ${totalLearning}` : "");
    const page = `Trang này ${doneOnPage}/${items.length}` + (learningOnPage ? ` · ${learningOnPage} đang học` : "");

    // Skip no-op writes, otherwise the MutationObserver would loop forever.
    const key = `${total}|${page}`;
    if (bar.dataset.fuoKey === key) return;
    bar.dataset.fuoKey = key;
    bar.querySelector(".fuo-progress__total").textContent = total;
    bar.querySelector(".fuo-progress__page").textContent = page;
    // Next frame, so a freshly inserted bar animates its fill from empty.
    requestAnimationFrame(() => {
      bar.querySelector(".fuo-progress__fill--done").style.transform = `scaleX(${doneOnPage / items.length})`;
      bar.querySelector(".fuo-progress__fill--learn").style.transform =
        `scaleX(${(doneOnPage + learningOnPage) / items.length})`;
    });
  };

  const makeCheckbox = (id) => {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "fuo-check";
    box.title = "Đã ôn xong đề này";
    box.checked = FuoCore.isDone(cache, id);
    box.addEventListener("click", (e) => e.stopPropagation());
    box.addEventListener("change", () => setDone(id, box.checked));
    return box;
  };

  const decorateThreadList = () => {
    document.querySelectorAll(".structItem--thread:not([data-fuo-id])").forEach((item) => {
      const id = threadId(item);
      const title = item.querySelector(".structItem-title");
      if (!id || !title) return;

      item.dataset.fuoId = id;
      title.prepend(makeCheckbox(id));

      // Opening a thread from the list marks it as studying.
      item.querySelectorAll('a[href*="/threads/"]').forEach((a) => {
        a.addEventListener("click", () => markStudying(id));
        a.addEventListener("auxclick", () => markStudying(id));
      });
    });

    document.querySelectorAll(".structItem--thread[data-fuo-id]").forEach((item) => {
      renderItemStatus(item, item.dataset.fuoId);
    });

    updateProgress();
  };

  const decorateThreadPage = () => {
    if (!location.pathname.includes("/threads/")) return;
    const id = extractThreadId(location.pathname);
    if (!id) return;

    if (!pageMarked) {
      pageMarked = true;
      markStudying(id);
    }

    const titleEl = document.querySelector(".p-title-value");
    if (!titleEl) return;

    let box = titleEl.querySelector(".fuo-check");
    if (!box) {
      box = makeCheckbox(id);
      titleEl.prepend(box);
    }
    const done = FuoCore.isDone(cache, id);
    if (box.checked !== done) box.checked = done;
    renderBadge(titleEl, id, false);
  };

  // --- Optional page clean-up, switched from the popup (chrome.storage.local "prefs") ---
  // hideDonate: FuExam's floating donate banner. hideCommunity: FuOverflow's pop-ups (see POPUPS).
  let hideCommunity = false;
  const watchedPopups = new Set();

  // [element id, class it gets while shown, its close button]. Each one locks page scrolling while
  // open, so we press the site's own close button and let its cleanup run.
  const POPUPS = [
    ["fuoFbVerifyOverlay", "fuo-fbv--show", "fuoFbvClose"], // "join the community" (Facebook verify)
    ["fuoPromoPopup", "is-active", "fuoPromoClose"] // "Công cụ hỗ trợ học tập" promo
  ];

  const closeCommunity = () => {
    if (!hideCommunity) return;
    for (const [id, shown, close] of POPUPS) {
      if (document.getElementById(id)?.classList.contains(shown)) document.getElementById(close)?.click();
    }
  };

  // The pop-ups sit in the DOM from the start and are shown later by class/style changes.
  const watchCommunity = () => {
    for (const [id] of POPUPS) {
      const popup = document.getElementById(id);
      if (!popup || watchedPopups.has(popup)) continue;
      watchedPopups.add(popup);
      new MutationObserver(closeCommunity).observe(popup, { attributes: true, attributeFilter: ["class", "style"] });
    }
    closeCommunity();
  };

  const applyPrefs = (prefs = {}) => {
    document.documentElement.classList.toggle("fuo-hide-donate", !!prefs.hideDonate);
    document.documentElement.classList.toggle("fuo-hide-community", !!prefs.hideCommunity);
    hideCommunity = !!prefs.hideCommunity;
    closeCommunity();
  };

  chrome.storage.local.get("prefs").then((r) => applyPrefs(r.prefs), () => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.prefs) applyPrefs(changes.prefs.newValue);
  });

  // --- Titles and subjects of studied threads, for the popup's list. Local only, not exported. ---
  // shortcut: entries are never pruned (~100 bytes each), add pruning if someone studies thousands of threads.
  const metaKey = `threads:${siteId}`;
  const clean = (node) => (node ? node.textContent.replace(/\s+/g, " ").trim().slice(0, 200) : "");
  const studied = (id) => FuoCore.isDone(cache, id) || FuoCore.isStudying(cache, id) || FuoCore.flagSet(cache, id).size > 0;
  let metaSent = "";
  let metaTimer = null;

  const collectMeta = () => {
    const found = {};
    const path = location.pathname;
    if (path.includes("/threads/")) {
      const id = extractThreadId(path);
      const titleEl = document.querySelector(".p-title-value");
      // The last forum crumb is the subject. FuExam repeats the crumbs at the bottom, so read the first trail.
      const crumb = [...(document.querySelector(".p-breadcrumbs")?.querySelectorAll('a[href*="/forums/"]') || [])].pop();
      if (id && titleEl) {
        const copy = titleEl.cloneNode(true);
        copy.querySelectorAll(".fuo-badge, .fuo-check, .label, .labelLink").forEach((n) => n.remove());
        found[id] = { title: clean(copy), subject: clean(crumb), subjectUrl: crumb?.href || "" };
      }
    } else if (path.startsWith("/forums/")) {
      // On a forum page the forum is the subject. Row prefix links are not (FuExam points them at the forum too).
      const subject = clean(document.querySelector(".p-title-value"));
      const subjectUrl = location.origin + path.replace(/page-\d+\/?$/, "");
      document.querySelectorAll(".structItem--thread[data-fuo-id]").forEach((item) => {
        const id = item.dataset.fuoId;
        const link = item.querySelector('.structItem-title a[href*="/threads/"]:not(.labelLink)');
        if (studied(id) && link) found[id] = { title: clean(link), subject, subjectUrl };
      });
    }
    return found;
  };

  const saveMeta = async () => {
    const found = collectMeta();
    const sig = JSON.stringify(found);
    if (sig === "{}" || sig === metaSent || !alive()) return;
    metaSent = sig;
    const all = (await chrome.storage.local.get(metaKey))[metaKey] || {};
    let changed = false;
    for (const [id, entry] of Object.entries(found)) {
      const next = { ...all[id] };
      for (const [k, v] of Object.entries(entry)) if (v) next[k] = v;
      if (FuoCore.sameData(next, all[id] || {})) continue;
      all[id] = next;
      changed = true;
    }
    if (changed) await chrome.storage.local.set({ [metaKey]: all });
  };

  const decorate = () => {
    decorateThreadList();
    decorateThreadPage();
    watchCommunity();
    clearTimeout(metaTimer);
    metaTimer = setTimeout(() => saveMeta().catch(() => {}), 800);
  };

  // --- Bridge for lightbox.js (MAIN world cannot call chrome.*) ---
  const post = (msg) => window.postMessage({ source: "fuo-isolated", ...msg }, location.origin);
  const okId = (v) => typeof v === "string" && /^\d{1,12}$/.test(v);
  const okNum = (v) => Number.isInteger(v) && v >= 0 && v <= 10000;

  const threadState = (id) => {
    const p = cache.progress[id];
    const live = p && !p.removed;
    return {
      current: live ? p.current : null,
      total: live ? p.total : null,
      flags: [...FuoCore.flagSet(cache, id)].sort((a, b) => a - b)
    };
  };

  // Lightbox reports every slide change; batch them so storage is not rewritten on every slide.
  const progressTimers = {};
  const setProgress = (id, current, total) => {
    if (!alive()) return showStaleNotice();
    const apply = (d, now) => (d.progress[id] = { current, total, at: now });
    apply(cache, Date.now());
    decorate();
    clearTimeout(progressTimers[id]);
    progressTimers[id] = setTimeout(() => write(apply), 1000);
  };

  const setFlags = (id, list) => {
    const before = FuoCore.flagSet(cache, id);
    const after = new Set(list);
    return write((d, now) => {
      const qs = (d.flags[id] = d.flags[id] || {});
      for (const q of after) if (!before.has(q)) qs[q] = { on: true, at: now };
      for (const q of before) if (!after.has(q)) qs[q] = { on: false, at: now };
    });
  };

  const loaded = (async () => {
    try {
      await FuoStorage.migrateLegacy(siteId, {
        checklist: localStorage.getItem("fuo-test-checklist"),
        progress: localStorage.getItem("fuo-study-progress"),
        flags: localStorage.getItem("fuo-question-flags")
      });
    } catch (err) {
      console.warn("[fuo] migration failed:", err);
    }
    try {
      cache = await FuoStorage.loadSite(siteId);
    } catch (err) {
      console.warn("[fuo] load failed:", err);
    }
  })();

  const reload = () =>
    FuoStorage.loadSite(siteId).then(
      (site) => {
        cache = site;
        decorate();
        post({ action: "stateChanged" });
      },
      () => {}
    );

  loaded.then(() => {
    decorate();
    // XenForo loads filters/pagination via AJAX, so re-run when the list changes.
    new MutationObserver(decorate).observe(document.body, { childList: true, subtree: true });
    FuoStorage.onSiteChanged((id) => id === siteId && reload());
    window.addEventListener("pageshow", (e) => e.persisted && alive() && reload());
  });

  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.data?.source !== "fuo-main") return;
    const { action, requestId, threadId: id } = event.data;

    if (action === "getThreadState" && okId(id)) {
      await loaded;
      post(
        alive()
          ? { action: "threadState", requestId, state: threadState(id) }
          : { action: "threadState", requestId, error: "Extension context invalidated." }
      );
    } else if (action === "setProgress" && okId(id) && okNum(event.data.current) && okNum(event.data.total)) {
      await loaded;
      setProgress(id, event.data.current, event.data.total);
    } else if (
      action === "setFlags" &&
      okId(id) &&
      Array.isArray(event.data.flags) &&
      event.data.flags.length <= 1000 &&
      event.data.flags.every(okNum)
    ) {
      await loaded;
      if (!alive()) return post({ action: "ack", requestId, error: "Extension context invalidated." });
      await setFlags(id, event.data.flags);
      post({ action: "ack", requestId });
    } else if (action === "captureTab") {
      try {
        if (!alive()) {
          throw new Error("Extension context invalidated.");
        }
        chrome.runtime.sendMessage({ action: "captureTab" }, (response) => {
          const err = chrome.runtime.lastError;
          post({
            action: "captureTabResponse",
            requestId,
            response: err ? { success: false, error: err.message } : response
          });
        });
      } catch (err) {
        post({
          action: "captureTabResponse",
          requestId,
          response: { success: false, error: err?.message || String(err) }
        });
      }
    }
  });
})();
