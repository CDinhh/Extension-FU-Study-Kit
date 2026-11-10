(() => {
  const $ = (id) => document.getElementById(id);
  const ALL_URLS = { origins: ["<all_urls>"] };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  let msgTimer = null;
  const say = (text, kind = "ok") => {
    const msg = $("msg");
    clearTimeout(msgTimer);
    msg.textContent = text;
    msg.className = `pp-msg is-${kind}`;
    msg.hidden = false;
    msgTimer = setTimeout(() => (msg.hidden = true), 6000);
  };

  // One clean-up switch per forum; content.js applies it live.
  const SWITCHES = {
    fuexam: ["hideDonate", "Ẩn banner Donate"],
    fuoverflow: ["hideCommunity", "Ẩn popup cộng đồng"]
  };
  let prefs = {};

  const siteSwitch = (id) => {
    if (!SWITCHES[id]) return null;
    const [key, text] = SWITCHES[id];
    const label = el("label", "pp-switch");
    const box = el("input");
    box.type = "checkbox";
    box.setAttribute("role", "switch");
    box.checked = !!prefs[key];
    box.addEventListener("change", async () => {
      prefs = { ...prefs, [key]: box.checked };
      await chrome.storage.local.set({ prefs });
    });
    label.append(el("span", "pp-switch__text", text), box);
    return label;
  };

  const renderSites = async () => {
    prefs = (await chrome.storage.local.get("prefs")).prefs || {};
    const sites = await FuoStorage.loadAllSites();
    const wrap = $("sites");
    wrap.replaceChildren();
    Object.entries(FuoCore.SITES).forEach(([id, meta], i) => {
      const counts = FuoCore.countSite(sites[id]);
      const card = el("article", "pp-card pp-site");
      card.style.setProperty("--i", i);
      const core = el("div", "pp-card__core");
      const head = el("div", "pp-site__head");
      head.append(el("span", "pp-site__name", meta.name), siteSwitch(id) || el("span", "pp-site__host", meta.host));
      const stats = el("dl", "pp-stats");
      for (const [cls, label, n] of [
        ["is-done", "Đã ôn", counts.done],
        ["is-study", "Đang học", counts.studying],
        ["is-flag", "Câu gắn cờ", counts.flagged]
      ]) {
        const cell = el("div", cls);
        cell.append(el("dd", "", String(n)), el("dt", "", label));
        stats.append(cell);
      }
      core.append(head, stats);
      card.append(core);
      wrap.append(card);
    });
  };

  const renderSyncError = async () => {
    const err = await FuoStorage.getSyncError();
    const box = $("syncError");
    box.hidden = !err;
    if (err) box.textContent = `Chrome Sync đang lỗi (${err}). Dữ liệu vẫn lưu trên máy này; dùng Xuất/Nhập file để chuyển máy.`;
  };

  const renderPermission = async () => {
    $("perm").hidden = await chrome.permissions.contains(ALL_URLS);
  };

  // --- FAP timetable: background.js reads it from a FAP tab; here we only render the cache. ---
  const FAP = { origins: ["https://fap.fpt.edu.vn/*"] };
  const TT_STALE_MS = 60 * 60 * 1000;
  let ttAsked = false;

  const ttSync = (focus) => chrome.runtime.sendMessage({ action: "fapSync", focus }).catch(() => {});

  // Monday-first index of today, or -1 when the cached week is not the current one.
  const ttTodayIndex = (days) => {
    const now = new Date();
    const i = (now.getDay() + 6) % 7;
    const m = /(\d{1,2})\/(\d{1,2})/.exec(days[i] || "");
    return m && +m[1] === now.getDate() && +m[2] === now.getMonth() + 1 ? i : -1;
  };

  const ttItem = (item) => {
    const row = el("li", "pp-tt__item");
    const main = el("div", "pp-tt__main");
    main.append(el("span", "pp-tt__time", item.time || `Slot ${item.slot}`), el("span", "pp-tt__title", item.title));
    if (item.online) {
      // The link comes from the FAP page, so only ever follow https.
      const meet = item.meet.startsWith("https://") ? el("a", "pp-tt__tag is-online", "Online ↗") : el("span", "pp-tt__tag is-online", "Online");
      if (meet.tagName === "A") Object.assign(meet, { href: item.meet, target: "_blank", rel: "noopener" });
      main.append(meet);
    }
    const sub = el("div", "pp-tt__sub", [item.time && `Slot ${item.slot}`, item.room, item.teacher].filter(Boolean).join(" · "));
    if (item.attendance) sub.append(el("span", `pp-tt__att is-${item.attended || "none"}`, item.attendance));
    row.append(main, sub);
    return row;
  };

  const renderTimetable = async () => {
    const [granted, local, session] = await Promise.all([
      chrome.permissions.contains(FAP),
      chrome.storage.local.get(["fapTimetable", "prefs"]),
      chrome.storage.session.get("fapSync")
    ]);
    const enabled = granted && !!local.prefs?.timetable;
    const data = local.fapTimetable;
    const sync = session.fapSync;
    const today = data ? ttTodayIndex(data.days) : -1;
    const body = $("ttBody");
    body.replaceChildren();
    $("ttRefresh").hidden = !enabled;
    $("ttRefresh").classList.toggle("is-busy", !!sync);
    $("ttMeta").textContent = "";

    if (!enabled) {
      body.append(el("p", "pp-tt__note", "Xem lịch học FAP ngay trong popup. Extension chỉ đọc trang thời khóa biểu của bạn và lưu trên máy này."));
      const btn = el("button", "pp-btn pp-btn--primary pp-tt__enable");
      btn.type = "button";
      btn.id = "ttEnable";
      btn.append(el("span", "", "Bật thời khóa biểu"));
      btn.addEventListener("click", enableTimetable);
      body.append(btn);
      return;
    }

    if (!ttAsked && !sync && (!data || today < 0 || Date.now() - data.fetchedAt > TT_STALE_MS)) {
      ttAsked = true;
      ttSync(false);
    }

    if (sync?.state === "attention") body.append(el("p", "pp-tt__note is-warn", "FAP cần bạn đăng nhập ở tab vừa mở. Xong là lịch tự cập nhật."));
    if (!data) {
      if (sync?.state !== "attention") body.append(el("p", "pp-tt__note", "Đang lấy lịch từ FAP…"));
      return;
    }

    const at = new Date(data.fetchedAt);
    const p = (n) => String(n).padStart(2, "0");
    const sameDay = at.toDateString() === new Date().toDateString();
    $("ttMeta").textContent = `Cập nhật ${sameDay ? "" : `${p(at.getDate())}/${p(at.getMonth() + 1)} `}${p(at.getHours())}:${p(at.getMinutes())}`;

    if (!data.items.length) return body.append(el("p", "pp-tt__note", "Tuần này không có lớp."));
    data.days.forEach((label, i) => {
      const items = data.items.filter((item) => item.day === i);
      if (!items.length && i !== today) return;
      const day = el("section", `pp-tt__day${i === today ? " is-today" : ""}${today >= 0 && i < today ? " is-past" : ""}`);
      day.append(el("h3", "pp-tt__dayname", i === today ? `Hôm nay · ${label}` : label));
      if (!items.length) day.append(el("p", "pp-tt__note", "Không có lớp."));
      const list = el("ul", "pp-tt__list");
      list.append(...items.map(ttItem));
      day.append(list);
      body.append(day);
    });
    // Open on today; earlier days stay one scroll up.
    const todayEl = body.querySelector(".is-today");
    if (todayEl) body.scrollTop = todayEl.offsetTop;
  };

  async function enableTimetable() {
    // Save the opt-in first: the permission prompt can close the popup before it resolves.
    prefs = { ...prefs, timetable: true };
    await chrome.storage.local.set({ prefs });
    try {
      await chrome.permissions.request(FAP);
    } catch (err) {
      say(`Không xin được quyền: ${err.message}`, "err");
    }
    renderTimetable();
  }

  $("ttRefresh").addEventListener("click", () => ttSync(true));
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.fapTimetable || changes.fapSync) renderTimetable();
  });

  const localDate = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  $("export").addEventListener("click", async () => {
    const data = FuoCore.buildExport(await FuoStorage.loadAllSites(), Date.now());
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
    const a = el("a");
    a.href = url;
    a.download = `fu-exam-checklist-${localDate()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    say("Đã xuất file. Mở popup ở máy khác và bấm Nhập dữ liệu.");
  });

  const confirmImport = (counts) =>
    new Promise((resolve) => {
      const list = $("modalList");
      list.replaceChildren();
      for (const [id, { added, updated }] of Object.entries(counts)) {
        const li = el("li");
        li.append(
          el("span", "pp-modal__site", FuoCore.SITES[id].name),
          el("span", "pp-modal__count is-add", `+${added} mới`),
          el("span", "pp-modal__count is-upd", `~${updated} cập nhật`)
        );
        list.append(li);
      }
      const modal = $("modal");
      modal.hidden = false;
      requestAnimationFrame(() => modal.classList.add("is-open"));
      const done = (value) => {
        modal.classList.remove("is-open");
        setTimeout(() => (modal.hidden = true), 220);
        $("modalOk").onclick = $("modalCancel").onclick = modal.onclick = document.onkeydown = null;
        resolve(value);
      };
      $("modalOk").onclick = () => done(true);
      $("modalCancel").onclick = () => done(false);
      modal.onclick = (e) => e.target === modal && done(false);
      document.onkeydown = (e) => e.key === "Escape" && done(false);
      $("modalOk").focus();
    });

  $("import").addEventListener("click", () => $("file").click());

  $("file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > FuoCore.MAX_IMPORT_CHARS) return say("File không hợp lệ: file quá lớn (tối đa 1 MB).", "err");
    let obj;
    try {
      obj = JSON.parse(await file.text());
    } catch {
      return say("File không hợp lệ: không phải JSON.", "err");
    }
    const preview = await FuoStorage.previewImport(obj);
    if (!preview.ok) return say(preview.error, "err");
    const total = Object.values(preview.counts).reduce((n, c) => n + c.added + c.updated, 0);
    if (!total) return say("File này không có gì mới, dữ liệu đã giống nhau.");
    if (!(await confirmImport(preview.counts))) return;
    const result = await FuoStorage.applyImport(obj);
    if (!result.ok) return say(result.error, "err");
    await renderSites();
    say("Đã nhập xong. Mở lại trang đề để thấy thay đổi.");
  });

  $("grant").addEventListener("click", async () => {
    try {
      const granted = await chrome.permissions.request(ALL_URLS);
      if (granted) say("Đã cho phép chụp màn hình. Quay lại tab đề và bấm chụp.");
    } catch (err) {
      say(`Không xin được quyền: ${err.message}`, "err");
    }
    renderPermission();
  });

  // The permission prompt can outlive (or close) the popup, so react to the grant itself.
  chrome.permissions.onAdded.addListener(() => (renderPermission(), renderTimetable()));
  chrome.permissions.onRemoved.addListener(() => (renderPermission(), renderTimetable()));
  FuoStorage.onSiteChanged(() => renderSites());
  renderSites().then(renderTimetable);
  renderSyncError();
  renderPermission();
})();
