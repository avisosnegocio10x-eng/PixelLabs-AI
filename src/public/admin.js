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
        await apiFetch(`/admin/api/ia/${encodeURIComponent(client.id)}`, {
            method: "POST",
            body: JSON.stringify({ plataforma: client.plataforma || "messenger" })
        });
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

function emptyState(message) {
    const element = document.createElement("div");
    element.className = "empty-state";
    element.textContent = message;
    return element;
}

function statusBadge(status) {
    const badge = document.createElement("span");
    badge.className = "status-badge";
    badge.dataset.status = status;
    badge.textContent = status;
    return badge;
}

function recordCard(title, lines, actions = []) {
    const article = document.createElement("article");
    article.className = "record-card";
    const content = document.createElement("div");
    const heading = document.createElement("h3");
    heading.textContent = title;
    content.append(heading);
    for (const line of lines) {
        if (line instanceof HTMLElement) content.append(line);
        else {
            const paragraph = document.createElement("p");
            paragraph.textContent = line;
            content.append(paragraph);
        }
    }
    const actionArea = document.createElement("div");
    actionArea.className = "record-actions";
    actionArea.append(...actions);
    article.append(content, actionArea);
    return article;
}

function actionButton(label, handler, kind = "secondary-button") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = kind;
    button.textContent = label;
    button.addEventListener("click", async () => {
        button.disabled = true;
        try { await handler(); }
        catch (error) { window.alert(error.message); }
        finally { button.disabled = false; }
    });
    return button;
}

async function catalogAction(reference, action) {
    await apiFetch(`/admin/api/content-engine/catalog/products/${encodeURIComponent(reference)}/actions`, {
        method: "POST",
        body: JSON.stringify({ action })
    });
    window.alert("Trabajo creado. Permanecerá en borrador y requerirá aprobación.");
}

async function cargarCatalogo() {
    const query = encodeURIComponent(byId("catalogSearch").value.trim());
    const data = await apiFetch(`/admin/api/content-engine/catalog/products?q=${query}`);
    const list = byId("catalogList");
    if (!data.products.length) return list.replaceChildren(emptyState("No se encontraron productos."));
    list.replaceChildren(...data.products.map(product => {
        const availability = document.createElement("select");
        for (const status of ["AVAILABLE", "LOW_STOCK", "OUT_OF_STOCK", "PAUSED", "ARCHIVED"]) {
            const option = document.createElement("option");
            option.value = status;
            option.textContent = status;
            option.selected = status === product.availabilityStatus;
            availability.append(option);
        }
        availability.addEventListener("change", async () => {
            await apiFetch(`/admin/api/content-engine/catalog/products/${encodeURIComponent(product.reference)}/availability`, {
                method: "PATCH",
                body: JSON.stringify({ availabilityStatus: availability.value })
            });
            await cargarCatalogo();
        });
        return recordCard(
            `${product.reference} · ${product.name}`,
            [
                `${product.category} · ${product.priceFrom !== null ? `Desde $${Number(product.priceFrom).toFixed(2)}` : "Cotizar por mensaje"}`,
                `Colores confirmados: ${product.compatibleColors.join(", ") || "Sin registrar"}`,
                statusBadge(product.availabilityStatus)
            ],
            [
                availability,
                actionButton("3 ideas", () => catalogAction(product.reference, "create-ideas")),
                actionButton("Crear reel", () => catalogAction(product.reference, "create-reel")),
                actionButton("Carrusel", () => catalogAction(product.reference, "create-carousel")),
                actionButton("No promocionar 15 días", async () => {
                    await apiFetch(`/admin/api/content-engine/catalog/products/${encodeURIComponent(product.reference)}/promotion-cooldown`, {
                        method: "POST",
                        body: JSON.stringify({ days: 15 })
                    });
                    await cargarCatalogo();
                })
            ]
        );
    }));
}

