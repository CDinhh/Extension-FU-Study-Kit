(() => {
  const $ = (id) => document.getElementById(id);
  const ALL_URLS = { origins: ["<all_urls>"] };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // Light / dark: follows the system until the header button picks one. Kept in localStorage so
  // it applies before the first paint (chrome.storage would answer after it).
  const THEME_KEY = "fuo-theme";
  const readTheme = () => {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch {
      return null;
    }
  };
  const applyTheme = (theme) => {
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  };
  applyTheme(readTheme());
  $("theme").addEventListener("click", () => {
    const now = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    const next = now === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private mode or blocked storage: the switch still works for this popup.
    }
  });

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

  const link = (className, text, href) => {
    const a = el("a", className, text);
    Object.assign(a, { href, target: "_blank", rel: "noopener" });
    return a;
  };

  const testState = (t) => {
    if (t.done) return ["is-done", "Đã ôn"];
    if (t.current) return ["", t.total ? `Câu ${t.current}/${t.total}` : `Câu ${t.current}`];
    return ["", t.flags ? "" : "Đang học"];
  };

  // One open subject per forum, kept across re-renders.
  const openSubject = {};
  // Subjects are newest first; past this many, the rest fold into a "+N" chip (a term has ~5 courses).
  const CHIP_LIMIT = 6;
  const showAll = {};

  const subjectPanel = (host, g) => {
    const panel = el("div", "pp-subj");
    const head = el("div", "pp-subj__head");
    head.append(el("span", "pp-subj__name", g.subject));
    // The forum URL was read from the forum's own page; only follow it on that forum.
    if (g.url.startsWith(`https://${host}/`)) head.append(link("pp-subj__open", "Mở môn ↗", g.url));
    const list = el("ul", "pp-subj__list");
    for (const t of g.tests) {
      const full = t.title || `Đề #${t.tid}`;
      // "MLN122 - Q2 - 6" reads as "Q2 - 6" under the MLN122 heading.
      const title = (full.startsWith(g.subject) && full.slice(g.subject.length).replace(/^\s*[-–:]\s*/, "")) || full;
      const [tone, state] = testState(t);
      const a = link("pp-test", "", `https://${host}/threads/${t.tid}/`);
      a.title = full;
      a.append(el("span", "pp-test__title", title));
      if (t.flags) a.append(el("span", "pp-test__flag", `⚑ ${t.flags}`));
      if (state) a.append(el("span", `pp-test__state ${tone}`, state));
      const li = el("li");
      li.append(a);
      list.append(li);
    }
    panel.append(head, list);
    return panel;
  };

  const renderSites = async () => {
    const metaKey = (id) => `threads:${id}`;
    const ids = Object.keys(FuoCore.SITES);
    const [local, sites] = await Promise.all([chrome.storage.local.get(["prefs", ...ids.map(metaKey)]), FuoStorage.loadAllSites()]);
    prefs = local.prefs || {};
    const wrap = $("sites");
    wrap.replaceChildren();
    for (const id of ids) {
      const { name, host } = FuoCore.SITES[id];
      const groups = FuoCore.studiedBySubject(sites[id], local[metaKey(id)]);
      const row = el("div", "pp-site");
      const chips = el("div", "pp-chips");
      const siteLink = link("pp-site__name", name, `https://${host}/`);
      siteLink.title = `Mở ${host}`;
      const folded = !showAll[id] && groups.length > CHIP_LIMIT;
      const shown = folded ? groups.slice(0, CHIP_LIMIT - 1) : groups;
      if (!shown.some((g) => g.subject === openSubject[id])) delete openSubject[id];
      for (const g of shown) {
        const chip = el("button", "pp-chip");
        chip.type = "button";
        chip.setAttribute("aria-expanded", String(g.subject === openSubject[id]));
        chip.title = `${g.tests.length} đề đã ôn`;
        chip.append(el("span", "", g.subject), el("span", "pp-chip__n", String(g.tests.length)));
        chip.addEventListener("click", () => {
          openSubject[id] = openSubject[id] === g.subject ? undefined : g.subject;
          renderSites();
        });
        chips.append(chip);
      }
      if (groups.length > CHIP_LIMIT) {
        const more = el("button", "pp-chip pp-chip--more", folded ? `+${groups.length - shown.length}` : "Thu gọn");
        more.type = "button";
        more.title = folded ? "Xem tất cả môn" : "Chỉ hiện các môn gần đây";
        more.addEventListener("click", () => {
          showAll[id] = folded;
          renderSites();
        });
        chips.append(more);
      }
      if (!groups.length) chips.append(el("span", "pp-site__host", "Chưa ôn đề nào"));
      row.append(siteLink, chips, siteSwitch(id) || el("span"));
      const open = groups.find((g) => g.subject === openSubject[id]);
      if (open) row.append(subjectPanel(host, open));
      wrap.append(row);
    }
  };


  const renderPermission = async () => {
    $("perm").hidden = await chrome.permissions.contains(ALL_URLS);
  };

  // --- FAP timetable: background.js reads it from a FAP tab; here we only render the cache. ---
  const FAP = { origins: ["https://fap.fpt.edu.vn/*"] };
  const TT_STALE_MS = 60 * 60 * 1000;
  let ttAsked = false;
  let ttEnabled = false;

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
    if (sync?.stage === "attendance") return ["busy", `Đang đọc điểm danh… ${sync.att?.courses.length || 0} môn`, ""];
    if (sync) return ["busy", `Đang đồng bộ… ${sync.count || 0} tuần`, ""];
    if (!at) return ["warn", "Chưa có lịch", ""];
    return [Date.now() - at > TT_STALE_MS ? "warn" : "ok", `Cập nhật ${ttAgo(at)}`, `Cập nhật lúc ${ttClock(at)} · đã lưu ${Object.keys(data.weeks).length} tuần`];
  };

  const ttCell = (item, rowTime) => {
    const [code, group] = item.title.split(" - ");
    const exam = /thi|exam/i.test(item.kind || "");
    const cell = el("div", ["pp-tt__cell", item.attended && `is-${item.attended}`, exam && "is-exam"].filter(Boolean).join(" "));
    // Courses near or past the absence limit get a coloured edge, so they show without hovering.
    const att = attByCode[`${code}|${group}`] || attByCode[code];
    const attTone = att && attState(att).tone;
    if (attTone) cell.classList.add(`${attTone}-att`);
    cell.tabIndex = 0;
    cell.addEventListener("mouseenter", () => showTip(cell, item));
    cell.addEventListener("focus", () => showTip(cell, item));
    cell.addEventListener("mouseleave", hideTip);
    cell.addEventListener("blur", hideTip);
    if (item.kind) cell.append(el("span", "pp-tt__kind", exam ? "Lịch thi" : item.kind));
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

  // --- Attendance: FPT bars a course's final exam above 20% absence, so show how much of that
  // allowance each course has used. Read by background.js right after the timetable. ---
  const ATT_LIMIT = 0.2;

  let attByCode = {};

  const attState = (c) => {
    const allowed = Math.floor(c.total * ATT_LIMIT);
    const left = allowed - c.absent;
    // A short course (under 5 sessions) allows no absence at all; that alone is not a warning.
    return { tone: left < 0 ? "is-over" : left === 0 && allowed ? "is-edge" : "" };
  };

  // One floating tooltip for every timetable cell, kept inside the popup.
  const tip = el("div", "pp-tip");
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  document.body.append(tip);

  // A label : value list; rows without a value are skipped.
  const kvList = (rows) => {
    const dl = el("dl", "pp-tip__list");
    for (const [label, value, cls] of rows) {
      if (!value) continue;
      dl.append(el("dt", "", label), el("dd", cls || "", value));
    }
    return dl;
  };

  function showTip(cell, item) {
    const [code, group] = item.title.split(" - ");
    const c = attByCode[`${code}|${group}`] || attByCode[code];
    const real = (v) => (v && v !== "-" ? v : "");
    const session = item.attendance || { yes: "Có mặt", no: "Vắng" }[item.attended];
    // The cell cuts long names, so the tooltip repeats every detail in full.
    tip.replaceChildren(
      el("strong", "pp-tip__name", c?.name || code),
      kvList([
        ["Loại", /thi|exam/i.test(item.kind || "") ? "Lịch thi" : item.kind],
        ["Mã môn", code],
        ["Lớp", group],
        ["Thời gian", item.time],
        ["Phòng", real(item.room)],
        ["Giảng viên", real(item.teacher)],
        ["Hình thức", item.online && "Online"],
        ["Buổi này", session, `is-${item.attended || "none"}`]
      ])
    );
    if (c?.total) {
      const allowed = Math.floor(c.total * ATT_LIMIT);
      const left = allowed - c.absent;
      const tone = attState(c).tone || "is-ok";
      const box = el("div", "pp-tip__att");
      box.append(
        el("span", "pp-tip__label", "Điểm danh cả môn"),
        kvList([
          ["Đã vắng", `${c.absent}/${c.total} buổi (${Math.round((c.absent / c.total) * 100)}%)`],
          ["Được vắng tối đa", `${allowed} buổi (20%)`],
          ["Còn được vắng", left < 0 ? `Vượt ${-left} buổi, có thể bị cấm thi` : `${left} buổi`, tone]
        ])
      );
      tip.append(box);
    }
    placeTip(cell);
  }

  let tipFor = null; // the element the tooltip is showing for

  // Under the anchor when it fits, otherwise above; always inside the popup.
  function placeTip(anchor) {
    tipFor = anchor;
    tip.hidden = false;
    const r = anchor.getBoundingClientRect();
    const view = document.documentElement;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - tip.offsetWidth / 2, view.clientWidth - tip.offsetWidth - 8));
    const below = r.bottom + 6 + tip.offsetHeight <= view.clientHeight;
    tip.style.left = `${left}px`;
    tip.style.top = `${below ? r.bottom + 6 : Math.max(8, r.top - tip.offsetHeight - 6)}px`;
  }

  function hideTip() {
    tip.hidden = true;
    tipFor = null;
  }

  // Buttons explain themselves with the same tooltip (data-tip-title + data-tip in popup.html).
  function showTextTip(node) {
    if (!node.dataset.tip) return;
    tip.replaceChildren(el("strong", "pp-tip__name", node.dataset.tipTitle), el("p", "pp-tip__text", node.dataset.tip));
    placeTip(node);
  }

  // A button whose text changed while hovered (sync state) updates its open tooltip in place.
  const refreshTip = (node) => tipFor === node && showTextTip(node);

  for (const node of document.querySelectorAll("[data-tip]")) {
    node.addEventListener("mouseenter", () => showTextTip(node));
    node.addEventListener("focus", () => showTextTip(node));
    node.addEventListener("mouseleave", hideTip);
    node.addEventListener("blur", hideTip);
  }

  const renderAttendance = (data) => {
    attByCode = {};
    for (const c of data?.courses || []) attByCode[c.code] = attByCode[`${c.code}|${c.group}`] = c;
  };

  const renderTimetable = async () => {
    const [granted, local, session] = await Promise.all([
      chrome.permissions.contains(FAP),
      chrome.storage.local.get(["fapTimetable", "fapAttendance", "prefs"]),
      chrome.storage.session.get("fapSync")
    ]);
    const enabled = granted && !!local.prefs?.timetable;
    const data = local.fapTimetable?.weeks ? local.fapTimetable : null; // an older single-week cache is refetched
    ttEnabled = enabled;
    // A timetable synced from Google Drive shows even where FAP reading is not turned on.
    const shown = enabled || !!data;
    const sync = session.fapSync;
    const thisWeek = ttThisWeek();
    ttKeys = [...new Set([...Object.keys(data?.weeks || {}), thisWeek])].sort();
    if (!ttKeys.includes(ttView)) ttView = thisWeek;
    const week = data?.weeks[ttView];
    const today = ttView === thisWeek ? (new Date().getDay() + 6) % 7 : -1;
    const body = $("ttBody");
    const status = $("ttStatus");
    body.replaceChildren();
    $("ttRefresh").hidden = $("ttOpen").hidden = status.hidden = $("ttNav").hidden = !shown;
    $("ttRefresh").classList.toggle("is-busy", !!sync);
    $("ttPrev").disabled = ttView === ttKeys[0];
    $("ttNext").disabled = ttView === ttKeys[ttKeys.length - 1];
    $("ttWeek").textContent = ttWeekLabel(ttView);
    $("ttWeek").classList.toggle("is-current", ttView === thisWeek);
    renderAttendance(local.fapAttendance);
    // The cells were rebuilt: drop a tooltip pinned to an old cell, keep one on a header button.
    if (tipFor && !tipFor.isConnected) hideTip();

    if (!shown) {
      body.append(el("p", "pp-tt__note", "Xem lịch học FAP ngay tại đây."));
      const btn = el("button", "pp-btn pp-btn--primary pp-tt__enable");
      btn.type = "button";
      btn.id = "ttEnable";
      btn.append(el("span", "", "Bật thời khóa biểu"));
      btn.addEventListener("click", enableTimetable);
      body.append(btn);
      return;
    }

    if (enabled && !ttAsked && !sync && (!data?.weeks[thisWeek] || !local.fapAttendance || Date.now() - data.fetchedAt > TT_STALE_MS)) {
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

  // Without FAP reading turned on here (timetable from Drive), refreshing first asks to turn it on.
  $("ttRefresh").addEventListener("click", () => (ttEnabled ? ttSync(true, true) : enableTimetable()));
  const ttStep = (by) => {
    ttView = by ? ttKeys[ttKeys.indexOf(ttView) + by] || ttView : ttThisWeek();
    renderTimetable();
  };
  $("ttPrev").addEventListener("click", () => ttStep(-1));
  $("ttNext").addEventListener("click", () => ttStep(1));
  $("ttWeek").addEventListener("click", () => ttStep(0));
  setInterval(() => renderTimetable(), 60000); // keeps "N phút trước" honest while the popup stays open
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.fapTimetable || changes.fapAttendance || changes.fapSync) renderTimetable();
    if (Object.keys(changes).some((key) => key.startsWith("threads:"))) renderSites();
  });

  // --- Google Drive: sign-in and syncing run in background.js; this only shows the state. ---
  const CLOUD_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 18.5h9.25a3.75 3.75 0 0 0 .6-7.45A5.5 5.5 0 0 0 6.7 9.6 4.5 4.5 0 0 0 7.5 18.5z"/></svg>';
  let drive = null;
  const NO_DRIVE = "Chưa cho phép quyền Google Drive"; // same text as drive.js

  // Signed in, the avatar opens a small menu (status, sync now, sign out); signed out, it signs in.
  const needsLogin = () => !drive || drive.error === "Cần đăng nhập lại" || drive.error === NO_DRIVE;
  const menu = $("acctMenu");

  const syncStatus = (busy) =>
    busy
      ? "Đang đồng bộ với Google Drive…"
      : drive.error === NO_DRIVE
        ? "Bạn chưa cho phép extension dùng Google Drive. Bấm Đăng nhập lại và tick ô Google Drive."
        : drive.error === "Cần đăng nhập lại"
          ? "Phiên Google đã hết, bấm Đăng nhập lại."
          : drive.error
            ? `Đồng bộ lỗi: ${drive.error}`
            : `${drive.lastSync ? `Đã đồng bộ ${ttAgo(drive.lastSync)}` : "Chưa đồng bộ"}. Tự đồng bộ khi bạn ôn đề hoặc lịch cập nhật.`;

  const renderAccount = async () => {
    const [{ drive: d }, { driveBusy }] = await Promise.all([chrome.storage.local.get("drive"), chrome.storage.session.get("driveBusy")]);
    drive = d?.account ? d : null;
    const btn = $("acct");
    btn.className = "pp-tt__refresh pp-acct";
    if (!drive) {
      closeMenu();
      btn.innerHTML = CLOUD_ICON;
      btn.setAttribute("aria-label", "Đăng nhập Google để đồng bộ");
      btn.removeAttribute("aria-haspopup");
      btn.dataset.tipTitle = "Đồng bộ Google Drive";
      btn.dataset.tip = d?.error
        ? `Chưa đăng nhập được: ${d.error}. Bấm để thử lại.`
        : "Đăng nhập Google để lưu tiến độ ôn đề, thời khóa biểu và điểm danh lên Drive của bạn, mở máy khác là có. Dữ liệu nằm trong thư mục ẩn riêng của extension.";
      return refreshTip(btn);
    }
    const { email, name, picture } = drive.account;
    btn.replaceChildren();
    if (picture) {
      const img = el("img");
      Object.assign(img, { src: picture, alt: "", referrerPolicy: "no-referrer" });
      btn.append(img);
    } else {
      btn.append(el("span", "pp-acct__initial", (name || email || "?").trim()[0].toUpperCase()));
    }
    btn.classList.add(driveBusy ? "is-busy" : drive.error ? "is-err" : "is-ok");
    btn.setAttribute("aria-label", `Tài khoản Google: ${email}`);
    btn.setAttribute("aria-haspopup", "menu");
    btn.dataset.tip = ""; // the menu says it all
    if (tipFor === btn) hideTip();
    $("acctName").textContent = name || email;
    $("acctEmail").textContent = name ? email : "";
    $("acctStatus").textContent = syncStatus(driveBusy);
    $("acctStatus").className = `pp-menu__status ${driveBusy ? "is-busy" : drive.error ? "is-err" : "is-ok"}`;
    $("acctSync").textContent = needsLogin() ? "Đăng nhập lại" : "Đồng bộ ngay";
    $("acctSync").disabled = !!driveBusy;
  };

  function openMenu() {
    menu.hidden = false;
    $("acct").setAttribute("aria-expanded", "true");
    hideTip();
  }

  function closeMenu() {
    menu.hidden = true;
    $("acct").setAttribute("aria-expanded", "false");
  }

  $("acct").addEventListener("click", () => {
    if (!drive) {
      $("acct").dataset.tip = "Đang mở cửa sổ đăng nhập Google…";
      refreshTip($("acct"));
      return chrome.runtime.sendMessage({ action: "driveLogin" }).catch(() => {});
    }
    menu.hidden ? openMenu() : closeMenu();
  });
  $("acctSync").addEventListener("click", () => {
    const login = needsLogin();
    // Answer the click at once; background.js confirms through driveBusy / drive a moment later.
    $("acctStatus").textContent = login ? "Đang mở cửa sổ đăng nhập Google…" : syncStatus(true);
    $("acctSync").disabled = true;
    chrome.runtime.sendMessage({ action: login ? "driveLogin" : "driveSync" }).catch(() => {});
  });
  $("logout").addEventListener("click", () => {
    closeMenu();
    chrome.runtime.sendMessage({ action: "driveLogout" }).catch(() => {});
  });
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !$("acct").contains(e.target)) closeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      closeMenu();
      $("acct").focus();
    }
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.drive || changes.driveBusy) renderAccount();
  });
  renderAccount().then(() => drive && chrome.runtime.sendMessage({ action: "driveSync" }).catch(() => {}));

  // --- Google Calendar settings in the account menu; calendar.js in the worker does the work. ---
  const NO_CALENDAR = "Chưa cho phép quyền Google Calendar"; // same text as drive.js
  let calendarCfg = null;
  let clearArmed = null;

  const renderCalendar = async () => {
    const [{ calendar, calendarState: st = {} }, { calendarBusy }] = await Promise.all([
      chrome.storage.local.get(["calendar", "calendarState"]),
      chrome.storage.session.get("calendarBusy")
    ]);
    calendarCfg = calendar || null;
    const on = !!calendar?.on;
    $("calOn").checked = on;
    $("calRemind").value = String(calendar?.remind ?? 30);
    $("calClear").hidden = !calendar?.id;
    const status = $("calStatus");
    status.textContent = calendarBusy
      ? "Đang cập nhật Google Calendar…"
      : st.error === NO_CALENDAR
        ? "Chưa cho phép quyền Google Calendar. Bật lại công tắc và tick ô Calendar."
        : st.error
          ? `Lỗi: ${st.error}`
          : on
            ? `${st.lastSync ? `Đã cập nhật ${st.count} buổi ${ttAgo(st.lastSync)}` : "Chưa cập nhật"}. Lịch FAP đổi thì sự kiện tự sửa theo, không tạo trùng.`
            : "Thêm buổi học và lịch thi vào một lịch riêng “FU Study Kit – Lịch học”, không đụng lịch của bạn.";
    status.className = `pp-menu__status ${calendarBusy ? "is-busy" : st.error ? "is-err" : on ? "is-ok" : ""}`;
  };

  const saveCalendar = (patch) => chrome.storage.local.set({ calendar: { id: null, remind: 30, on: false, ...calendarCfg, ...patch, at: Date.now() } });

  $("calOn").addEventListener("change", (e) => {
    const remind = Number($("calRemind").value);
    if (e.target.checked) {
      // Google asks for the Calendar permission in its own window; the worker carries on from there.
      $("calStatus").textContent = "Đang mở cửa sổ cấp quyền Google…";
      chrome.runtime.sendMessage({ action: "calendarEnable", remind }).catch(() => {});
    } else {
      saveCalendar({ on: false });
    }
  });
  $("calRemind").addEventListener("change", (e) => saveCalendar({ remind: Number(e.target.value) }));
  $("calClear").addEventListener("click", () => {
    const btn = $("calClear");
    // Deleting a whole calendar is not undoable, so it takes a second click.
    if (!clearArmed) {
      btn.textContent = "Bấm lần nữa để xoá hết";
      clearArmed = setTimeout(() => {
        clearArmed = null;
        btn.textContent = "Xoá lịch đã thêm";
      }, 4000);
      return;
    }
    clearTimeout(clearArmed);
    clearArmed = null;
    btn.textContent = "Xoá lịch đã thêm";
    $("calStatus").textContent = "Đang xoá lịch…";
    chrome.runtime.sendMessage({ action: "calendarClear" }).catch(() => {});
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.calendar || changes.calendarState || changes.calendarBusy) renderCalendar();
  });
  renderCalendar();

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
  renderPermission();
})();
