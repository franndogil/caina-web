import { supabase, getUserSession } from './auth.js';

// --- ELEMENTOS DEL DOM ---
const form = document.getElementById('product-form');
const formTitle = document.getElementById('form-title');
const productNameInput = document.getElementById('product-name');
const productDescriptionInput = document.getElementById('product-description');
const productTypeSelect = document.getElementById('product-type');
const productMaterialsContainer = document.getElementById('product-materials');
const productSizesContainer = document.getElementById('product-sizes');
const productCategoriesContainer = document.getElementById('product-categories');
const saveButton = document.getElementById('save-product-button');
const editModeNotice = document.getElementById('edit-mode-notice');

// --- ESTADO ---
let productId = new URLSearchParams(window.location.search).get('id');
const isEditMode = !!productId;

// --- FUNCIONES DE AYUDA ---

function populateSelect(selectElement, data, nameField, idField, defaultText = null) {
    if (defaultText) {
        selectElement.innerHTML = `<option value="">${defaultText}</option>`;
    } else {
        selectElement.innerHTML = '';
    }
    data.forEach(item => {
        const option = document.createElement('option');
        option.value = item[idField];
        option.textContent = item[nameField] || item.valor;
        selectElement.appendChild(option);
    });
}

function populateCheckboxGroup(container, data, nameField, idField, groupName) {
    container.innerHTML = '';
    data.forEach(item => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.name = groupName;
        checkbox.value = item[idField];
        
        label.appendChild(checkbox);
        // El espacio se añade con CSS o un simple string, no con textNode aquí para simplicidad.
        label.append(` ${item[nameField] || item.valor}`);
        container.appendChild(label);
    });
}

function getCheckedIds(container) {
    return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
}

// --- LÓGICA PRINCIPAL ---

async function loadFormData() {
    const [tipos, materiales, tamanos, categorias] = await Promise.all([
        supabase.from('tipo').select('*'),
        supabase.from('material').select('*'),
        supabase.from('tamanio').select('*'),
        supabase.from('categoria').select('*')
    ]);

    populateSelect(productTypeSelect, tipos.data, 'nombre_tipo', 'id_tipo', 'Selecciona un tipo...');
    populateCheckboxGroup(productMaterialsContainer, materiales.data, 'nombre_material', 'id_material', 'materials');
    populateCheckboxGroup(productSizesContainer, tamanos.data, 'valor', 'id_tamanio', 'sizes');
    populateCheckboxGroup(productCategoriesContainer, categorias.data, 'nombre_categoria', 'id_categoria', 'categories');
}

async function loadProductForEdit() {
    if (!isEditMode) return;

    formTitle.textContent = 'Editar Producto';
    editModeNotice.style.display = 'block';
    productMaterialsContainer.querySelectorAll('input').forEach(cb => cb.disabled = true);
    productSizesContainer.querySelectorAll('input').forEach(cb => cb.disabled = true);
    saveButton.textContent = 'Guardar Cambios';

    const { data: product, error } = await supabase
        .from('producto')
        .select(`*, producto_pertenece_categoria(id_categoria)`)
        .eq('id_producto', productId)
        .single();

    if (error) {
        alert('Error cargando el producto para editar.');
        console.error(error);
        return;
    }

    productNameInput.value = product.nombre;
    productDescriptionInput.value = product.descripcion;
    productTypeSelect.value = product.id_tipo;

    const categoryIds = product.producto_pertenece_categoria.map(cat => cat.id_categoria.toString());
    productCategoriesContainer.querySelectorAll('input').forEach(cb => {
        if (categoryIds.includes(cb.value)) {
            cb.checked = true;
        }
    });
}

async function handleFormSubmit(e) {
    e.preventDefault();
    saveButton.disabled = true;
    saveButton.textContent = 'Guardando...';

    try {
        const productData = {
            nombre: productNameInput.value,
            descripcion: productDescriptionInput.value,
            id_tipo: productTypeSelect.value
        };

        let savedProduct;
        if (isEditMode) {
            const { data, error } = await supabase.from('producto').update(productData).eq('id_producto', productId).select().single();
            if (error) throw error;
            savedProduct = data;
        } else {
            const { data, error } = await supabase.from('producto').insert(productData).select().single();
            if (error) throw error;
            savedProduct = data;
        }
        
        const currentProductId = savedProduct.id_producto;

        const selectedCategoryIds = getCheckedIds(productCategoriesContainer).map(Number);
        await supabase.from('producto_pertenece_categoria').delete().eq('id_producto', currentProductId);
        if (selectedCategoryIds.length > 0) {
            const categoryRelations = selectedCategoryIds.map(id => ({ id_producto: currentProductId, id_categoria: id }));
            const { error: insertCatError } = await supabase.from('producto_pertenece_categoria').insert(categoryRelations);
            if (insertCatError) throw insertCatError;
        }

        if (!isEditMode) {
            const selectedMaterialIds = getCheckedIds(productMaterialsContainer);
            const selectedSizeIds = getCheckedIds(productSizesContainer);
            if (selectedMaterialIds.length === 0 || selectedSizeIds.length === 0) {
                throw new Error("Debes seleccionar al menos un material y un tamaño para generar variantes.");
            }

            const variantesACrear = [];
            for (const materialId of selectedMaterialIds) {
                for (const sizeId of selectedSizeIds) {
                    variantesACrear.push({ id_producto: currentProductId, id_material: materialId, id_tamanio: sizeId, stock: 0 });
                }
            }
            
            if (variantesACrear.length > 0) {
                const { error: variantError } = await supabase.from('variante').insert(variantesACrear);
                if (variantError) throw variantError;
            }
        }

        alert(`¡Producto ${isEditMode ? 'actualizado' : 'creado'} con éxito!`);
        window.location.href = 'panel.html';

    } catch (error) {
        console.error("Error al guardar el producto:", error);
        alert(`Se ha producido un error: ${error.message}`);
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = isEditMode ? 'Guardar Cambios' : 'Guardar Producto y Generar Variantes';
    }
}

// --- INICIALIZACIÓN ---
(async () => {
    if (!await getUserSession()) {
        window.location.href = 'login.html';
        return;
    }

    form.addEventListener('submit', handleFormSubmit);
    await loadFormData();
    await loadProductForEdit();
})();