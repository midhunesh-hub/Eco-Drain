const STATUS_COLORS_MAP = {
    normal: "#02c39a",
    warning: "#e8871e",
    critical: "#d14545",
    immediate: "#a8123a"
};

const map = L.map("map").setView([9.9252, 78.1198], 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

function coloredIcon(color) {
    return L.divIcon({
        className: "",
        html: `<div style="
            width:22px;height:22px;border-radius:50%;
            background:${color};border:3px solid #fff;
            box-shadow:0 2px 8px rgba(0,0,0,0.35);
        "></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
    });
}

let markers = [];

async function loadMap() {
    try {
        const res = await fetch("/api/drains");
        const drains = await res.json();

        markers.forEach((m) => map.removeLayer(m));
        markers = [];

        drains.forEach((drain) => {
            const cls = statusClass(drain.status);
            const color = STATUS_COLORS_MAP[cls];

            const marker = L.marker([drain.latitude, drain.longitude], {
                icon: coloredIcon(color)
            }).addTo(map);

            marker.bindPopup(`
                <h3>${drain.drain_id}</h3>
                <p><strong>${drain.location}</strong></p>
                <p>Waste Level: <strong>${drain.waste_level}%</strong></p>
                <p>Water Flow: ${drain.water_flow}</p>
                <p>Health Score: ${drain.health_score}/100</p>
                <p>Status: <strong style="color:${color}">${drain.status}</strong></p>
            `);

            markers.push(marker);
        });
    } catch (err) {
        console.error("Could not load drain map data", err);
    }
}

loadMap();
setInterval(loadMap, 8000);
