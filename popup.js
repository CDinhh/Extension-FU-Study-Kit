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

  const renderSites = async () => {
    const sites = await FuoStorage.loadAllSites();
    const wrap = $("sites");
    wrap.replaceChildren();
    Object.entries(FuoCore.SITES).forEach(([id, meta], i) => {
      const counts = FuoCore.countSite(sites[id]);
      const card = el("article", "pp-card pp-site");
      card.style.setProperty("--i", i);
      const core = el("div", "pp-card__core");
      const head = el("div", "pp-site__head");
      head.append(el("span", "pp-site__name", meta.name), el("span", "pp-site__host", meta.host));
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
  chrome.permissions.onAdded.addListener(renderPermission);
  chrome.permissions.onRemoved.addListener(renderPermission);
  FuoStorage.onSiteChanged(() => renderSites());
  renderSites();
  renderSyncError();
  renderPermission();
})();