async function cargarAprobaciones() {
    const data = await apiFetch("/admin/api/content-engine/content?status=REQUIRES_HUMAN_APPROVAL");
    const list = byId("approvalList");
    if (!data.items.length) return list.replaceChildren(emptyState("No hay contenido esperando aprobación."));
    list.replaceChildren(...data.items.map(item => recordCard(
        item.title || `${item.format} · ${item.productReference}`,
        [
            item.primaryText || "Sin texto principal.",
            `Puntaje: ${item.overallScore ?? "—"} · Revisiones aprobadas: ${item.reviewPasses}/8`,
            statusBadge(item.status)
        ],
        [
            actionButton("Aprobar", async () => {
                if (!window.confirm("¿Aprobar este contenido? Esto no lo publicará automáticamente.")) return;
                await apiFetch(`/admin/api/content-engine/content/${item.id}/approve`, { method: "POST" });
                await cargarAprobaciones();
            }, "primary-button"),
            actionButton("Rechazar", async () => {
                const reason = window.prompt("Motivo del rechazo:");
                if (!reason) return;
                await apiFetch(`/admin/api/content-engine/content/${item.id}/reject`, {
                    method: "POST",
                    body: JSON.stringify({ reason })
                });
                await cargarAprobaciones();
            }, "danger-button")
        ]
    )));
}

function localDate() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: state.settings?.timezone || "America/El_Salvador"
    }).format(new Date());
}

async function cargarTendencias() {
    const data = await apiFetch("/admin/api/content-engine/trends");
    const list = byId("trendList");
    if (!data.items.length) return list.replaceChildren(emptyState("Todavía no hay tendencias que superen el puntaje mínimo."));
    list.replaceChildren(...data.items.map(item => recordCard(
        item.name,
        [
            item.summary || "Sin resumen adicional.",
            `Puntaje: ${item.score.overallScore} · Recomendación: ${item.score.recommendation}`,
            `Riesgo de copyright: ${item.score.copyrightRisk} · Marca: ${item.score.trademarkRisk}`,
            statusBadge(item.status)
        ]
    )));
}

async function registrarTendencia(event) {
    event.preventDefault();
    try {
        setMessage("trendMessage", "Evaluando…");
        await apiFetch("/admin/api/content-engine/trends/ingest", {
            method: "POST",
            body: JSON.stringify({
                observations: [{
                    name: byId("trendName").value,
                    source: {
                        name: "Carga manual del propietario",
                        sourceType: "manual",
                        collectionMethod: "manual"
                    },
                    signals: {
                        relevanceScore: Number(byId("trendRelevance").value),
                        salesPotential: Number(byId("trendSales").value),
                        messagesPotential: Number(byId("trendSales").value),
                        localInterest: Number(byId("trendRelevance").value),
                        copyrightRisk: Number(byId("trendRisk").value),
                        trademarkRisk: Number(byId("trendRisk").value)
                    }
                }]
            })
        });
        byId("trendName").value = "";
        setMessage("trendMessage", "Tendencia evaluada. Sigue necesitando aprobación humana.", "success");
        await cargarTendencias();
    } catch (error) {
        setMessage("trendMessage", error.message, "error");
    }
}

async function cargarCalendario() {
    const date = byId("calendarDate").value || localDate();
    byId("calendarDate").value = date;
    const data = await apiFetch(`/admin/api/content-engine/calendar?date=${encodeURIComponent(date)}`);
    const list = byId("calendarList");
    if (!data.slots.length) return list.replaceChildren(emptyState("No hay espacios editoriales para este día."));
    list.replaceChildren(...data.slots.map(slot => recordCard(
        `${new Date(slot.plannedFor).toLocaleTimeString("es-SV", { hour: "numeric", minute: "2-digit", timeZone: state.settings?.timezone })} · ${slot.platform}`,
        [
            slot.concept,
            `${slot.category} · ${slot.recommendedFormats.join(", ")} · ${slot.metadata.productReference || "Sin producto"}`,
            statusBadge(slot.status)
        ]
    )));
}

