let wasteChart = null;
let selectedGaugeDrain = null;
let drainsCache = [];

const STATUS_COLORS = {
    normal: "#02c39a",
    warning: "#e8871e",
    critical: "#d14545",
    immediate: "#a8123a"
};

async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`Request failed: ${url}`);
    return res.json();
}

function populateDrainSelects(drains) {
    const gaugeSelect = document.getElementById("gaugeDrainSelect");
    const simSelect = document.getElementById("simDrain");

    const currentGaugeVal = gaugeSelect.value;
    const currentSimVal = simSelect.value;

    gaugeSelect.innerHTML = "";
    simSelect.innerHTML = "";

    drains.forEach((d) => {
        const opt1 = document.createElement("option");
        opt1.value = d.drain_id;
        opt1.textContent = `${d.drain_id} — ${d.location}`;
        gaugeSelect.appendChild(opt1);

        const opt2 = document.createElement("option");
        opt2.value = d.drain_id;
        opt2.textContent = `${d.drain_id} — ${d.location}`;
        simSelect.appendChild(opt2);
    });

    if (drains.some((d) => d.drain_id === currentGaugeVal)) {
        gaugeSelect.value = currentGaugeVal;
    }
    if (drains.some((d) => d.drain_id === currentSimVal)) {
        simSelect.value = currentSimVal;
    }

    if (!selectedGaugeDrain && drains.length) {
        selectedGaugeDrain = gaugeSelect.value;
    }
}

function updateGauge(drain) {
    if (!drain) return;

    const level = drain.waste_level;
    const cls = statusClass(drain.status);
    const color = STATUS_COLORS[cls];
    const deg = (level / 100) * 360;

    document.getElementById("gaugeCircle").style.background =
        `conic-gradient(${color} ${deg}deg, var(--border) ${deg}deg)`;

    document.getElementById("gaugePct").innerText = `${level}%`;
    document.getElementById("gaugePct").style.color = color;
    document.getElementById("gaugeStatus").innerText = drain.status;

    const action = cls === "normal" ? "MONITOR" : cls === "warning" ? "PLAN CLEANING" : "CLEAN TRAP";

    document.getElementById("consoleReadout").innerHTML =
        `⚠ ECODRAIN ALERT &nbsp; Waste Level: <strong>${level}%</strong> &nbsp; Drain: <strong>${drain.drain_id}</strong> &nbsp; Status: <strong>${drain.status}</strong> &nbsp; Action: <strong>${action}</strong>`;
}

function renderDrainList(drains) {
    const list = document.getElementById("drainList");
    document.getElementById("drainCount").innerText = `${drains.length} drains`;
    list.innerHTML = "";

    drains.forEach((d) => {
        const cls = statusClass(d.status);
        list.innerHTML += `
            <div class="drain-row">
                <div class="id-loc">
                    <strong>${statusEmoji(d.status)} ${d.drain_id}</strong>
                    <div>${d.location}</div>
                </div>
                <div class="level">
                    <div class="val text-${cls}">${d.waste_level}%</div>
                    <div class="badge ${cls}">${d.status}</div>
                </div>
            </div>
        `;
    });
}

function renderChart(drains) {
    const ctx = document.getElementById("wasteChart");
    const labels = drains.map((d) => d.drain_id);
    const values = drains.map((d) => d.waste_level);
    const colors = drains.map((d) => STATUS_COLORS[statusClass(d.status)]);

    if (wasteChart) {
        wasteChart.data.labels = labels;
        wasteChart.data.datasets[0].data = values;
        wasteChart.data.datasets[0].backgroundColor = colors;
        wasteChart.update();
        return;
    }

    wasteChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Waste Level (%)",
                data: values,
                backgroundColor: colors,
                borderRadius: 6,
                maxBarThickness: 46
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, max: 100, grid: { color: "#eef5f4" } },
                x: { grid: { display: false } }
            }
        }
    });
}

async function renderRecentAlerts() {
    const alerts = await fetchJSON("/api/alerts");
    const container = document.getElementById("recentAlerts");
    const recent = alerts.slice(0, 5);

    if (!recent.length) {
        container.innerHTML = `<p style="color:var(--muted); font-size:14px;">No alerts yet — all drains are healthy.</p>`;
        return;
    }

    container.innerHTML = recent.map((a) => {
        const cls = statusClass(a.alert_type);
        const resolved = a.status === "RESOLVED";
        return `
            <div class="alert-card ${resolved ? "resolved" : cls}" style="margin-bottom:10px; padding:14px 16px;">
                <div class="alert-main">
                    <strong>${resolved ? "✅" : statusEmoji(a.alert_type)} ${a.drain_id} — ${a.alert_type}</strong>
                    <p>${a.message}</p>
                    <small>${timeAgo(a.created_at)}</small>
                </div>
            </div>
        `;
    }).join("");
}

async function loadDashboard() {
    try {
        const [drains, analytics] = await Promise.all([
            fetchJSON("/api/drains"),
            fetchJSON("/api/analytics")
        ]);

        drainsCache = drains;

        document.getElementById("kpiAvgWaste").innerText = analytics.average_waste + "%";
        document.getElementById("kpiCritical").innerText = analytics.critical_drains;
        document.getElementById("kpiAlerts").innerText = analytics.active_alerts;
        document.getElementById("kpiHealth").innerText = analytics.average_health;

        document.getElementById("lastUpdated").innerText = new Date().toLocaleTimeString();

        populateDrainSelects(drains);
        renderDrainList(drains);

        // Each of these touches a separate widget — isolate them so a
        // problem loading Chart.js (e.g. no internet / CDN blocked) can't
        // stop the gauge or alerts list from updating.
        try { renderChart(drains); } catch (err) { console.error("Chart render failed:", err); }
        try { await renderRecentAlerts(); } catch (err) { console.error("Recent alerts failed:", err); }

        try {
            const gaugeDrain = drains.find((d) => d.drain_id === document.getElementById("gaugeDrainSelect").value) || drains[0];
            updateGauge(gaugeDrain);
        } catch (err) {
            console.error("Gauge update failed:", err);
        }
    } catch (err) {
        console.error("Dashboard load failed:", err);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadDashboard();
    setInterval(loadDashboard, 5000);

    document.getElementById("gaugeDrainSelect").addEventListener("change", (e) => {
        const drain = drainsCache.find((d) => d.drain_id === e.target.value);
        updateGauge(drain);
    });

    const slider = document.getElementById("simSlider");
    const sliderValue = document.getElementById("simValue");
    slider.addEventListener("input", () => {
        sliderValue.innerText = `${slider.value}%`;
    });

    document.getElementById("simSend").addEventListener("click", async () => {
        const drain_id = document.getElementById("simDrain").value;
        const waste_level = Number(slider.value);
        const water_flow = document.getElementById("simFlow").value;
        const msg = document.getElementById("simMessage");

        msg.textContent = "Sending reading...";

        try {
            const result = await fetchJSON("/api/simulate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ drain_id, waste_level, water_flow })
            });
            msg.textContent = `✅ ${drain_id} updated to ${result.waste_level}% — status: ${result.status}`;
            loadDashboard();
        } catch (err) {
            msg.textContent = "❌ Could not send reading. Is the drain_id valid?";
        }
    });
});
