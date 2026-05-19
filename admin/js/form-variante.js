import { supabase } from './auth.js';
import { getUserSession } from './auth.js';

// --- Elementos del DOM ---
const form = document.getElementById('variant-form');
const stockInput = document.getElementById('stock');
const materialsCheckboxes = document.getElementById('materials-checkboxes');
const sizesCheckboxes = document.getElementById('sizes-checkboxes');
const feedbackMessage = document.getElementById('feedback-message');
const backLink = document.getElementById('back-link');

// Obtenemos el ID de la variante desde la URL
const urlParams = new URLSearchParams(window.location.search);
const variantId = urlParams.get('id');

// Función genérica para cargar catálogos como checkboxes
async function loadCheckboxes(container, tableName, nameField, idField, selectedIds = []) {
    const { data, error } = await supabase.from(tableName).select('*');
    if (error) { console.error(`Error cargando ${tableName}`, error); return; }
    
    container.innerHTML = '';
    data.forEach(item => {
        const id = item[idField];
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = id;
        checkbox.checked = selectedIds.includes(id);
        
        label.appendChild(checkbox);
        label.append(` ${item[nameField]}`);
        container.appendChild(label);
    });
}

// Carga los datos iniciales de la variante
async function loadVariantData() {
    if (!variantId) {
        document.body.innerHTML = '<h1>Error: No se especificó un ID de variante.</h1>';
        return;
    }

    const { data, error } = await supabase
        .from('variante')
        .select(`
            *,
            variante_usa_material(id_material),
            variante_usa_tamanio(id_tamanio)
        `)
        .eq('id_variante', variantId)
        .single();

    if (error) {
        console.error('Error cargando la variante', error);
        return;
    }

    // Rellenamos el stock y actualizamos el enlace de "volver"
    stockInput.value = data.stock;
    backLink.href = `form-producto.html?id=${data.id_producto}`;

    // Obtenemos los IDs ya seleccionados
    const selectedMaterialIds = data.variante_usa_material.map(m => m.id_material);
    const selectedSizeIds = data.variante_usa_tamanio.map(t => t.id_tamanio);

    // Cargamos los checkboxes, marcando los que ya estaban seleccionados
    await loadCheckboxes(materialsCheckboxes, 'material', 'nombre_material', 'id_material', selectedMaterialIds);
    await loadCheckboxes(sizesCheckboxes, 'tamanio', 'valor', 'id_tamanio', selectedSizeIds);
}

// Maneja el guardado del formulario
form.addEventListener('submit', async (event) => {
    event.preventDefault();
    feedbackMessage.textContent = 'Guardando...';

    // 1. Actualizar el stock
    const { error: stockError } = await supabase
        .from('variante')
        .update({ stock: stockInput.value })
        .eq('id_variante', variantId);

    if (stockError) { feedbackMessage.textContent = `Error: ${stockError.message}`; return; }
    
    // 2. Manejar las relaciones N:M (borrar y volver a crear)
    const handleManyToMany = async (joinTable, joinColumn, checkboxContainer) => {
        // Borramos todas las entradas viejas para esta variante
        await supabase.from(joinTable).delete().eq('id_variante', variantId);
        
        // Creamos las nuevas entradas
        const selectedIds = Array.from(checkboxContainer.querySelectorAll('input:checked')).map(cb => cb.value);
        if (selectedIds.length > 0) {
            const newRelations = selectedIds.map(id => ({ id_variante: variantId, [joinColumn]: id }));
            const { error } = await supabase.from(joinTable).insert(newRelations);
            if (error) throw error;
        }
    };

    try {
        await handleManyToMany('variante_usa_material', 'id_material', materialsCheckboxes);
        await handleManyToMany('variante_usa_tamanio', 'id_tamanio', sizesCheckboxes);
        
        feedbackMessage.textContent = '¡Variante guardada con éxito!';
        setTimeout(() => { window.location.href = backLink.href; }, 1500);

    } catch (error) {
        console.error('Error guardando relaciones:', error);
        feedbackMessage.textContent = `Error: ${error.message}`;
    }
});


// --- Carga inicial ---
(async () => {
    if (!await getUserSession()) {
        window.location.href = 'login.html';
    } else {
        await loadVariantData();
    }
})();