const state = {
    token: sessionStorage.getItem("pixellabsAdminToken") || "",
    settings: null
};

const byId = id => document.getElementById(id);

async function apiFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${state.token}`);

    if (options.body && !(options.body instanceof Blob) && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, { ...options, headers });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
        ? await response.json()
        : null;

    if (!response.ok) {
        const error = new Error(body?.message || `Solicitud fallida (${response.status})`);
        error.status = response.status;
        error.details = body;
        throw error;
    }

    return body;
}

function setAuthenticated(authenticated) {
    byId("authGate").classList.toggle("is-hidden", authenticated);
    byId("appShell").classList.toggle("is-hidden", !authenticated);
}

function setText(id, value) {
    byId(id).textContent = value;
}

function setMessage(id, message, kind = "") {
    const element = byId(id);
    element.textContent = message;
    element.dataset.kind = kind;
}

async function cargarDashboard() {
    const data = await apiFetch("/admin/api/dashboard");
    setText("clientes", data.totalClientes);
    setText("ia", data.iaActiva);
    setText("cotizaciones", data.cotizaciones);
    setText("lastUpdate", `Actualizado ${new Date().toLocaleTimeString("es-SV")}`);
}

function clientCard(client) {
    const article = document.createElement("article");
    article.className = "client-card";

    const title = document.createElement("h3");
    title.textContent = client.nombre || "Sin registrar";
    article.append(title);

    for (const [label, value] of [
        ["ID", client.id],
        ["Plataforma", client.plataforma],
        ["IA", client.iaActiva ? "Activa" : "Desactivada"]
    ]) {
        const row = document.createElement("p");
        const strong = document.createElement("strong");
        strong.textContent = `${label}: `;
        row.append(strong, document.createTextNode(String(value || "—")));
        article.append(row);
    }

    const button = document.createElement("button");
    button.className = "secondary-button";
    button.textContent = client.iaActiva ? "Desactivar IA" : "Activar IA";
    button.addEventListener("click", async () => {
        await apiFetch(`/admin/api/ia/${encodeURIComponent(client.id)}`, { method: "POST" });
        await Promise.all([cargarDashboard(), cargarClientes()]);
    });
    article.append(button);
    return article;
}

async function cargarClientes() {
    const clients = await apiFetch("/admin/api/clientes");
    const list = byId("listaClientes");
    list.replaceChildren(...clients.map(clientCard));
}

function renderSettings(settings) {
    state.settings = settings;
    for (const key of [
        "staticPosts", "carousels", "stories", "reels", "tiktokVideos",
        "facebookPosts", "instagramPosts"
    ]) {
        byId(key).value = settings.dailyTargets[key];
    }

    byId("approvalMode").value = settings.approvalMode;
    byId("humanApproval").value = settings.thresholds.humanApproval;
    byId("automaticApproval").value = settings.thresholds.automaticApproval;
    byId("autoPublish").checked = settings.autoPublish;
    byId("facebookAutomation").checked = settings.platformAutomation.facebook;
    byId("instagramAutomation").checked = settings.platformAutomation.instagram;
    byId("tiktokAutomation").checked = settings.platformAutomation.tiktok;
    setText("autoPublishMetric", settings.autoPublish ? "Activa" : "Apagada");
    setText("engineStatus", settings.enabled ? "Motor activo" : "Motor detenido");
    byId("engineStatus").dataset.enabled = String(settings.enabled);
}

async function cargarSettings() {
    const data = await apiFetch("/admin/api/content-engine/settings");
    renderSettings(data.settings);
}

function readSettingsForm() {
    const dailyTargets = {};
    for (const key of [
        "staticPosts", "carousels", "stories", "reels", "tiktokVideos",
        "facebookPosts", "instagramPosts"
    ]) {
        dailyTargets[key] = Number(byId(key).value);
    }

    return {
        dailyTargets,
        approvalMode: byId("approvalMode").value,
        thresholds: {
            humanApproval: Number(byId("humanApproval").value),
            automaticApproval: Number(byId("automaticApproval").value)
        },
        autoPublish: byId("autoPublish").checked,
        platformAutomation: {
            facebook: byId("facebookAutomation").checked,
            instagram: byId("instagramAutomation").checked,
            tiktok: byId("tiktokAutomation").checked
        }
    };
}

async function saveSettings() {
    try {
        setMessage("settingsMessage", "Guardando…");
        const data = await apiFetch("/admin/api/content-engine/settings", {
            method: "PATCH",
            body: JSON.stringify(readSettingsForm())
        });
        renderSettings(data.settings);
        setMessage("settingsMessage", "Configuración guardada.", "success");
    } catch (error) {
        setMessage("settingsMessage", error.message, "error");
    }
}

async function emergencyStop() {
    if (!window.confirm("¿Detener el motor y toda publicación automática?")) return;
    const data = await apiFetch("/admin/api/content-engine/emergency-stop", { method: "POST" });
    renderSettings(data.settings);
    setMessage("settingsMessage", "Automatización detenida.", "success");
}

async function uploadVideo(file) {
    const mimeType = file.type || "application/octet-stream";
    const created = await apiFetch("/admin/api/content-engine/videos/uploads", {
        method: "POST",
        body: JSON.stringify({ filename: file.name, totalBytes: file.size, mimeType })
    });
    const uploadId = created.upload.uploadId;
    const chunkSize = state.settings?.video?.chunkBytes || 8 * 1024 * 1024;

    for (let start = 0; start < file.size; start += chunkSize) {
        const end = Math.min(start + chunkSize, file.size) - 1;
        const chunk = file.slice(start, end + 1);
        const result = await apiFetch(
            `/admin/api/content-engine/videos/uploads/${uploadId}/chunks`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/octet-stream",
                    "Content-Range": `bytes ${start}-${end}/${file.size}`
                },
                body: chunk
            }
        );
        byId("uploadProgress").style.width = `${result.upload.progress}%`;
        setMessage("uploadMessage", `Subiendo ${file.name}: ${result.upload.progress}%`);
    }

    const completed = await apiFetch(
        `/admin/api/content-engine/videos/uploads/${uploadId}/complete`,
        { method: "POST" }
    );
    setMessage(
        "uploadMessage",
        `${file.name} validado y enviado a la cola (${Math.round(completed.upload.media.durationMs / 1000)} s).`,
        "success"
    );
}

async function initialize() {
    await Promise.all([cargarDashboard(), cargarClientes(), cargarSettings()]);
    setAuthenticated(true);
}

byId("authForm").addEventListener("submit", async event => {
    event.preventDefault();
    state.token = byId("adminToken").value;
    try {
        await initialize();
        sessionStorage.setItem("pixellabsAdminToken", state.token);
        setText("authError", "");
    } catch (error) {
        state.token = "";
        setText("authError", error.status === 401 ? "Token incorrecto." : error.message);
    }
});

byId("logoutButton").addEventListener("click", () => {
    sessionStorage.removeItem("pixellabsAdminToken");
    state.token = "";
    setAuthenticated(false);
});
byId("saveSettings").addEventListener("click", saveSettings);
byId("emergencyStop").addEventListener("click", emergencyStop);
byId("videoUploadForm").addEventListener("submit", async event => {
    event.preventDefault();
    const file = byId("videoFile").files[0];
    if (!file) return;
    try {
        await uploadVideo(file);
    } catch (error) {
        setMessage("uploadMessage", error.message, "error");
    }
});

if (state.token) {
    initialize().catch(() => {
        sessionStorage.removeItem("pixellabsAdminToken");
        state.token = "";
        setAuthenticated(false);
    });
}
