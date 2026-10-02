let drainsForForm = [];

function priorityFor(level) {
    if (level > 90) return { label: "🚨 IMMEDIATE", cls: "text-immediate", action: "Clean now" };
    if (level > 75) return { label: "🔴 HIGH", cls: "text-critical", action: "Clean today" };
    if (level > 50) return { label: "🟠 MEDIUM", cls: "text-warning", action: "Schedule this week" };
    return { label: "🟢 LOW", cls: "text-normal", action: "—" };
}

async function loadPriorityQueue() {
    const res = await fetch("/api/drains");
    const drains = await res.json();
    drainsForForm = drains;

    const sorted = [...drains].sort((a, b) => b.waste_level - a.waste_level);
    const body = document.getElementById("priorityBody");

    body.innerHTML = sorted.map((d) => {
        const p = priorityFor(d.waste_level);
        return `
            <tr>
                <td><strong>${d.drain_id}</strong></td>
                <td>${d.location}</td>
                <td>${d.waste_level}%</td>
                <td class="priority-tag ${p.cls}">${p.label}</td>
                <td>${p.action}</td>
            </tr>
        `;
    }).join("");

    // populate the drain dropdown in the cleaning form (once)
    const select = document.getElementById("drainId");
    if (!select.dataset.loaded) {
        select.innerHTML = drains.map((d) => `<option value="${d.drain_id}">${d.drain_id} — ${d.location}</option>`).join("");
        select.dataset.loaded = "true";
        select.addEventListener("change", autofillBeforeLevel);
        autofillBeforeLevel();
    }
}

function autofillBeforeLevel() {
    const select = document.getElementById("drainId");
    const drain = drainsForForm.find((d) => d.drain_id === select.value);
    if (drain) document.getElementById("beforeLevel").value = drain.waste_level;
}

async function loadHistory() {
    const res = await fetch("/api/maintenance");
    const rows = await res.json();
    const body = document.getElementById("historyBody");

    if (!rows.length) {
        body.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--muted);">No cleaning operations recorded yet.</td></tr>`;
        return;
    }

    body.innerHTML = rows.map((r) => `
        <tr>
            <td><strong>${r.drain_id}</strong></td>
            <td>${r.before_level}%</td>
            <td>${r.after_level}%</td>
            <td>${r.assigned_to}</td>
            <td>${r.cleaning_date}</td>
            <td>${r.remarks || "—"}</td>
        </tr>
    `).join("");
}

document.addEventListener("DOMContentLoaded", () => {
    loadPriorityQueue();
    loadHistory();
    setInterval(loadPriorityQueue, 8000);

    document.getElementById("maintenanceForm").addEventListener("submit", async (e) => {
        e.preventDefault();

        const payload = {
            drain_id: document.getElementById("drainId").value,
            before_level: document.getElementById("beforeLevel").value,
            after_level: document.getElementById("afterLevel").value,
            assigned_to: document.getElementById("assignedTo").value,
            remarks: document.getElementById("remarks").value
        };

        const msg = document.getElementById("formMessage");
        msg.className = "form-message";
        msg.textContent = "Saving...";

        try {
            const res = await fetch("/api/maintenance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const result = await res.json();

            if (!res.ok) throw new Error(result.error || "Failed to save");

            msg.className = "form-message ok";
            msg.textContent = "✅ " + result.message;
            document.getElementById("remarks").value = "";
            loadPriorityQueue();
            loadHistory();
        } catch (err) {
            msg.className = "form-message err";
            msg.textContent = "❌ " + err.message;
        }
    });
});
