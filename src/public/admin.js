async function cargarDashboard() {

    try {

        const response = await fetch(

            "/admin/api/dashboard"

        );

        const datos = await response.json();

        document.getElementById("totalClientes").textContent =
            datos.totalClientes;

        document.getElementById("iaActiva").textContent =
            datos.iaActiva;

        document.getElementById("cotizaciones").textContent =
            datos.cotizaciones;

    }

    catch (error) {

        console.error(error);

    }

}

cargarDashboard();