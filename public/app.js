const params = new URLSearchParams(location.search);
const mode = params.get("mode") === "after" ? "after" : "before";
const modeLabel = document.querySelector("#mode-label");
const modeDescription = document.querySelector("#mode-description");
const totalRequests = document.querySelector("#total-requests");
const detailRequests = document.querySelector("#detail-requests");
const requestSummary = document.querySelector("#request-summary");
const recent = document.querySelector("#recent");
const networkPill = document.querySelector("#network-pill");

const cards = Array.from({ length: 40 }, (_, index) => ({
  id: index + 1,
  title: ["星巴克咖啡券", "電影票", "超商禮物卡", "遊戲點數"][index % 4],
}));

document.querySelectorAll(".mode").forEach((link) => {
  if (link.dataset.mode === mode) link.classList.add("active");
});
modeLabel.textContent = mode === "before" ? "錯誤版：背景預載" : "修正版：按需載入";
modeDescription.textContent = mode === "before" ? "模擬 40 張卡片造成的 RSC / detail 預熱" : "模擬 SSR hydration，點擊後才取 detail";
if (mode === "after") document.querySelector(".status-card.danger").classList.replace("danger", "success");

function renderCards() {
  document.querySelector("#cards").innerHTML = cards.slice(0, 12).map((card) => `
    <button class="ticket" data-id="${card.id}">
      <span class="ticket-index">${String(card.id).padStart(2, "0")}</span>
      <span><b>${card.title}</b><small>有效期限 2026/08/${String(card.id).padStart(2, "0")}</small></span>
      <span class="arrow">↗</span>
    </button>`).join("");
  document.querySelectorAll(".ticket").forEach((ticket) => ticket.addEventListener("click", () => loadDetail(ticket.dataset.id)));
}

async function loadDetail(id) {
  const response = await fetch(`/product/${id}?source=click`, { headers: { "X-Demo-Click": "1" } });
  document.querySelector("#detail").hidden = false;
  document.querySelector("#detail").innerHTML = await response.text();
  networkPill.textContent = `已按需載入 product/${id}`;
  await refreshMetrics();
}

async function triggerFlow() {
  await fetch("/api/reset", { method: "POST" });
  if (mode === "before") {
    const backgroundProductRequests = Array.from({ length: 36 }, (_, index) => fetch(`/product/${index + 1}?prefetch=1`, { headers: { "X-Demo-Prefetch": "1" } }));
    const backgroundRecordRequests = Array.from({ length: 5 }, (_, index) => fetch(`/records/${index + 1}?prefetch=1`, { headers: { "X-Demo-Prefetch": "1" } }));
    await Promise.all([...backgroundProductRequests, ...backgroundRecordRequests, fetch("/api/session"), fetch("/api/tabs"), fetch("/api/list")]);
  } else {
    await Promise.all([fetch("/api/profile"), fetch("/api/api-source")]);
  }
  await refreshMetrics();
}

async function refreshMetrics() {
  const metrics = await fetch("/api/metrics").then((response) => response.json());
  const detailCount = (metrics.counts.productRsc || 0) + (metrics.counts.recordsRsc || 0);
  totalRequests.textContent = metrics.total;
  detailRequests.textContent = detailCount;
  networkPill.textContent = mode === "before" ? `${detailCount} 筆背景詳細頁請求` : `${detailCount} 筆背景詳細頁請求`;
  const labels = { productRsc: "product 詳細頁", recordsRsc: "records 詳細頁", session: "session 驗證", tabs: "tabs API", list: "list API", profile: "profile API", apiSource: "apiSource 初始化" };
  requestSummary.innerHTML = Object.entries(metrics.counts).map(([key, count]) => `<div><span>${labels[key] || key}</span><b>${count}</b></div>`).join("");
  recent.innerHTML = `<p>最近的請求</p><code>${metrics.recent.map((item) => `${item.method} ${item.path}`).join("\n") || "尚無請求"}</code>`;
}

document.querySelector("#refresh").addEventListener("click", refreshMetrics);
renderCards();
triggerFlow();
