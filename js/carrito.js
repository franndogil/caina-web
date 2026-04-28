let carrito = [];
const format = n => n.toLocaleString("es-AR");

function agregar(nombre, detalle, precio) {
  const item = carrito.find(p => p.nombre === nombre && p.detalle === detalle);

  if (item) {
    item.cantidad++;
  } else {
    carrito.push({ nombre, detalle, precio, cantidad: 1 });
  }

  render();
  animarAgregado();
}

function animarAgregado() {
  const resumen = document.querySelector(".resumen");

  resumen.style.transform = "scale(1.02)";
  resumen.style.transition = "0.2s";

  setTimeout(() => {
    resumen.style.transform = "scale(1)";
  }, 150);
}

function render() {
  const lista = document.getElementById("lista");
  const totalDiv = document.getElementById("total");

  if (carrito.length === 0) {
    lista.innerHTML = "No hay productos todavía";
    totalDiv.innerHTML = "";
    return;
  }

  let total = 0;

  lista.innerHTML = carrito.map((item, index) => {
    const sub = item.precio * item.cantidad;
    total += sub;

    return `
      <div class="item-row">
        <div class="item-info">
          ${item.nombre} - ${item.detalle}
          <span>($${format(sub)})</span>
        </div>

        <div class="item-actions">
          <button onclick="restar(${index})">−</button>
          <span>${item.cantidad}</span>
          <button onclick="sumar(${index})">+</button>
          <button onclick="eliminar(${index})">✕</button>
        </div>
      </div>
    `;
  }).join("");

  totalDiv.innerHTML = `Total: $${format(total)}`;
}

function sumar(index) {
  carrito[index].cantidad++;
  render();
}

function restar(index) {
  carrito[index].cantidad--;

  if (carrito[index].cantidad <= 0) {
    carrito.splice(index, 1);
  }

  render();
}

function eliminar(index) {
  carrito.splice(index, 1);
  render();
}

function enviarPedido() {
  let mensaje = "Hola CAINA! \n\nQuiero pedir:\n";
  let total = 0;

  carrito.forEach(item => {
    const sub = item.precio * item.cantidad;
    total += sub;
    mensaje += `- ${item.nombre}: ${item.detalle} x${item.cantidad} unidades ($${format(sub)})\n`;
  });

  mensaje += `\nTotal: $${format(total)}`;
  mensaje += "\n\n¿Me confirman precio y tiempos?";

  window.open(`https://wa.me/5491138454766?text=${encodeURIComponent(mensaje)}`);
}
