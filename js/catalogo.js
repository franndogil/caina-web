const URL = "https://opensheet.elk.sh/1VNX7qBKOunEsgGTBfUWpib_oyDshLDNgCOfmIUzjp28/Hoja%201";

async function cargarProductos() {
  const res = await fetch(URL);
  let data = await res.json();

  //FILTRAR FILAS VACÍAS
  data = data.filter(p => p.nombre && p.categoria);

  renderProductos(data);
}

/* =========================
   AGRUPACIONES
========================= */

function agruparProductos(productos) {
  const resultado = {};

  productos.forEach(p => {
    const key = p.categoria + "|" + p.nombre;

    if (!resultado[key]) {
      resultado[key] = {
        categoria: p.categoria,
        nombre: p.nombre,
        imagen: p.imagen,
        variantes: []
      };
    }

    resultado[key].variantes.push({
      tamaño: p.tamaño,
      precio: Number(
        String(p.precio)
          .replace(/\$/g, "")
          .replace(/,/g, "")
      )
    });
  });

  return Object.values(resultado);
}

function agruparPorCategoria(productos) {
  const categorias = {};

  productos.forEach(p => {
    if (!categorias[p.categoria]) {
      categorias[p.categoria] = [];
    }
    categorias[p.categoria].push(p);
  });

  return categorias;
}

/* =========================
   RENDER
========================= */

function renderProductos(productos) {
  const container = document.getElementById("productos");
  if (!container) return;

  const productosAgrupados = agruparProductos(productos);
  const categorias = agruparPorCategoria(productosAgrupados);

  container.innerHTML = Object.entries(categorias).map(([cat, items]) => `
    <div class="card">
      <div class="card-name">${cat}</div>
      <p class="card-desc">Opciones disponibles.</p>

      ${items.map(p => `
        <div class="producto-item">
          <img 
            src="${p.imagen}" 
            alt="${p.nombre}" 
            class="producto-img"
            onclick="abrirImagen('${p.imagen}')"
          >

          <div class="producto-info">
            <strong>${p.nombre}</strong>

            <div class="variantes">
              ${p.variantes.map(v => `
                <button 
                  class="variante-btn"
                  onclick="agregarDirecto(this, '${p.nombre}', '${v.tamaño}', ${v.precio})">
                  ${v.tamaño}
                </button>
              `).join("")}
            </div>
          </div>
        </div>
      `).join("")}
    </div>
  `).join("");
}

/* =========================
   ACCIONES
========================= */

function agregarDirecto(btn, nombre, tamaño, precio) {
  agregar(nombre, tamaño, precio);

  // feedback visual rápido
  btn.classList.add("active");

  setTimeout(() => {
    btn.classList.remove("active");
  }, 120);
}

/* =========================
   INIT
========================= */

document.addEventListener("DOMContentLoaded", cargarProductos);

function abrirImagen(src) {
  const modal = document.getElementById("modal-img");
  const img = document.getElementById("modal-contenido");

  img.src = src;
  modal.style.display = "flex";
}

function cerrarImagen() {
  document.getElementById("modal-img").style.display = "none";
}

// cerrar tocando afuera
document.addEventListener("click", (e) => {
  if (e.target.id === "modal-img") {
    cerrarImagen();
  }
});