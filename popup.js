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
    fuexam: ["hideDonate", "Ẩn Donate", "Ẩn banner Donate trên FuExam"],
    fuoverflow: ["hideCommunity", "Ẩn popup", "Ẩn popup cộng đồng trên FuOverflow"]
  };
  let prefs = {};

  const siteSwitch = (id) => {
    if (!SWITCHES[id]) return null;
    const [key, text, hint] = SWITCHES[id];
    const label = el("label", "pp-switch");
    label.title = hint;
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
    Object.entries(FuoCore.SITES).forEach(([id, meta]) => {
      const counts = FuoCore.countSite(sites[id]);
      const row = el("div", "pp-site");
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
      row.append(el("span", "pp-site__name", meta.name), stats, siteSwitch(id) || el("span", "pp-site__host", meta.host));
      wrap.append(row);
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

  const ttSync = (focus, full) => chrome.runtime.sendMessage({ action: "fapSync", focus, full }).catch(() => {});

  // Weeks are stored under their Monday as yyyy-mm-dd, the same key background.js writes.
  const ttKey = (date) => {
    const p = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  };
  const ttThisWeek = () => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return ttKey(d);
  };
  const ttWeekLabel = (key) => {
    const [y, m, d] = key.split("-").map(Number);
    const end = new Date(y, m - 1, d + 6);
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d)}/${p(m)} – ${p(end.getDate())}/${p(end.getMonth() + 1)}`;
  };
  let ttView = ""; // week on screen
  let ttKeys = []; // every cached week plus the current one, oldest first

  const ttClock = (ms) => {
    const at = new Date(ms);
    const p = (n) => String(n).padStart(2, "0");
    const day = at.toDateString() === new Date().toDateString() ? "" : `${p(at.getDate())}/${p(at.getMonth() + 1)} `;
    return `${day}${p(at.getHours())}:${p(at.getMinutes())}`;
  };

  const ttAgo = (ms) => {
    const min = Math.floor((Date.now() - ms) / 60000);
    if (min < 1) return "vừa xong";
    if (min < 60) return `${min} phút trước`;
    if (min < 24 * 60) return `${Math.floor(min / 60)} giờ trước`;
    return `${Math.floor(min / 1440)} ngày trước`;
  };

  // One line that always says how fresh the table is and what the sync is doing.
  const ttStatus = (data, sync) => {
    const at = data?.fetchedAt;
    if (sync?.state === "attention") return ["warn", "Chờ đăng nhập FAP", "Đăng nhập ở tab FAP vừa mở, lịch sẽ tự cập nhật"];
    if (sync) return ["busy", `Đang đồng bộ… ${sync.count || 0} tuần`, ""];
    if (!at) return ["warn", "Chưa có lịch", ""];
    return [Date.now() - at > TT_STALE_MS ? "warn" : "ok", `Cập nhật ${ttAgo(at)}`, `Cập nhật lúc ${ttClock(at)} · đã lưu ${Object.keys(data.weeks).length} tuần`];
  };

  const ttCell = (item, rowTime) => {
    const [code, group] = item.title.split(" - ");
    const cell = el("div", `pp-tt__cell${item.attended ? ` is-${item.attended}` : ""}`);
    cell.title = [item.title, item.time, item.room, item.teacher, item.online && "Online", item.attendance].filter(Boolean).join("\n");
    cell.append(el("strong", "", code));
    if (group) cell.append(el("span", "", group));
    if (item.time && item.time !== rowTime) cell.append(el("span", "pp-tt__time", item.time));
    // FAP prints "-" for a room or lecturer it does not have (exam weeks).
    for (const value of [item.room, item.teacher]) if (value && value !== "-") cell.append(el("span", "", value));
    if (item.online) {
      // The link comes from the FAP page, so only ever follow https.
      const meet = item.meet.startsWith("https://") ? el("a", "pp-tt__tag", "Online") : el("span", "pp-tt__tag", "Online");
      if (meet.tagName === "A") Object.assign(meet, { href: item.meet, target: "_blank", rel: "noopener" });
      cell.append(meet);
    }
    return cell;
  };

  const ttTable = (data, today) => {
    const tone = (i) => (i === today ? "is-today" : today >= 0 && i < today ? "is-past" : "");
    // Weekend columns are dropped when empty so the weekday columns get the room.
    const cols = data.days.map((_, i) => i).filter((i) => i < 5 || i === today || data.items.some((item) => item.day === i));
    const head = el("tr");
    head.append(el("th"));
    for (const i of cols) {
      const [, name, date] = /^(.*?)\s*\((.*)\)\s*$/.exec(data.days[i]) || [null, data.days[i], ""];
      const th = el("th", tone(i));
      th.scope = "col";
      th.append(el("span", "pp-tt__dayname", i === today ? "Hôm nay" : name), el("span", "pp-tt__date", date));
      head.append(th);
    }
    const thead = el("thead");
    thead.append(head);
    const tbody = el("tbody");
    for (const slot of new Set(data.items.map((item) => item.slot))) {
      const inSlot = data.items.filter((item) => item.slot === slot);
      const rowTime = inSlot[0].time;
      const row = el("tr");
      const th = el("th");
      th.scope = "row";
      th.append(el("span", "pp-tt__slot", `Slot ${slot}`), ...rowTime.split("-").map((t) => el("span", "pp-tt__time", t.trim())));
      row.append(th);
      for (const i of cols) {
        const td = el("td", tone(i));
        td.append(...inSlot.filter((item) => item.day === i).map((item) => ttCell(item, rowTime)));
        row.append(td);
      }
      tbody.append(row);
    }
    const table = el("table", "pp-tt__table");
    table.append(thead, tbody);
    return table;
  };

  const renderTimetable = async () => {
    const [granted, local, session] = await Promise.all([
      chrome.permissions.contains(FAP),
      chrome.storage.local.get(["fapTimetable", "prefs"]),
      chrome.storage.session.get("fapSync")
    ]);
    const enabled = granted && !!local.prefs?.timetable;
    const data = local.fapTimetable?.weeks ? local.fapTimetable : null; // an older single-week cache is refetched
    const sync = session.fapSync;
    const thisWeek = ttThisWeek();
    ttKeys = [...new Set([...Object.keys(data?.weeks || {}), thisWeek])].sort();
    if (!ttKeys.includes(ttView)) ttView = thisWeek;
    const week = data?.weeks[ttView];
    const today = ttView === thisWeek ? (new Date().getDay() + 6) % 7 : -1;
    const body = $("ttBody");
    const status = $("ttStatus");
    body.replaceChildren();
    $("ttRefresh").hidden = status.hidden = $("ttNav").hidden = !enabled;
    $("ttRefresh").classList.toggle("is-busy", !!sync);
    $("ttPrev").disabled = ttView === ttKeys[0];
    $("ttNext").disabled = ttView === ttKeys[ttKeys.length - 1];
    $("ttWeek").textContent = ttWeekLabel(ttView);
    $("ttWeek").classList.toggle("is-current", ttView === thisWeek);

    if (!enabled) {
      body.append(el("p", "pp-tt__note", "Xem lịch học FAP ngay tại đây."));
      const btn = el("button", "pp-btn pp-btn--primary pp-tt__enable");
      btn.type = "button";
      btn.id = "ttEnable";
      btn.append(el("span", "", "Bật thời khóa biểu"));
      btn.addEventListener("click", enableTimetable);
      body.append(btn);
      return;
    }

    if (!ttAsked && !sync && (!data?.weeks[thisWeek] || Date.now() - data.fetchedAt > TT_STALE_MS)) {
      ttAsked = true;
      // Past weeks only change in attendance, so they are walked once, then on manual refresh.
      ttSync(false, !ttKeys.some((key) => key < thisWeek));
    }

    const [tone, text, hint] = ttStatus(data, sync);
    status.className = `pp-tt__status is-${tone}`;
    status.textContent = text;
    status.title = hint;
    if (!week) return body.append(el("p", "pp-tt__note", sync ? "Đang lấy lịch…" : "Chưa có lịch tuần này."));
    body.append(week.items.length ? ttTable(week, today) : el("p", "pp-tt__note", "Không có lớp."));
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

  $("ttRefresh").addEventListener("click", () => ttSync(true, true));
  const ttStep = (by) => {
    ttView = by ? ttKeys[ttKeys.indexOf(ttView) + by] || ttView : ttThisWeek();
    renderTimetable();
  };
  $("ttPrev").addEventListener("click", () => ttStep(-1));
  $("ttNext").addEventListener("click", () => ttStep(1));
  $("ttWeek").addEventListener("click", () => ttStep(0));
  setInterval(() => renderTimetable(), 60000); // keeps "N phút trước" honest while the popup stays open
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
