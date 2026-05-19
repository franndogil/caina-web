import { supabase, getUserSession } from './auth.js';

console.log('✅ 1. Script variantes.js cargado.');

// --- ELEMENTOS DEL DOM ---
const variantsList = document.getElementById('variants-list');
const filterInput = document.getElementById('filter-text');
let allVariantsData = [];

// --- FUNCIONES ---

async function loadAllVariants() {
    console.log('▶️ 2. Entrando en loadAllVariants...');
    variantsList.innerHTML = '<tr><td colspan="5">Cargando variantes desde la base de datos...</td></tr>';

    try {
        const query = `
            id_variante,
            stock,
            producto:id_producto (nombre),
            material:id_material (id_material, nombre_material),
            tamanio:id_tamanio (id_tamanio, valor, unidad)
        `;
        console.log('🔎 3. Ejecutando la consulta SELECT a la tabla "variante" con el siguiente query:', query);

        const { data: variants, error } = await supabase.from('variante').select(query);

        if (error) {
            // Si Supabase devuelve un error, lo lanzamos para que el CATCH lo capture.
            console.error('❌ 4. ¡ERROR en la consulta SELECT!', error);
            throw error;
        }

        console.log('✔️ 5. Consulta SELECT completada. Se encontraron', variants.length, 'variantes.');
        // console.log('Datos de variantes recibidos:', variants); // Descomenta esto si quieres ver los datos crudos

        if (variants.length === 0) {
            variantsList.innerHTML = `<tr><td colspan="5">La consulta funcionó, pero no se encontraron variantes en la base de datos.</td></tr>`;
            return;
        }

        console.log('▶️ 6. Calculando precios... Creando promesas para la función RPC.');
        const pricePromises = variants.map(v => supabase.rpc('calcular_precio_variante', {
            p_material_id: v.material.id_material,
            p_tamanio_id: v.tamanio.id_tamanio
        }));
        
        const priceResults = await Promise.all(pricePromises);
        console.log('✔️ 7. Todos los precios han sido calculados (o han fallado).');

        allVariantsData = variants.map((variant, index) => ({
            ...variant,
            calculated_price: priceResults[index].data,
            price_error: priceResults[index].error,
        }));
        
        console.log('▶️ 8. Renderizando la tabla con los datos finales.');
        renderTable(allVariantsData);
        console.log('✔️ 9. Renderizado completo.');

    } catch (e) {
        console.error('💥💥💥 CATCH GLOBAL: La ejecución se detuvo por un error catastrófico.', e);
        variantsList.innerHTML = `<tr><td colspan="5"><strong>Error fatal:</strong> ${e.message}. Revisa la consola para más detalles.</td></tr>`;
    }
}

function renderTable(dataToRender) {
    // ... esta función no tiene cambios, pero la incluyo para que sea un solo bloque ...
    variantsList.innerHTML = '';
    if (dataToRender.length === 0) {
        variantsList.innerHTML = '<tr><td colspan="5">No hay resultados para la búsqueda.</td></tr>';
        return;
    }
    dataToRender.forEach(variant => {
        const row = document.createElement('tr');
        const productName = variant.producto.nombre;
        const materialName = variant.material.nombre_material;
        const sizeName = variant.tamanio.unidad ? `${variant.tamanio.valor} ${variant.tamanio.unidad}` : variant.tamanio.valor;
        const price = typeof variant.calculated_price === 'number'
            ? `$${variant.calculated_price.toFixed(2)}`
            : `Inválido (sin regla)`;
        row.innerHTML = `
            <td>${productName}</td>
            <td>${materialName} / ${sizeName}</td>
            <td>${price}</td>
            <td><input type="number" class="stock-input" value="${variant.stock}" data-variant-id="${variant.id_variante}"></td>
            <td><button class="save-stock-btn" data-variant-id="${variant.id_variante}">Guardar Stock</button></td>
        `;
        variantsList.appendChild(row);
    });
}

// ... El resto de funciones (handleSaveStock, handleFilter, etc.) no cambian ...
async function handleSaveStock(variantId) {
    const button = variantsList.querySelector(`.save-stock-btn[data-variant-id="${variantId}"]`);
    const input = variantsList.querySelector(`.stock-input[data-variant-id="${variantId}"]`);
    button.textContent = '...'; button.disabled = true;
    const { error } = await supabase.from('variante').update({ stock: input.value }).eq('id_variante', variantId);
    if (error) { alert(`Error al actualizar stock: ${error.message}`); }
    button.textContent = 'Guardar Stock'; button.disabled = false;
}
function handleFilter() {
    const searchTerm = filterInput.value.toLowerCase();
    const filteredData = allVariantsData.filter(variant => {
        const productName = variant.producto.nombre.toLowerCase();
        const materialName = variant.material.nombre_material.toLowerCase();
        return productName.includes(searchTerm) || materialName.includes(searchTerm);
    });
    renderTable(filteredData);
}

// --- INICIALIZACIÓN ---
(async () => {
    console.log('▶️ INICIO: Verificando sesión de usuario...');
    if (!await getUserSession()) {
        console.log('❌ No hay sesión, redirigiendo a login.html');
        window.location.href = 'login.html';
        return;
    }
    console.log('✔️ Sesión de usuario verificada.');
    
    await loadAllVariants();
    
    console.log('▶️ Asignando eventos de input y click.');
    filterInput.addEventListener('input', handleFilter);
    variantsList.addEventListener('click', (event) => {
        if (event.target.classList.contains('save-stock-btn')) {
            handleSaveStock(event.target.dataset.variantId);
        }
    });
})();