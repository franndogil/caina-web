let carrito = JSON.parse(localStorage.getItem("caina_carrito") || "[]");
const format = n => n.toLocaleString("es-AR");

// ========================
// PERSISTENCIA
// ========================

function guardar() {
  localStorage.setItem("caina_carrito", JSON.stringify(carrito));
}

// ========================
// PRICING POR TRAMO
// ========================

function totalCarritoUnidades() {
  return carrito.reduce((sum, i) => sum + i.cantidad, 0);
}

function getTier(medidaId, materialTipo) {
  const precios = window.preciosDB || [];
  const total = totalCarritoUnidades();

  const tiers = precios
    .filter(p => p.medida_id === medidaId && (!materialTipo || p.tipo === materialTipo))
    .sort((a, b) => a.cantidad - b.cantidad);

  if (!tiers.length) return null;

  // mayor tramo donde tramo.cantidad <= total, o mínimo si no alcanza
  return [...tiers].reverse().find(t => t.cantidad <= total) || tiers[0];
}

function precioUnitarioPara(medidaId, materialTipo) {
  const tier = getTier(medidaId, materialTipo);
  return tier ? tier.precio / tier.cantidad : null;
}

// ========================
// AGREGAR AL CARRITO
// ========================

function agregar(nombre, material, tamano, medidaId, unidades, categoria, materialTipo) {
  const existente = carrito.find(
    i => i.nombre === nombre && i.material === material && i.tamano === tamano
  );

  if (existente) {
    existente.cantidad += unidades;
  } else {
    carrito.push({ nombre, material, tamano, medidaId, cantidad: unidades, categoria, materialTipo });
  }

  guardar();
  render();
  animarAgregado();
}

// ========================
// RENDER
// ========================

function render() {
  const lista = document.getElementById("lista");
  const totalDiv = document.getElementById("total");
  if (!lista) return;

  if (!carrito.length) {
    lista.innerHTML = "No hay productos todavía";
    totalDiv.innerHTML = "";
    return;
  }

  const totalU = totalCarritoUnidades();
  let totalPrecio = 0;

  lista.innerHTML = carrito.map((item, index) => {
    const pu = precioUnitarioPara(item.medidaId, item.materialTipo);
    const sub = pu != null ? Math.round(pu * item.cantidad) : null;
    if (sub != null) totalPrecio += sub;

    return `
      <div class="item-row">
        <div class="item-info">
          <span class="item-nombre">${item.nombre} <span class="item-qty">x${item.cantidad}</span></span>
          <span class="item-detail">${item.material} · ${item.tamano}</span>
          ${pu != null ? `<span class="item-precio-u">$${format(Math.round(pu))}/u</span>` : ""}
        </div>

        <div class="item-derecha">
          <div class="item-actions">
            <button onclick="restar(${index})">−</button>
            <button onclick="sumar(${index})">+</button>
            <button onclick="eliminar(${index})" class="btn-eliminar">✕</button>
          </div>
          ${sub != null ? `<span class="item-subtotal">$${format(sub)}</span>` : ""}
        </div>
      </div>
    `;
  }).join("");

  // badge de tramo activo
  const tier = carrito[0] ? getTier(carrito[0].medidaId, carrito[0].materialTipo) : null;
  const tramoHtml = tier
    ? `<div class="tramo-badge">Tramo activo: ${tier.cantidad}u — ${totalU} stickers en carrito</div>`
    : "";

  totalDiv.innerHTML = `
    ${tramoHtml}
    <div class="total-line">Total: $${format(Math.round(totalPrecio))}</div>
  `;

  // re-render modal si está abierto (precios pueden haber cambiado al agregar)
  if (window.renderModalIfOpen) window.renderModalIfOpen();

  actualizarBadge();
}

function actualizarBadge() {
  const badge = document.getElementById("carrito-badge");
  if (!badge) return;
  const total = totalCarritoUnidades();
  badge.textContent = total;
  badge.classList.toggle("visible", total > 0);
}

function irAlCarrito() {
  document.querySelector(".resumen .btn-primary")
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
}

(function initFloatObserver() {
  const btn = document.querySelector(".carrito-float");
  const resumen = document.querySelector(".resumen");
  if (!btn || !resumen) return;

  new IntersectionObserver(
    ([entry]) => btn.classList.toggle("oculto", entry.isIntersecting),
    { threshold: 0.2 }
  ).observe(resumen);
})();

// ========================
// ACCIONES
// ========================

function sumar(index) {
  carrito[index].cantidad++;
  guardar();
  render();
}

function restar(index) {
  carrito[index].cantidad--;
  if (carrito[index].cantidad <= 0) carrito.splice(index, 1);
  guardar();
  render();
}

function eliminar(index) {
  carrito.splice(index, 1);
  guardar();
  render();
}

function animarAgregado() {
  const resumen = document.querySelector(".resumen");
  if (!resumen) return;
  resumen.style.transform = "scale(1.02)";
  resumen.style.transition = "0.2s";
  setTimeout(() => resumen.style.transform = "scale(1)", 150);
}

// ========================
// ENVIAR PEDIDO
// ========================

function enviarPedido() {
  if (!carrito.length) return;

  let totalPrecio = 0;
  let mensaje = "Hola CAINA!\n\nQuiero pedir:\n";

  carrito.forEach(item => {
    const pu    = precioUnitarioPara(item.medidaId, item.materialTipo);
    const sub   = pu != null ? Math.round(pu * item.cantidad) : 0;
    totalPrecio += sub;

    mensaje += `- [Stickers ${item.material}] ${item.nombre}: ${item.tamano} x${item.cantidad} unidades ($${format(sub)})\n`;
  });

  mensaje += `\nTotal: $${format(Math.round(totalPrecio))}`;
  mensaje += "\n\n¿Me confirman precio y tiempos?";

  window.open(`https://wa.me/5491138454766?text=${encodeURIComponent(mensaje)}`);
}

// ========================
// EXPORTS
// ========================

window.getTotalCarritoUnidades = totalCarritoUnidades;
window.renderCarrito = render;
window.irAlCarrito = irAlCarrito;

// render inicial (puede no tener preciosDB todavía, se actualiza cuando catalogo.js termine)
render();
