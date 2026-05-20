import { supabase } from '../auth.js';

// --- Elementos del DOM ---
const pricesList = document.getElementById('prices-list');
const addPriceForm = document.getElementById('add-price-form');
const newPriceValueInput = document.getElementById('new-price-value');
const priceTipoSelect = document.getElementById('price-tipo-select');
const priceMaterialSelect = document.getElementById('price-material-select');
const priceTamanioSelect = document.getElementById('price-tamanio-select');

// --- Datos cacheados ---
let tiposCache = [];
let materialesCache = [];
let tamaniosCache = [];

// --- Función de Inicialización ---
export async function initPrices() {
    // 1. Cargar datos de los catálogos para usarlos en los formularios
    await loadCatalogsToCache();
    populateSelect(priceTipoSelect, tiposCache, 'nombre_tipo', 'id_tipo', 'Asociar a un Tipo');
    populateSelect(priceMaterialSelect, materialesCache, 'nombre_material', 'id_material', 'Asociar a un Material');
    populateSelect(priceTamanioSelect, tamaniosCache, 'valor', 'id_tamanio', 'Asociar a un Tamaño');

    // 2. Cargar la lista de precios inicial
    await loadPrices();

    // 3. Asignar los manejadores de eventos
    addPriceForm.addEventListener('submit', handleCreate);
    pricesList.addEventListener('click', handleListClick);
}

// --- Lógica de Carga y UI ---

async function loadCatalogsToCache() {
    const [tipos, materiales, tamanios] = await Promise.all([
        supabase.from('tipo').select('*'),
        supabase.from('material').select('*'),
        supabase.from('tamanio').select('*')
    ]);

    tiposCache = tipos.data || [];
    materialesCache = materiales.data || [];
    tamaniosCache = tamanios.data || [];

    // Ordenar tamaños
    tamaniosCache.sort((a, b) => {
        if (a.unidad !== b.unidad) {
            return a.unidad.localeCompare(b.unidad);
        }

        function getValue(valor) {
            valor = valor.trim();

            if (valor.includes('x')) {
                const [ancho, alto] = valor
                    .split('x')
                    .map(n => parseFloat(n.trim()));

                return ancho * alto;
            }

            return parseFloat(valor);
        }

        return getValue(a.valor) - getValue(b.valor);
    });
}

function populateSelect(selectElement, data, nameField, idField, defaultText) {

    selectElement.innerHTML = `<option value="">${defaultText}</option>`;

    data.forEach(item => {
        const option = document.createElement('option');

        option.value = item[idField];

        let displayText = item[nameField] || item.valor;

        if (item.unidad) {
            displayText = `${item.valor} ${item.unidad}`;
        }

        option.textContent = displayText;
        selectElement.appendChild(option);
    });
}

async function loadPrices() {
    const { data: prices, error } = await supabase
        .from('precio')
        .select(`
            id_precio,
            valor,
            precio_usa_tipo(
                tipo(
                    id_tipo,
                    nombre_tipo
                )
            ),
            precio_usa_material(
                material(
                    id_material,
                    nombre_material
                )
            ),
            precio_usa_tamanio(
                tamanio(
                    id_tamanio,
                    valor,
                    unidad
                )
            )
        `);

    if (error) {
        console.error('Error cargando precios:', error);
        return;
    }

    pricesList.innerHTML = '';

    prices.forEach(price => {
        const tipo = price.precio_usa_tipo?.[0]?.tipo;
        const material = price.precio_usa_material?.[0]?.material;
        const tamanio = price.precio_usa_tamanio?.[0]?.tamanio;

        const li = document.createElement('li');

        li.dataset.id = price.id_precio;
        li.dataset.tipoId = tipo?.id_tipo || '';
        li.dataset.materialId = material?.id_material || '';
        li.dataset.tamanioId = tamanio?.id_tamanio || '';

        li.innerHTML = `
            <span class="text">
                <strong>$${price.valor}</strong>
                ${tipo ? `(Tipo: ${tipo.nombre_tipo})` : ''}
                ${material ? `(Material: ${material.nombre_material})` : ''}
                ${tamanio ? `(Tamaño: ${tamanio.valor} ${tamanio.unidad})` : ''}
            </span>

            <div class="actions">
                <button class="edit-btn">Modificar</button>
                <button class="delete-btn">Eliminar</button>
            </div>
        `;

        pricesList.appendChild(li);
    });
}

// --- Lógica de Eventos y CRUD ---

