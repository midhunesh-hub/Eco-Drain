// Mobile nav toggle — shared across every page.
document.addEventListener("DOMContentLoaded", () => {
    const toggle = document.getElementById("navToggle");
    const links = document.getElementById("navLinks");

    if (toggle && links) {
        toggle.addEventListener("click", () => {
            links.classList.toggle("open");
        });

        links.querySelectorAll("a").forEach((a) => {
            a.addEventListener("click", () => links.classList.remove("open"));
        });
    }
});

// Small helper used by several pages to format a status string into a
// CSS-friendly class name, e.g. "IMMEDIATE ACTION" -> "immediate".
function statusClass(status) {
    if (!status) return "normal";
    const s = status.toUpperCase();
    if (s.includes("IMMEDIATE")) return "immediate";
    if (s.includes("CRITICAL")) return "critical";
    if (s.includes("WARNING")) return "warning";
    return "normal";
}

function statusEmoji(status) {
    const c = statusClass(status);
    return { normal: "🟢", warning: "🟠", critical: "🔴", immediate: "🚨" }[c];
}

function timeAgo(timestamp) {
    if (!timestamp) return "";
    const then = new Date(timestamp.replace(" ", "T"));
    const diffMs = Date.now() - then.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? "s" : ""} ago`;
}
