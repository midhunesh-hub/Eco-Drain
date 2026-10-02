let barChart = null;
let lineChart = null;

const STATUS_COLORS_A = {
    normal: "#02c39a",
    warning: "#e8871e",
    critical: "#d14545",
    immediate: "#a8123a"
};

async function loadKPIs() {
    const res = await fetch("/api/analytics");
    const data = await res.json();

    document.getElementById("totalDrains").innerText = data.total_drains;
    document.getElementById("averageWaste").innerText = data.average_waste + "%";
    document.getElementById("critical").innerText = data.critical_drains;
    document.getElementById("totalAlerts").innerText = data.total_alerts;
    document.getElementById("rowHealth").innerText = data.average_health + " / 100";
    document.getElementById("rowActiveAlerts").innerText = data.active_alerts;
    document.getElementById("rowMaintenance").innerText = data.total_maintenance;
}

async function loadBarChart() {
    const res = await fetch("/api/drains");
    const drains = await res.json();

    const labels = drains.map((d) => d.drain_id);
    const values = drains.map((d) => d.waste_level);
    const colors = drains.map((d) => STATUS_COLORS_A[statusClass(d.status)]);

    try {
        if (barChart) barChart.destroy();
        barChart = new Chart(document.getElementById("analyticsBarChart"), {
            type: "bar",
            data: { labels, datasets: [{ label: "Waste Level (%)", data: values, backgroundColor: colors, borderRadius: 6 }] },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, max: 100 } }
            }
        });
    } catch (err) {
        console.error("Bar chart render failed:", err);
    }

    // populate the history drain selector once we know the drain list
    const select = document.getElementById("historyDrainSelect");
    if (!select.dataset.loaded) {
        select.innerHTML = drains.map((d) => `<option value="${d.drain_id}">${d.drain_id} — ${d.location}</option>`).join("");
        select.dataset.loaded = "true";
        select.addEventListener("change", () => loadHistory(select.value));
        if (drains.length) loadHistory(drains[0].drain_id);
    }
}

async function loadHistory(drainId) {
    const [historyRes, predictionRes] = await Promise.all([
        fetch(`/api/drains/${drainId}/history`),
        fetch(`/api/drains/${drainId}/prediction`)
    ]);

    const history = await historyRes.json();
    const prediction = await predictionRes.json();

    const labels = history.map((h) => new Date(h.timestamp.replace(" ", "T")).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    const values = history.map((h) => h.waste_level);

    try {
        if (lineChart) lineChart.destroy();
        lineChart = new Chart(document.getElementById("historyLineChart"), {
            type: "line",
            data: {
                labels,
                datasets: [{
                    label: `${drainId} Waste Level (%)`,
                    data: values,
                    borderColor: "#028090",
                    backgroundColor: "rgba(2,128,144,0.12)",
                    fill: true,
                    tension: 0.35,
                    pointRadius: 2
                }]
            },
            options: {
                responsive: true,
                scales: { y: { beginAtZero: true, max: 100 } }
            }
        });
    } catch (err) {
        console.error("Line chart render failed:", err);
    }

    const predEl = document.getElementById("predictionText");
    if (!prediction.available) {
        predEl.innerText = "🔮 Not enough historical readings yet for a prediction.";
    } else if (prediction.hours_to_critical === null) {
        predEl.innerHTML = `🔮 <strong>${drainId}</strong> is stable (${prediction.rate_per_day}%/day) — ${prediction.recommendation}`;
    } else {
        const days = (prediction.hours_to_critical / 24).toFixed(1);
        predEl.innerHTML = `🔮 <strong>${drainId}</strong> is accumulating waste at <strong>${prediction.rate_per_day}%/day</strong>. Estimated time to critical (90%): <strong>~${prediction.hours_to_critical}h (${days} days)</strong>. ${prediction.recommendation}`;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadKPIs().catch((err) => console.error("KPI load failed:", err));
    loadBarChart().catch((err) => console.error("Bar chart load failed:", err));
    setInterval(() => loadKPIs().catch((err) => console.error("KPI load failed:", err)), 8000);
    setInterval(() => loadBarChart().catch((err) => console.error("Bar chart load failed:", err)), 8000);
});