async function handleCreate(e) {
    e.preventDefault();
    const valor = newPriceValueInput.value;
    const tipoId = priceTipoSelect.value || null;
    const materialId = priceMaterialSelect.value || null;
    const tamanioId = priceTamanioSelect.value || null;

    if (!valor || (!tipoId && !materialId && !tamanioId)) {
        alert('Error: El precio debe tener un valor y estar asociado al menos a un atributo.');
        return;
    }

    const { data: newPrice, error: priceError } = await supabase.from('precio').insert([{ valor: valor }]).select().single();
    if (priceError) { alert(`Error al crear el precio base: ${priceError.message}`); return; }
    
    const newPriceId = newPrice.id_precio;

    try {
        if (tipoId) await supabase.from('precio_usa_tipo').insert([{ id_precio: newPriceId, id_tipo: tipoId }]);
        if (materialId) await supabase.from('precio_usa_material').insert([{ id_precio: newPriceId, id_material: materialId }]);
        if (tamanioId) await supabase.from('precio_usa_tamanio').insert([{ id_precio: newPriceId, id_tamanio: tamanioId }]);
        
        addPriceForm.reset();
        await loadPrices();
    } catch (error) {
        await supabase.from('precio').delete().eq('id_precio', newPriceId); // Limpieza en caso de error
        alert(`Error al crear las asociaciones del precio: ${error.message}`);
    }
}

function handleListClick(event) {
    const target = event.target;
    const li = target.closest('li');
    if (!li) return;
    const id = li.dataset.id;

    if (target.classList.contains('delete-btn')) { deletePrice(id); }
    if (target.classList.contains('edit-btn')) { showEditForm(li); }
    if (target.classList.contains('save-btn')) { updatePrice(id, li); }
    if (target.classList.contains('cancel-btn')) { loadPrices(); }
}

function showEditForm(li) {
    const id = li.dataset.id;
    const currentValor = li.querySelector('.text strong').innerText.replace('$', '');
    const currentTipoId = li.dataset.tipoId;
    const currentMaterialId = li.dataset.materialId;
    const currentTamanioId = li.dataset.tamanioId;

    li.innerHTML = `
        <div class="edit-form">
            <input type="number" value="${currentValor}" class="edit-valor" step="0.01">
            <select class="edit-tipo"></select>
            <select class="edit-material"></select>
            <select class="edit-tamanio"></select>
            <div class="actions">
                <button class="save-btn">Guardar</button>
                <button class="cancel-btn">Cancelar</button>
            </div>
        </div>
    `;
    
    // Rellenamos y seleccionamos los valores en los nuevos <select>
    const tipoSelect = li.querySelector('.edit-tipo');
    populateSelect(tipoSelect, tiposCache, 'nombre_tipo', 'id_tipo', 'Sin Tipo');
    tipoSelect.value = currentTipoId;

    const materialSelect = li.querySelector('.edit-material');
    populateSelect(materialSelect, materialesCache, 'nombre_material', 'id_material', 'Sin Material');
    materialSelect.value = currentMaterialId;

    const tamanioSelect = li.querySelector('.edit-tamanio');
    populateSelect(tamanioSelect, tamaniosCache, 'valor', 'id_tamanio', 'Sin Tamaño');
    tamanioSelect.value = currentTamanioId;
}

async function updatePrice(id, li) {
    const valor = li.querySelector('.edit-valor').value;
    const tipoId = li.querySelector('.edit-tipo').value || null;
    const materialId = li.querySelector('.edit-material').value || null;
    const tamanioId = li.querySelector('.edit-tamanio').value || null;

    if (!valor || (!tipoId && !materialId && !tamanioId)) {
        alert('El precio debe tener un valor y al menos un atributo asociado.');
        return;
    }
    
    // Usamos una transacción para asegurar la consistencia de los datos
    const { error } = await supabase.rpc('update_price_with_relations', {
        p_price_id: id,
        p_valor: valor,
        p_tipo_id: tipoId,
        p_material_id: materialId,
        p_tamanio_id: tamanioId
    });

    if (error) {
        alert(`Error al actualizar el precio: ${error.message}`);
    } else {
        await loadPrices();
    }
}

async function deletePrice(id) {
    if (confirm(`¿Eliminar regla de precio ID ${id}? Esto borrará sus asociaciones.`)) {
        // Al tener "ON DELETE CASCADE" en las FK, solo necesitamos borrar el precio principal.
        const { error } = await supabase.from('precio').delete().eq('id_precio', id);
        if (error) { alert(`Error al eliminar: ${error.message}`); }
        else { await loadPrices(); }
    }
}