// Runs in the page's own JS world (see manifest "world": "MAIN") because the
// Fancybox API is only reachable from there, not from an isolated content script.
(() => {
  const PANEL_CLASS = "fuo-jump";
  const SPEED_KEY = "fuo-capture-speed";
  const EXT_NAME = "Exam Checklist for FuOverflow & FuExam";

  // keep in sync with lib/store-core.js siteFromHost (this MAIN-world script cannot load lib/)
  const host = location.hostname;
  const siteId = host === "fuexam.me" || host.endsWith(".fuexam.me") ? "fuexam" : "fuoverflow";
  const siteName = siteId === "fuexam" ? "FuExam" : "FuOverflow";

  // Flags and progress are stored per thread by thread numeric ID.
  const threadKey = () => {
    const match = location.pathname.match(/\/threads\/(?:[^\/]*?\.)?(\d+)/) || location.pathname.match(/\.(\d+)\/?/);
    if (match && match[1]) return match[1];
    // Sanitize pathname so it never contains illegal characters like slashes in filenames
    const clean = location.pathname.replace(/[^\w-]/g, "_").replace(/^_+|_+$/g, "");
    return clean || "exam";
  };

  // Study state lives in chrome.storage, reachable only through content.js.
  const bridgeRequest = (action, payload = {}, timeoutMs = 5000) =>
    new Promise((resolve, reject) => {
      const requestId = "fuo_" + Math.random().toString(36).slice(2) + Date.now();
      const onMessage = (event) => {
        if (event.source !== window || event.data?.source !== "fuo-isolated") return;
        if (event.data.requestId !== requestId) return;
        window.removeEventListener("message", onMessage);
        clearTimeout(timeoutId);
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data);
      };
      const timeoutId = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error("Extension context invalidated (no response)."));
      }, timeoutMs);
      window.addEventListener("message", onMessage);
      window.postMessage({ source: "fuo-main", action, requestId, threadId: threadKey(), ...payload }, location.origin);
    });

  const getThreadState = () => bridgeRequest("getThreadState").then((r) => r.state);

  const saveStudyProgress = (current, total) =>
    window.postMessage({ source: "fuo-main", action: "setProgress", threadId: threadKey(), current, total }, location.origin);

  const isInvalidated = (err) => /context invalidated/i.test(err?.message || "");

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // Thin-stroke inline icons (static markup, no user data).
  const svg = (d) => `<svg class="fuo-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const ICONS = {
    caret: svg("M6.5 9.5 12 15l5.5-5.5"),
    flag: svg("M5.5 21V4.5m0 0c4.5-2.5 8.5 2.5 13 0v9c-4.5 2.5-8.5-2.5-13 0"),
    arrow: svg("M5 12h14m0 0-5-5m5 5-5 5"),
    camera: svg(
      "M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5zM12 16.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5"
    )
  };

  // Label plus an icon; island=true nests the icon in its own circle (primary actions).
  const setContent = (node, text, icon, island = false) => {
    node.innerHTML = island ? `<span></span><span class="fuo-island">${ICONS[icon]}</span>` : `${ICONS[icon]}<span></span>`;
    node.querySelector("span").textContent = text;
    return node;
  };

  // In-panel replacement for alert()/confirm(). Resolves true on confirm.
  const showModal = ({ title, body, confirmText = "Đã hiểu", cancelText }) =>
    new Promise((resolve) => {
      const overlay = el("div", "fuo-modal");
      const card = el("div", "fuo-modal__card");
      const core = el("div", "fuo-modal__core");
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-modal", "true");
      const heading = el("div", "fuo-modal__title", title);
      const text = el("div", "fuo-modal__body", body);
      const actions = el("div", "fuo-modal__actions");
      const ok = el("button", "is-primary", confirmText);
      ok.type = "button";

      // Capture keys first so Fancybox does not close or change slides underneath the modal.
      const onKey = (e) => {
        if (e.key === "Escape") close(false);
        else if (e.key === "Enter") close(true);
        else if (e.key !== "Tab") return;
        e.stopImmediatePropagation();
      };
      const close = (value) => {
        window.removeEventListener("keydown", onKey, true);
        overlay.classList.add("is-closing");
        setTimeout(() => overlay.remove(), 180);
        resolve(value);
      };

      if (cancelText) {
        const cancel = el("button", "", cancelText);
        cancel.type = "button";
        cancel.addEventListener("click", () => close(false));
        actions.append(cancel);
      }
      ok.addEventListener("click", () => close(true));
      overlay.addEventListener("click", (e) => e.target === overlay && close(false));
      actions.append(ok);
      core.append(heading, text, actions);
      card.append(core);
      overlay.append(card);
      window.addEventListener("keydown", onKey, true);
      (document.querySelector(".fancybox__container") || document.body).append(overlay);
      ok.focus();
    });

  const askReload = () =>
    showModal({
      title: "Cần tải lại trang",
      body: `Extension vừa được cập nhật/reload nên trang bị ngắt kết nối với extension.\n\nBấm "Tải lại" để F5 trang ${siteName} ngay.`,
      confirmText: "Tải lại (F5)",
      cancelText: "Để sau"
    }).then((ok) => ok && location.reload());

  const reportCaptureError = (err) =>
    isInvalidated(err)
      ? askReload()
      : err.needsPermission
      ? showModal({
          title: "Cần cấp quyền chụp màn hình",
          body: `Trình duyệt chỉ cho extension chụp tab khi có quyền này.\n\nBấm icon extension "${EXT_NAME}" trên thanh công cụ → "Cho phép chụp màn hình", rồi bấm chụp lại.`
        })
      : showModal({
          title: "Không thể chụp màn hình",
          body: `${err.message}\n\nHãy làm theo thứ tự:\n1. Mở brave://extensions (hoặc chrome://extensions)\n2. Bấm Reload extension "${EXT_NAME}"\n3. Quay lại tab ${siteName} và nhấn F5.`
        });

  // Request visible tab screenshot from isolated content script -> background service worker
  const requestTabCapture = () => {
    return new Promise((resolve, reject) => {
      const requestId = "fuo_cap_" + Math.random().toString(36).slice(2) + Date.now();

      const onMessage = (event) => {
        if (event.source !== window || event.data?.source !== "fuo-isolated") return;
        if (event.data.action === "captureTabResponse" && event.data.requestId === requestId) {
          window.removeEventListener("message", onMessage);
          clearTimeout(timeoutId);
          const resp = event.data.response;
          if (resp?.success && resp?.dataUrl) {
            resolve(resp.dataUrl);
          } else {
            const err = new Error(resp?.error || "Không nhận được phản hồi từ extension");
            err.needsPermission = !!resp?.needsPermission;
            reject(err);
          }
        }
      };

      const timeoutId = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error("Hết thời gian chờ chụp ảnh (10s). Vui lòng Reload extension và F5 lại trang!"));
      }, 10000);

      window.addEventListener("message", onMessage);
      window.postMessage({ source: "fuo-main", action: "captureTab", requestId }, "*");
    });
  };

  // Decode data URL to byte array using pure JS (atob) to prevent CSP restrictions on fetch()
  const dataUrlToBytes = (dataUrl) => {
    const comma = dataUrl.indexOf(",");
    const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  };

  // Minimal store-only (no compression) ZIP writer: images are already compressed,
  // and this avoids bundling a library into the extension.
  const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  const crc32 = (bytes) => {
    let crc = 0xffffffff;
    for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };

  const makeZip = (files) => {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    for (const { name, data } of files) {
      const nameBytes = enc.encode(name);
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // UTF-8 file names
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, nameBytes.length, true);
      parts.push(local, nameBytes, data);

      const entry = new DataView(new ArrayBuffer(46));
      entry.setUint32(0, 0x02014b50, true);
      entry.setUint16(4, 20, true);
      entry.setUint16(6, 20, true);
      entry.setUint16(8, 0x0800, true);
      entry.setUint32(16, crc, true);
      entry.setUint32(20, data.length, true);
      entry.setUint32(24, data.length, true);
      entry.setUint16(28, nameBytes.length, true);
      entry.setUint32(42, offset, true);
      central.push(entry, nameBytes);
      offset += 30 + nameBytes.length + data.length;
    }
    const centralSize = central.reduce((n, p) => n + (p.byteLength ?? p.length), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: "application/zip" });
  };

  const saveBlob = (blob, filename) => {
    const a = el("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 60000);
  };

  // Wait for slide image to load and sidebar comments to settle before capturing
  const waitForSlideReady = async (fancybox, container, targetIndex, speedDelay = 1000) => {
    const start = Date.now();

    // 1. Wait for Fancybox to report current slide index
    while (fancybox.getSlide()?.index !== targetIndex) {
      if (Date.now() - start > 4000) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    // 2. Wait until the active slide's image is completed
    while (Date.now() - start < 5000) {
      const slide = fancybox.getSlide();
      const slideEl =
        slide?.$el ||
        slide?.el ||
        container.querySelector(".fancybox__slide.is-selected") ||
        container.querySelector(".fancybox-slide--current") ||
        container.querySelector(".carousel__slide.is-selected");

      const img =
        slideEl?.querySelector("img.fancybox__image, img.fancybox-image, img") ||
        container.querySelector(".fancybox__slide.is-selected img");

      if (!img || (img.complete && img.naturalWidth > 0)) {
        break;
      }
      await new Promise((r) => setTimeout(r, 60));
    }

    // 3. Pause if user switched to another tab (resume when tab is visible again)
    while (document.hidden) {
      await new Promise((r) => setTimeout(r, 200));
    }

    // 4. Settling delay for Fancybox transition animations and XenForo comments DOM render
    await new Promise((r) => setTimeout(r, speedDelay));
  };

  const build = async (container, fancybox) => {
    const total = fancybox.carousel.slides.length;
    if (total < 1) return;

    // Read saved state before writing anything, otherwise the resume offer would see this open.
    let state = { current: null, total: null, flags: [] };
    try {
      state = await getThreadState();
    } catch (err) {
      console.warn("[fuo] could not read study state:", err);
    }
    if (!container.isConnected || container.querySelector(`.${PANEL_CLASS}`)) return;

    const flags = new Set(state.flags.filter((i) => i < total));
    let current = fancybox.getSlide()?.index ?? 0;

    const wrap = el("div", PANEL_CLASS);

    const bar = el("div", "fuo-jump__bar");
    const toggle = el("button", "fuo-jump__toggle");
    toggle.type = "button";
    const label = el("span", "fuo-jump__label");
    const caret = el("span", "fuo-jump__caret");
    caret.innerHTML = ICONS.caret;
    toggle.append(label, caret);

    const flagBtn = el("button", "fuo-jump__flag");
    flagBtn.type = "button";
    flagBtn.title = "Đánh dấu câu chưa chắc";
    bar.append(toggle, flagBtn);

    // Toast status notice placed directly in wrap (always visible even when body is hidden)
    let toastTimer = null;
    const toast = el("div", "fuo-jump__toast");
    toast.setAttribute("role", "status");

    const showToast = (text, duration = 4000, kind = "ok") => {
      clearTimeout(toastTimer);
      toast.textContent = text;
      toast.className = `fuo-jump__toast is-${kind} is-show`;
      toastTimer = setTimeout(() => toast.classList.remove("is-show"), duration);
    };

    const body = el("div", "fuo-jump__body");
    body.hidden = true;

    const summary = el("div", "fuo-jump__summary");
    const nextFlag = setContent(el("button", "fuo-jump__next"), "Câu cờ tiếp theo", "arrow");
    nextFlag.type = "button";
    const top = el("div", "fuo-jump__top");
    top.append(summary, nextFlag);

    // If opened at slide 0 but previously studied further, offer quick resume
    const lastStudied = state.current;
    const offerResume = lastStudied && lastStudied > 1 && lastStudied <= total && current === 0;
    if (offerResume) {
      const resumeBtn = setContent(el("button", "fuo-jump__resume"), `Tiếp tục câu ${lastStudied}`, "arrow", true);
      resumeBtn.type = "button";
      resumeBtn.title = `Nhảy tới câu ${lastStudied} đang học trước đó`;
      resumeBtn.addEventListener("click", () => {
        fancybox.jumpTo(lastStudied - 1);
        resumeBtn.remove();
      });
      top.append(resumeBtn);
    }

    // --- SCREENSHOT CAPTURE SECTION (Recommended: captures both question & chat sidebar) ---
    const capTitle = el("div", "fuo-jump__section-title");
    const capTitleText = el("span", "", "Chụp màn hình (+ khung chat)");
    const capTag = el("span", "fuo-jump__tag", "Khuyên dùng");
    capTitle.append(capTitleText, capTag);

    const capRow = el("div", "fuo-jump__actions fuo-jump__actions--capture");
    const capAll = setContent(el("button", "is-primary"), `Chụp tất cả (${total})`, "camera", true);
    capAll.type = "button";
    capAll.title = "Chụp toàn bộ câu hỏi kèm khung chat thảo luận đáp án, nén thành file ZIP";

    const capFlagged = el("button", "", "Chụp câu cờ");
    capFlagged.type = "button";
    capFlagged.title = "Chụp các câu đã đánh dấu cờ kèm khung chat";

    const capCurrent = el("button", "", "Chụp câu này");
    capCurrent.type = "button";
    capCurrent.title = "Chụp câu đang xem kèm khung chat tải về 1 ảnh PNG";

    capRow.append(capAll, capFlagged, capCurrent);

    // Capture speed delay selector
    const speedRow = el("div", "fuo-jump__speed-row");
    const speedLabel = el("label", "", "Tốc độ chụp mỗi câu:");
    const speedSelect = el("select", "fuo-jump__speed-select");
    const speedOptions = [
      { val: 500, text: "Tối đa (0.5s - sát giới hạn Chrome)" },
      { val: 700, text: "Nhanh (0.7s)" },
      { val: 1000, text: "Chuẩn (1.0s)" },
      { val: 1500, text: "Kỹ (1.5s - mạng chậm)" }
    ];
    let savedSpeed = Number(localStorage.getItem(SPEED_KEY)) || 1000;
    speedOptions.forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt.val;
      o.textContent = opt.text;
      if (opt.val === savedSpeed) o.selected = true;
      speedSelect.append(o);
    });
    speedSelect.addEventListener("change", () => {
      savedSpeed = Number(speedSelect.value) || 1000;
      try {
        localStorage.setItem(SPEED_KEY, String(savedSpeed));
      } catch {}
    });
    speedRow.append(speedLabel, speedSelect);

    // --- BUTTONS GRID ---
    const grid = el("div", "fuo-jump__grid");
    const buttons = [];
    for (let i = 0; i < total; i++) {
      const b = el("button", "", String(i + 1));
      b.type = "button";
      // Stagger the reveal; capped so the whole grid lands within ~300ms.
      b.style.setProperty("--fuo-delay", `${Math.min(i, 16) * 5}ms`);
      b.addEventListener("click", () => {
        fancybox.jumpTo(i);
      });
      buttons.push(b);
      grid.append(b);
    }

    const legend = el("div", "fuo-jump__legend");
    legend.innerHTML =
      '<span><i class="is-current"></i>Đang xem</span><span><i class="is-flagged"></i>Chưa chắc</span>';

    body.append(top, capTitle, capRow, speedRow, grid, legend);
    const core = el("div", "fuo-jump__core");
    core.append(bar, toast, body);
    wrap.append(core);

    // The sidebar body is re-rendered on every slide change, so mount on the
    // sidebar shell itself (above the poster info) when it exists.
    (container.querySelector(".fancybox-sidebar") || container).prepend(wrap);

    let isBusy = false;
    let abortCapture = false;

    const setButtonsDisabled = (disabled) => {
      capAll.disabled = disabled;
      capFlagged.disabled = disabled || flags.size === 0;
      capCurrent.disabled = disabled;
    };

    const renderFlags = () => {
      buttons.forEach((b, i) => b.classList.toggle("is-flagged", flags.has(i)));
      summary.textContent = flags.size ? `${flags.size} câu chưa chắc` : "Chưa gắn cờ câu nào";
      summary.classList.toggle("has-flags", flags.size > 0);
      nextFlag.disabled = flags.size === 0;
      if (!isBusy) {
        setButtonsDisabled(false);
      }
      const on = flags.has(current);
      flagBtn.classList.toggle("is-on", on);
      setContent(flagBtn, on ? "Bỏ cờ" : "Gắn cờ", "flag");
    };

    // --- SCREENSHOT BATCH CAPTURE LOGIC ---
    const runScreenshotCapture = async (indexes, zipName) => {
      if (isBusy || !indexes.length) return;
      isBusy = true;
      abortCapture = false;

      const initialSlideIndex = fancybox.getSlide()?.index ?? 0;

      // Collapse dropdown so it doesn't cover comments in screenshots
      body.hidden = true;
      toggle.classList.remove("is-open");

      // Stop button in top bar
      const stopBtn = el("button", "fuo-jump__stop", `Dừng (0/${indexes.length})`);
      stopBtn.type = "button";
      stopBtn.title = "Bấm để dừng chụp (các ảnh đã chụp vẫn sẽ được tải về)";
      stopBtn.addEventListener("click", () => {
        abortCapture = true;
        stopBtn.textContent = "Đang dừng…";
      });
      bar.append(stopBtn);

      setButtonsDisabled(true);

      const originalTitle = document.title;
      const capturedFiles = [];

      for (let k = 0; k < indexes.length; k++) {
        if (abortCapture || !container.isConnected) break;

        const slideIdx = indexes[k];
        stopBtn.textContent = `Dừng (${k + 1}/${indexes.length})`;
        document.title = `(${k + 1}/${indexes.length}) Đang chụp... - ${siteName}`;

        fancybox.jumpTo(slideIdx);
        await waitForSlideReady(fancybox, container, slideIdx, savedSpeed);

        if (abortCapture || !container.isConnected) break;

        // Hide stop button during the 50ms capture window for 100% clean screenshot
        stopBtn.style.visibility = "hidden";
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 40)));

        try {
          const dataUrl = await requestTabCapture();
          const bytes = dataUrlToBytes(dataUrl);
          const name = `Cau-${String(slideIdx + 1).padStart(2, "0")}.png`;
          capturedFiles.push({ name, data: bytes });
        } catch (err) {
          console.error(`Lỗi chụp câu ${slideIdx + 1}:`, err);
          // If first slide fails, abort immediately and explain how to recover
          if (k === 0) {
            abortCapture = true;
            reportCaptureError(err);
            break;
          }
        } finally {
          stopBtn.style.visibility = "visible";
        }
      }

      document.title = originalTitle;
      stopBtn.remove();

      // Return user to original slide
      if (container.isConnected) {
        fancybox.jumpTo(initialSlideIndex);
      }

      if (capturedFiles.length) {
        const finalZipName = abortCapture
          ? zipName.replace(".zip", "-tam-dung.zip")
          : zipName;
        saveBlob(makeZip(capturedFiles), finalZipName);
        showToast(`Đã lưu ${capturedFiles.length} ảnh vào file ${finalZipName}!`, 5000);
      } else if (!abortCapture) {
        showToast("Không chụp được ảnh nào. Vui lòng F5 thử lại!", 5000, "warn");
      }

      // Re-open body panel
      body.hidden = false;
      toggle.classList.add("is-open");

      isBusy = false;
      renderFlags();
    };

    // Single slide capture
    const runCaptureCurrent = async () => {
      if (isBusy) return;
      isBusy = true;
      const cur = fancybox.getSlide()?.index ?? 0;

      body.hidden = true;
      toggle.classList.remove("is-open");
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50)));

      try {
        const dataUrl = await requestTabCapture();
        const bytes = dataUrlToBytes(dataUrl);
        const blob = new Blob([bytes], { type: "image/png" });
        saveBlob(blob, `${siteId}-${threadKey()}-Cau-${String(cur + 1).padStart(2, "0")}.png`);
        showToast(`Đã chụp câu ${cur + 1} kèm khung chat!`, 4000);
      } catch (err) {
        console.error("Lỗi chụp đơn:", err);
        reportCaptureError(err);
      } finally {
        isBusy = false;
        body.hidden = false;
        toggle.classList.add("is-open");
        renderFlags();
      }
    };

    // Event listeners for screenshot capture
    capAll.addEventListener("click", () =>
      runScreenshotCapture([...Array(total).keys()], `${siteId}-${threadKey()}-kem-chat-tat-ca.zip`)
    );
    capFlagged.addEventListener("click", () =>
      runScreenshotCapture([...flags].sort((a, b) => a - b), `${siteId}-${threadKey()}-kem-chat-cau-co.zip`)
    );
    capCurrent.addEventListener("click", runCaptureCurrent);

    toggle.addEventListener("click", () => {
      body.hidden = !body.hidden;
      toggle.classList.toggle("is-open", !body.hidden);
    });

    const toggleFlag = (set, i) => (set.has(i) ? set.delete(i) : set.add(i));
    flagBtn.addEventListener("click", async () => {
      const i = current;
      toggleFlag(flags, i);
      renderFlags();
      try {
        await bridgeRequest("setFlags", { flags: [...flags] });
      } catch (err) {
        toggleFlag(flags, i);
        renderFlags();
        if (isInvalidated(err)) askReload();
        else showToast(`Không lưu được cờ: ${err.message}`, 5000, "warn");
      }
    });

    // Another tab (or Chrome Sync) changed this site's data: refresh flags.
    const onStateChanged = (event) => {
      if (event.source !== window || event.data?.source !== "fuo-isolated") return;
      if (event.data.action !== "stateChanged") return;
      getThreadState().then((s) => {
        flags.clear();
        s.flags.filter((i) => i < total).forEach((i) => flags.add(i));
        renderFlags();
      }, () => {});
    };
    window.addEventListener("message", onStateChanged);

    nextFlag.addEventListener("click", () => {
      const ordered = [...flags].sort((a, b) => a - b);
      const target = ordered.find((i) => i > current) ?? ordered[0];
      if (target !== undefined) fancybox.jumpTo(target);
    });

    // Keep the highlighted number in sync with the slide being shown.
    let last = -1;
    const sync = () => {
      if (!container.isConnected) {
        window.removeEventListener("message", onStateChanged);
        return clearInterval(timer);
      }
      current = fancybox.getSlide()?.index ?? 0;
      if (current === last) return;
      // Keep the older progress while the resume offer is showing at question 1;
      // batch capture jumps through every slide, which is not studying.
      const record = !isBusy && !(offerResume && last === -1);
      if (last >= 0) buttons[last].classList.remove("is-current");
      buttons[current]?.classList.add("is-current");
      last = current;
      label.textContent = `Câu ${current + 1}/${total}`;
      renderFlags();
      if (record) saveStudyProgress(current + 1, total);
    };
    const timer = setInterval(sync, 250);
    sync();
  };

  const building = new WeakSet();
  const tryAttach = () => {
    const container = document.querySelector(".fancybox__container");
    if (!container || building.has(container) || container.querySelector(`.${PANEL_CLASS}`)) return;
    // Fancybox adds the container first and finishes setting up the carousel and
    // sidebar afterwards, so bail out until they exist; a later mutation retries.
    if (container.classList.contains("fancybox-has-sidebar") && !container.querySelector(".fancybox-sidebar")) return;
    const fancybox = window.Fancybox?.getInstance?.();
    if (fancybox?.carousel?.slides) {
      building.add(container);
      build(container, fancybox).finally(() => building.delete(container));
    }
  };

  // subtree: the container itself is populated after it lands in <body>.
  new MutationObserver(tryAttach).observe(document.body, { childList: true, subtree: true });
  tryAttach();
})();
