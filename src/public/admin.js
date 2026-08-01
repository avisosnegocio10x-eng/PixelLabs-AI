async function cargarDashboard() {

    const respuesta = await fetch("/admin/api/dashboard");

    const datos = await respuesta.json();

    document.getElementById("clientes").innerText =
        datos.totalClientes;

    document.getElementById("ia").innerText =
        datos.iaActiva;

    document.getElementById("cotizaciones").innerText =
        datos.cotizaciones;

}

async function cargarClientes() {

    const respuesta = await fetch("/admin/api/clientes");

    const clientes = await respuesta.json();

    const lista =
        document.getElementById("listaClientes");

    lista.innerHTML = "";

    clientes.forEach(cliente => {

        lista.innerHTML += `

        <div class="cliente-card">

            <h3>${cliente.nombre || "Sin registrar"}</h3>

            <p><strong>ID:</strong> ${cliente.id}</p>

            <p><strong>Plataforma:</strong> ${cliente.plataforma}</p>

            <p>
                <strong>IA:</strong>
                ${cliente.iaActiva ? "🟢 Activa" : "🔴 Desactivada"}
            </p>

            <button onclick="cambiarEstadoIA('${cliente.id}')">

                ${cliente.iaActiva
                    ? "Desactivar IA"
                    : "Activar IA"}

            </button>

        </div>

        <br>

        `;

    });

}

async function cambiarEstadoIA(id) {

    await fetch(`/admin/api/ia/${id}`, {

        method: "POST"

    });

    cargarDashboard();

    cargarClientes();

}

cargarDashboard();

cargarClientes();

setInterval(() => {

    cargarDashboard();

    cargarClientes();

}, 5000);