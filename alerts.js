let allAlerts = [];
let currentFilter = "all";

function matchesFilter(alert) {
    if (currentFilter === "all") return true;
    if (currentFilter === "resolved") return alert.status === "RESOLVED";
    if (currentFilter === "critical") {
        return alert.status === "ACTIVE" && (alert.alert_type === "CRITICAL" || alert.alert_type === "IMMEDIATE");
    }
    if (currentFilter === "warning") {
        return alert.status === "ACTIVE" && alert.alert_type === "WARNING";
    }
    return true;
}

function renderAlerts() {
    const container = document.getElementById("alertList");
    const filtered = allAlerts.filter(matchesFilter);

    if (!filtered.length) {
        container.innerHTML = `<div class="empty-state">No alerts match this filter. 🎉</div>`;
        return;
    }

    container.innerHTML = filtered.map((a) => {
        const resolved = a.status === "RESOLVED";
        const cls = resolved ? "resolved" : statusClass(a.alert_type);

        return `
            <div class="alert-card ${cls}">
                <div class="alert-main">
                    <strong>${resolved ? "✅" : statusEmoji(a.alert_type)} ${a.alert_type} — ${a.drain_id}</strong>
                    <p>${a.message}</p>
                    <small>${timeAgo(a.created_at)}${resolved ? " · resolved" : ""}</small>
                </div>
                ${
                    resolved
                    ? `<span class="badge normal">RESOLVED</span>`
                    : `<button class="btn small" onclick="resolveAlert(${a.id})">Resolve</button>`
                }
            </div>
        `;
    }).join("");
}

async function loadAlerts() {
    try {
        const res = await fetch("/api/alerts");
        allAlerts = await res.json();
        renderAlerts();
    } catch (err) {
        console.error("Could not load alerts", err);
    }
}

async function resolveAlert(id) {
    await fetch(`/api/alerts/${id}/resolve`, { method: "POST" });
    loadAlerts();
}

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".filter-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            currentFilter = btn.dataset.filter;
            renderAlerts();
        });
    });

    loadAlerts();
    setInterval(loadAlerts, 5000);
});
