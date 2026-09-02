(() => {
  "use strict";

  const ENTRIES_KEY = "kakei_entries_v1";
  const PAYMENTS_KEY = "kakei_payments_v1";

  const CATEGORIES = {
    expense: ["家賃・住居", "光熱費", "通信費", "保険", "サブスク", "ローン・分割", "その他支出"],
    income: ["給与", "副業・臨時収入", "その他収入"],
  };

  // categories other than "サブスク" are treated as the "固定費" group for filtering
  function groupOf(entry) {
    if (entry.kind === "income") return "income";
    return entry.category === "サブスク" ? "subscription" : "fixed";
  }

  /* ---------- state ---------- */
  let entries = loadEntries();
  let payments = loadPayments();
  let viewedYear, viewedMonth;
  let editingId = null;
  let activeFilter = "all";

  const today = new Date();
  viewedYear = today.getFullYear();
  viewedMonth = today.getMonth();

  /* ---------- storage helpers ---------- */
  function loadEntries() {
    try {
      const raw = localStorage.getItem(ENTRIES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("読み込みエラー", e);
      return [];
    }
  }
  function saveEntries() {
    try {
      localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
    } catch (e) {
      console.error("保存エラー", e);
      alert("データの保存に失敗しました。ブラウザのストレージ設定をご確認ください。");
    }
  }
  function loadPayments() {
    try {
      const raw = localStorage.getItem(PAYMENTS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error("読み込みエラー", e);
      return {};
    }
  }
  function savePayments() {
    try {
      localStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments));
    } catch (e) {
      console.error("保存エラー", e);
    }
  }

  function monthKey(y, m) {
    return `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  function isPaid(entryId, key) {
    return !!(payments[key] && payments[key][entryId]);
  }
  function setPaid(entryId, key, value) {
    if (!payments[key]) payments[key] = {};
    if (value) payments[key][entryId] = true;
    else delete payments[key][entryId];
    savePayments();
  }

  function yen(n) {
    const v = Math.round(Number(n) || 0);
    return "¥" + v.toLocaleString("ja-JP");
  }

  /* ---------- DOM refs ---------- */
  const monthLabel = document.getElementById("monthLabel");
  const monthPrev = document.getElementById("monthPrev");
  const monthNext = document.getElementById("monthNext");
  const statIncome = document.getElementById("statIncome");
  const statExpense = document.getElementById("statExpense");
  const statBalance = document.getElementById("statBalance");
  const statUnpaidTotal = document.getElementById("statUnpaidTotal");

  const rowsEl = document.getElementById("rows");
  const emptyState = document.getElementById("emptyState");
  const filterTabs = document.getElementById("filterTabs");

  const addButton = document.getElementById("addButton");
  const addCardBtn = document.getElementById("addCardBtn");
  const chipRow = document.querySelector(".chip-row");
  const overlay = document.getElementById("formOverlay");
  const formTitle = document.getElementById("formTitle");
  const entryForm = document.getElementById("entryForm");
  const formClose = document.getElementById("formClose");
  const fieldName = document.getElementById("fieldName");
  const fieldCategory = document.getElementById("fieldCategory");
  const fieldAmount = document.getElementById("fieldAmount");
  const fieldDay = document.getElementById("fieldDay");
  const fieldMemo = document.getElementById("fieldMemo");
  const deleteEntry = document.getElementById("deleteEntry");
  const kindRadios = entryForm.querySelectorAll('input[name="kind"]');

  /* ---------- rendering ---------- */
  function render() {
    monthLabel.textContent = `${viewedMonth + 1}月`;
    const key = monthKey(viewedYear, viewedMonth);
    const isCurrentMonth = viewedYear === today.getFullYear() && viewedMonth === today.getMonth();
    const todayDay = today.getDate();

    const all = entries.slice().sort((a, b) => a.day - b.day);

    let incomeTotal = 0;
    let expenseTotal = 0;
    let unpaidExpenseTotal = 0;
    const visibleRows = [];

    all.forEach((entry) => {
      if (entry.kind === "income") incomeTotal += Number(entry.amount);
      else expenseTotal += Number(entry.amount);

      const paid = isPaid(entry.id, key);
      const overdue = isCurrentMonth && !paid && entry.kind === "expense" && entry.day < todayDay;
      const group = groupOf(entry);

      if (!paid && entry.kind === "expense") unpaidExpenseTotal += Number(entry.amount);

      let show = true;
      if (activeFilter === "unpaid") show = !paid;
      else if (activeFilter === "fixed") show = group === "fixed";
      else if (activeFilter === "subscription") show = group === "subscription";

      if (show) visibleRows.push(buildRow(entry, paid, overdue, key));
    });

    statIncome.textContent = yen(incomeTotal);
    statExpense.textContent = yen(expenseTotal);
    statBalance.textContent = yen(incomeTotal - expenseTotal);
    statUnpaidTotal.textContent = yen(unpaidExpenseTotal);

    rowsEl.replaceChildren(...visibleRows);
    emptyState.hidden = visibleRows.length > 0;
  }

  function buildRow(entry, paid, overdue, key) {
    const row = document.createElement("div");
    row.className = `row ${entry.kind} ${paid ? "paid" : ""} ${overdue ? "overdue" : ""}`.trim();

    const check = document.createElement("button");
    check.className = "check-btn";
    check.type = "button";
    check.textContent = "✓";
    check.setAttribute("aria-label", paid ? "未処理に戻す" : "処理済みにする");
    check.addEventListener("click", (e) => {
      e.stopPropagation();
      setPaid(entry.id, key, !paid);
      render();
    });

    const main = document.createElement("div");
    main.className = "row-main";
    const name = document.createElement("div");
    name.className = "row-name";
    name.textContent = entry.name;
    const meta = document.createElement("div");
    meta.className = "row-meta";
    meta.textContent = `${entry.category} ・ 毎月${entry.day}日` + (entry.memo ? " ・ " + entry.memo : "") + (overdue ? " ・ 期限超過" : "");
    main.appendChild(name);
    main.appendChild(meta);

    const amount = document.createElement("div");
    amount.className = "row-amount mono";
    amount.textContent = (entry.kind === "income" ? "+" : "−") + yen(entry.amount);

    row.appendChild(check);
    row.appendChild(main);
    row.appendChild(amount);

    row.addEventListener("click", () => openForm(entry));
    return row;
  }

  /* ---------- filter tabs ---------- */
  filterTabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    filterTabs.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    activeFilter = btn.dataset.filter;
    render();
  });

  /* ---------- form ---------- */
  function populateCategories(kind) {
    fieldCategory.replaceChildren();
    CATEGORIES[kind].forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      fieldCategory.appendChild(opt);
    });
  }

  function currentKind() {
    return entryForm.querySelector('input[name="kind"]:checked').value;
  }

  kindRadios.forEach((r) =>
    r.addEventListener("change", () => populateCategories(currentKind()))
  );

  function openForm(entry, presetKind, presetCategory) {
    editingId = entry ? entry.id : null;
    formTitle.textContent = entry ? "記入を編集" : "新しい記入";
    deleteEntry.hidden = !entry;

    const kind = entry ? entry.kind : (presetKind || "expense");
    entryForm.querySelector(`input[name="kind"][value="${kind}"]`).checked = true;
    populateCategories(kind);

    fieldName.value = entry ? entry.name : "";
    fieldCategory.value = entry ? entry.category : (presetCategory || CATEGORIES[kind][0]);
    fieldAmount.value = entry ? entry.amount : "";
    fieldDay.value = entry ? entry.day : "";
    fieldMemo.value = entry ? (entry.memo || "") : "";

    overlay.hidden = false;
    setTimeout(() => fieldName.focus(), 50);
  }

  function closeForm() {
    overlay.hidden = true;
    editingId = null;
    entryForm.reset();
  }

  addButton.addEventListener("click", () => openForm(null));
  addCardBtn.addEventListener("click", () => openForm(null));
  chipRow.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    openForm(null, chip.dataset.kind, chip.dataset.category || undefined);
  });

  formClose.addEventListener("click", closeForm);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeForm();
  });

  entryForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const day = Math.min(31, Math.max(1, parseInt(fieldDay.value, 10) || 1));
    const amount = Math.max(0, parseFloat(fieldAmount.value) || 0);
    const kind = currentKind();
    const data = {
      id: editingId || `e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      kind,
      name: fieldName.value.trim() || "無題の項目",
      category: fieldCategory.value,
      amount,
      day,
      memo: fieldMemo.value.trim(),
    };

    if (editingId) {
      const idx = entries.findIndex((x) => x.id === editingId);
      if (idx !== -1) entries[idx] = data;
    } else {
      entries.push(data);
    }
    saveEntries();
    closeForm();
    render();
  });

  deleteEntry.addEventListener("click", () => {
    if (!editingId) return;
    if (!confirm("この記入を削除しますか？（過去の処理済み記録も削除されます）")) return;
    entries = entries.filter((x) => x.id !== editingId);
    saveEntries();
    Object.keys(payments).forEach((k) => {
      if (payments[k][editingId]) delete payments[k][editingId];
    });
    savePayments();
    closeForm();
    render();
  });

  /* ---------- month navigation ---------- */
  monthPrev.addEventListener("click", () => {
    viewedMonth -= 1;
    if (viewedMonth < 0) {
      viewedMonth = 11;
      viewedYear -= 1;
    }
    render();
  });
  monthNext.addEventListener("click", () => {
    viewedMonth += 1;
    if (viewedMonth > 11) {
      viewedMonth = 0;
      viewedYear += 1;
    }
    render();
  });

  /* ---------- init ---------- */
  populateCategories("expense");
  render();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
