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

  // Apply to the cache right away (instant UI), then persist with read-merge-write.
  const write = (mutate) => {
    mutate(cache, Date.now());
    decorate();
    if (!alive()) return Promise.resolve();
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
      ? `<span class="fuo-badge__text">✓ ${labelText}</span>`
      : `<span class="fuo-badge__dot"></span>
        <span class="fuo-badge__text">${labelText}</span>
        <button type="button" class="fuo-badge__remove" title="Xoá trạng thái đang học">×</button>`;

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
      items[0].parentElement.parentElement.insertBefore(bar, items[0].parentElement);
    }
    const { done: totalDone, studying: totalLearning } = FuoCore.countSite(cache);
    const doneOnPage = document.querySelectorAll(".structItem--thread.fuo-done").length;
    const learningOnPage = document.querySelectorAll(".structItem--thread.fuo-learning").length;

    let text = "";
    if (totalLearning > 0 || learningOnPage > 0) {
      text = `Đã ôn: ${totalDone} đề · Đang học: ${totalLearning} đề (trang này: ${doneOnPage} đã ôn, ${learningOnPage} đang học / ${items.length} đề)`;
    } else {
      text = `Đã ôn: ${totalDone} đề tổng cộng (trang này: ${doneOnPage}/${items.length})`;
    }

    // Skip no-op writes, otherwise the MutationObserver would loop forever.
    if (bar.textContent !== text) bar.textContent = text;
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

    markStudying(id);

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

  const decorate = () => {
    decorateThreadList();
    decorateThreadPage();
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

  // Lightbox reports every slide change; batch them so chrome.storage.sync's write quota holds.
  const progressTimers = {};
  const setProgress = (id, current, total) => {
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
