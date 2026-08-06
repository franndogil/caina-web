let carrito = JSON.parse(localStorage.getItem("caina_carrito") || "[]");
const format = n => n.toLocaleString("es-AR");

// ========================
// PERSISTENCIA
// ========================

function guardar() {
  localStorage.setItem("caina_carrito", JSON.stringify(carrito));
}

// ========================
// TOTALES
// ========================

function totalCarritoUnidades() {
  return carrito.reduce((sum, i) => sum + i.cantidad, 0);
}

// ========================
// PEDIDO MÍNIMO
// ========================

// Reglas en js/config.js. El mínimo se cuenta por tipo sumando todas las
// unidades de ese tipo, así que se pueden combinar diseños distintos.

function reglasMinimo() {
  return (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.minimosPorTipo) || [];
}

// Los ítems guardados antes de esta versión no tienen tipoId. Para esos se cae
// al nombre del tipo, que el carrito ya venía guardando en `categoria`.
function esDelTipo(item, regla) {
  return item.tipoId != null ? item.tipoId === regla.idTipo : item.categoria === regla.nombre;
}

// Tipos presentes en el carrito que todavía no llegan a su mínimo.
// Un tipo sin unidades no cuenta: el mínimo solo aplica si se pidió algo de él.
function faltantesMinimo() {
  return reglasMinimo().reduce((acc, r) => {
    const actual = carrito.reduce((sum, i) => sum + (esDelTipo(i, r) ? i.cantidad : 0), 0);
    if (actual > 0 && actual < r.minimo) acc.push({ ...r, actual, faltan: r.minimo - actual });
    return acc;
  }, []);
}

// Unidades de un tipo ya cargadas en el carrito (lo usa el aviso del modal).
function unidadesDeTipo(idTipo) {
  const regla = reglasMinimo().find(r => r.idTipo === idTipo);
  if (!regla) return 0;
  return carrito.reduce((sum, i) => sum + (esDelTipo(i, regla) ? i.cantidad : 0), 0);
}

function textoFaltante(f) {
  const tipo = f.nombre.toLowerCase();
  const verbo = f.faltan === 1 ? "falta" : "faltan";
  return `Pedido mínimo: ${f.minimo} ${tipo} — te ${verbo} ${f.faltan}. Podés combinar diseños distintos.`;
}

// ========================
// AGREGAR AL CARRITO
// ========================

// precioUnitario: valor por unidad ya resuelto desde catalogo.js
function agregar(nombre, material, tamano, tamanioId, unidades, categoria, materialId, precioUnitario, tipoId) {
  const existente = carrito.find(
    i => i.nombre === nombre && i.material === material && i.tamano === tamano
  );

  if (existente) {
    existente.cantidad += unidades;
  } else {
    carrito.push({ nombre, material, tamano, tamanioId, cantidad: unidades, categoria, materialId, precioUnitario, tipoId });
  }

  guardar();
  render();
  animarAgregado();
}

// ========================
// RENDER
// ========================

function render() {
  const lista    = document.getElementById("lista");
  const totalDiv = document.getElementById("total");

  if (lista && totalDiv) {
    if (!carrito.length) {
      lista.innerHTML    = "No hay productos todavía";
      totalDiv.innerHTML = "";
    } else {
      const totalU = totalCarritoUnidades();
      let totalPrecio = 0;

      lista.innerHTML = carrito.map((item, index) => {
        const pu  = item.precioUnitario;
        const sub = pu != null ? Math.round(pu * item.cantidad) : null;
        if (sub != null) totalPrecio += sub;

        return `
          <div class="item-row">
            <div class="item-info">
              <span class="item-nombre">${item.nombre} <span class="item-qty">x${item.cantidad}</span></span>
              <span class="item-detail">${item.material} · ${item.tamano}</span>
              ${pu != null ? `<span class="item-precio-u">$${format(Math.round(pu))}/u</span>` : ""}
            </div>

            ${sub != null ? `<span class="item-subtotal">$${format(sub)}</span>` : ""}

            <div class="item-actions">
              <button class="btn-accion" onclick="restar(${index})">−</button>
              <button class="btn-accion" onclick="sumar(${index})">+</button>
              <button class="btn-accion btn-eliminar" onclick="eliminar(${index})">✕</button>
            </div>
          </div>
        `;
      }).join("");

      const faltantes = faltantesMinimo();

      totalDiv.innerHTML = `
        <div class="total-line">${totalU} unidades · Total: $${format(Math.round(totalPrecio))}</div>
        ${faltantes.map(f => `<p class="aviso-minimo">${textoFaltante(f)}</p>`).join("")}
      `;
    }
  }

  actualizarBotonEnviar();
  if (window.renderModalIfOpen) window.renderModalIfOpen();
  actualizarBadge();
}