async function crearPlan() {
    try {
        setMessage("calendarMessage", "Creando distribución segura…");
        const date = byId("calendarDate").value || localDate();
        const result = await apiFetch("/admin/api/content-engine/calendar/plan", {
            method: "POST",
            body: JSON.stringify({ date, platforms: ["facebook", "instagram", "tiktok"] })
        });
        setMessage(
            "calendarMessage",
            result.status === "REST_DAY"
                ? "Este día está configurado como descanso."
                : `${result.slots.length} espacios preparados como propuestas.`,
            "success"
        );
        await cargarCalendario();
    } catch (error) {
        setMessage("calendarMessage", error.message, "error");
    }
}

function metricCard(label, value) {
    const card = document.createElement("article");
    card.className = "metric-card";
    const name = document.createElement("span");
    name.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    card.append(name, strong);
    return card;
}

async function cargarMetricas() {
    const data = await apiFetch("/admin/api/content-engine/metrics/summary");
    const summary = data.summary;
    byId("metricsGrid").replaceChildren(
        metricCard("Ingresos atribuidos", `$${Number(summary.totals.revenue).toFixed(2)}`),
        metricCard("Ventas", summary.totals.sales),
        metricCard("Cotizaciones", summary.totals.quoteRequests),
        metricCard("Mensajes", summary.totals.messages)
    );
    const list = byId("metricsList");
    if (!summary.platforms.length) return list.replaceChildren(emptyState("Las métricas aparecerán cuando existan publicaciones confirmadas y cuentas autorizadas."));
    list.replaceChildren(...summary.platforms.map(platform => recordCard(
        platform.platform,
        [
            `Ingresos: $${Number(platform.revenue).toFixed(2)} · Ventas: ${platform.sales}`,
            `Cotizaciones: ${platform.quoteRequests} · Mensajes: ${platform.messages}`,
            `Visualizaciones: ${platform.views}`
        ]
    )));
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
    return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`;
}

async function cargarVideos() {
    const data = await apiFetch("/admin/api/content-engine/videos");
    const list = byId("videoList");
    const disabled = data.videoRuntime?.enabled === false;
    byId("videoFile").disabled = disabled;
    byId("videoUploadForm").querySelector("button").disabled = disabled;
    if (disabled) {
        setMessage(
            "uploadMessage",
            "Video pesado está separado de este despliegue gratuito. El backend y los datos permanentes siguen activos.",
            ""
        );
    }
    if (!data.videos.length) return list.replaceChildren(emptyState(
        disabled
            ? "El agente local todavía no ha sincronizado videos."
            : "La biblioteca todavía no contiene videos."
    ));
    list.replaceChildren(...data.videos.map(video => recordCard(
        video.originalFilename,
        [
            `${formatBytes(video.totalBytes)} · ${video.durationMs ? `${Math.round(video.durationMs / 1000)} s` : "Duración pendiente"}`,
            `Etapa: ${video.processingStage || "Subida"} · Progreso: ${video.progress}%`,
            `Clips: ${video.clipsFound} · Aprobados: ${video.clipsApproved}`,
            statusBadge(video.status)
        ]
    )));
}

async function cargarClips() {
    const data = await apiFetch("/admin/api/content-engine/clips");
    const list = byId("clipList");
    const localWorkerMode = data.videoRuntime?.enabled === false;
    if (!data.clips.length) return list.replaceChildren(emptyState("Aún no se detectaron clips."));
    list.replaceChildren(...data.clips.map(clip => {
        const style = document.createElement("select");
        for (const value of ["premium-minimalista", "dinamico", "educativo", "satisfactorio", "proceso-real", "tiktok", "instagram", "facebook"]) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            style.append(option);
        }
        const quality = document.createElement("input");
        quality.type = "number";
        quality.min = "0";
        quality.max = "100";
        quality.value = "90";
        quality.title = "Puntaje de calidad";
        const privacy = document.createElement("input");
        privacy.type = "checkbox";
        const privacyLabel = document.createElement("label");
        privacyLabel.append(privacy, document.createTextNode("Privacidad revisada"));
        const actions = [];
        if (
            !localWorkerMode &&
            !["APPROVED", "REJECTED", "ARCHIVED", "PUBLISHED"].includes(clip.status)
        ) {
            actions.push(
                style,
                actionButton("Renderizar", async () => {
                    await apiFetch(`/admin/api/content-engine/videos/${clip.uploadId}/clips/${clip.id}/render`, {
                        method: "POST",
                        body: JSON.stringify({ style: style.value })
                    });
                    await cargarClips();
                })
            );
        }
        if (clip.status === "DRAFT") {
            actions.push(
                quality,
                privacyLabel,
                actionButton("Aprobar clip", async () => {
                    await apiFetch(`/admin/api/content-engine/videos/${clip.uploadId}/clips/${clip.id}/review`, {
                        method: "POST",
                        body: JSON.stringify({
                            decision: "APPROVE",
                            privacyCleared: privacy.checked,
                            qualityScore: Number(quality.value),
                            notes: "Aprobado desde el Centro de Contenido"
                        })
                    });
                    await cargarClips();
                }, "primary-button"),
                actionButton("Rechazar", async () => {
                    await apiFetch(`/admin/api/content-engine/videos/${clip.uploadId}/clips/${clip.id}/review`, {
                        method: "POST",
                        body: JSON.stringify({
                            decision: "REJECT",
                            privacyCleared: privacy.checked,
                            qualityScore: Number(quality.value),
                            notes: "Rechazado desde el Centro de Contenido"
                        })
                    });
                    await cargarClips();
                }, "danger-button")
            );
        }
        const latestVersion = clip.versions?.[0];
        const preview = latestVersion?.media?.signedUrl
            ? document.createElement("video")
            : null;
        if (preview) {
            preview.controls = true;
            preview.preload = "metadata";
            preview.src = latestVersion.media.signedUrl;
            preview.poster = latestVersion.cover?.signedUrl || "";
            preview.className = "clip-preview";
        }
        return recordCard(
            clip.topic || "Clip detectado",
            [
                ...(preview ? [preview] : []),
                `${clip.originalFilename} · ${(clip.durationMs / 1000).toFixed(1)} s · Puntaje de detección ${clip.score}`,
                `Privacidad: ${clip.privacyStatus}`,
                statusBadge(clip.status)
            ],
            actions
        );
    }));
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
    await cargarVideos();
}

async function initialize() {
    if (!byId("calendarDate").value) byId("calendarDate").value = localDate();
    await Promise.all([
        cargarDashboard(),
        cargarClientes(),
        cargarSettings(),
        cargarCatalogo(),
        cargarAprobaciones(),
        cargarVideos(),
        cargarClips(),
        cargarTendencias(),
        cargarCalendario(),
        cargarMetricas()
    ]);
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
byId("searchCatalog").addEventListener("click", cargarCatalogo);
byId("refreshApprovals").addEventListener("click", cargarAprobaciones);
byId("refreshClips").addEventListener("click", async () => {
    await Promise.all([cargarClips(), cargarVideos()]);
});
byId("refreshTrends").addEventListener("click", cargarTendencias);
byId("trendForm").addEventListener("submit", registrarTendencia);
byId("createPlan").addEventListener("click", crearPlan);
byId("calendarDate").addEventListener("change", () => {
    cargarCalendario().catch(error => setMessage("calendarMessage", error.message, "error"));
});
byId("refreshMetrics").addEventListener("click", cargarMetricas);
byId("catalogSearch").addEventListener("keydown", event => {
    if (event.key === "Enter") cargarCatalogo().catch(error => window.alert(error.message));
});
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
