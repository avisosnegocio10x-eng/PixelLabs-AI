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

    const contenedor =
        document.getElementById("listaClientes");

    contenedor.innerHTML = "";

    clientes.forEach(cliente => {

        contenedor.innerHTML += `

            <div class="cliente-card">

                <h3>${cliente.nombre}</h3>

                <p><strong>ID:</strong> ${cliente.id}</p>

                <p><strong>Plataforma:</strong> ${cliente.plataforma}</p>

                <p>
                    <strong>IA:</strong>
                    ${cliente.iaActiva ? "🟢 Activa" : "🔴 Desactivada"}
                </p>

            </div>

        `;

    });

}

cargarDashboard();

cargarClientes();

setInterval(() => {

    cargarDashboard();

    cargarClientes();

}, 5000);