// El botón queda apagado mientras falte algún mínimo, pero sigue siendo
// clickeable: el click resalta el aviso en vez de no hacer nada.
function actualizarBotonEnviar() {
  const btn = document.querySelector(".resumen .btn-primary");
  if (!btn) return;
  btn.classList.toggle("btn-primary--bloqueado", carrito.length > 0 && faltantesMinimo().length > 0);
}

function actualizarBadge() {
  const badge = document.getElementById("carrito-badge");
  const btn = document.querySelector(".carrito-float");
  if (!badge) return;
  const total = totalCarritoUnidades();
  badge.textContent = total;
  badge.classList.toggle("visible", total > 0);
  if (btn) {
    if (total > 0) {
      btn.style.display = "flex";
      btn.style.opacity = "1";
      btn.style.visibility = "visible";
      btn.style.pointerEvents = "auto";
    } else {
      btn.style.display = "none";
      btn.style.opacity = "0";
      btn.style.visibility = "hidden";
      btn.style.pointerEvents = "none";
    }
  }
}

function irAlCarrito() {
  document.querySelector(".resumen .btn-primary")
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
}

(function initFloatObserver() {
  const btn    = document.querySelector(".carrito-float");
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
  if (resumen) {
    resumen.style.transform  = "scale(1.02)";
    resumen.style.transition = "0.2s";
    setTimeout(() => (resumen.style.transform = "scale(1)"), 150);
  }

  const btn = document.querySelector(".carrito-float");
  if (btn) {
    btn.style.display = "flex";
    btn.style.animation = "slideUp 0.4s ease-out";
  }
}

// ========================
// ENVIAR PEDIDO
// ========================

function enviarPedido() {
  if (!carrito.length) return;

  // Mínimo sin cumplir: no se manda nada, se resalta el aviso del resumen.
  if (faltantesMinimo().length) {
    const aviso = document.querySelector(".aviso-minimo");
    if (aviso) {
      aviso.scrollIntoView({ behavior: "smooth", block: "center" });
      aviso.classList.remove("aviso-minimo--flash");
      void aviso.offsetWidth;                      // reinicia la animación si ya estaba
      aviso.classList.add("aviso-minimo--flash");
    }
    return;
  }

  let totalPrecio = 0;
  let mensaje = "Hola *CAINA*!\n\nQuiero pedir:\n";

  carrito.forEach(item => {
    const pu  = item.precioUnitario;
    const sub = pu != null ? Math.round(pu * item.cantidad) : 0;
    totalPrecio += sub;
    mensaje += `* *[${item.categoria} ${item.material}]* ${item.nombre}: ${item.tamano} x${item.cantidad}u ($${format(sub)})\n`;
  });

  mensaje += `\n*Total estimado: $${format(Math.round(totalPrecio))}*`;
  mensaje += "\n\n¿Me confirman precio y tiempos?";

  window.open(`https://wa.me/5491164365924?text=${encodeURIComponent(mensaje)}`);
}

// ========================
// AUTO-INYECCIÓN DEL BOTÓN
// ========================

(function injectCarritoFloat() {
  if (document.querySelector(".carrito-float")) return;

  const enPedido = window.location.pathname.includes("pedido");
  const el = enPedido
    ? Object.assign(document.createElement("button"), { className: "carrito-float", onclick: irAlCarrito })
    : Object.assign(document.createElement("a"),      { className: "carrito-float", href: "/pedido.html#resumen" });

  el.setAttribute("aria-label", "Ver pedido");
  el.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <path d="M16 10a4 4 0 0 1-8 0"/>
    </svg>
    Ver pedido
    <span class="carrito-float-badge" id="carrito-badge"></span>
  `;
  document.body.appendChild(el);
})();

// ========================
// EXPORTS
// ========================

window.getTotalCarritoUnidades = totalCarritoUnidades;
window.unidadesDeTipo          = unidadesDeTipo;
window.renderCarrito           = render;
window.irAlCarrito             = irAlCarrito;

render();
