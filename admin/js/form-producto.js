import { supabase, getUserSession } from './auth.js';
import { showToast } from './toast.js';

// --- ELEMENTOS DEL DOM ---
const form = document.getElementById('product-form');
const formTitle = document.getElementById('form-title');
const productNameInput = document.getElementById('product-name');
const productDescriptionInput = document.getElementById('product-description');
const productTypeSelect = document.getElementById('product-type');
const productMaterialsContainer = document.getElementById('product-materials');
const productSizesContainer = document.getElementById('product-sizes');
const productCategoriesContainer = document.getElementById('product-categories');
const productNovedadCheckbox = document.getElementById('product-novedad');
const saveButton = document.getElementById('save-product-button');
const editModeNotice = document.getElementById('edit-mode-notice');
const imagesGrid = document.getElementById('images-grid');
const imageInput = document.getElementById('image-input');

// --- ESTADO ---
let productId = new URLSearchParams(window.location.search).get('id');
const isEditMode = !!productId;
let allSizes = [];
let allMaterials = [];
let existingVariants = [];

// imageItems: { type: 'existing'|'new', id?: number, path?: string, blob?: Blob, previewUrl: string }
let imageItems = [];
let dragSrcIndex = null;

// --- HELPERS GENERALES ---

function sortSizes(sizes) {
    return [...sizes].sort((a, b) => {
        if ((a.unidad || '') !== (b.unidad || '')) return (a.unidad || '').localeCompare(b.unidad || '');
        const getVal = v => v.trim().includes('x')
            ? v.trim().split('x').reduce((acc, n) => acc * parseFloat(n), 1)
            : parseFloat(v);
        return getVal(a.valor) - getVal(b.valor);
    });
}

function sizeLabel(s) { return s.unidad ? `${s.valor} ${s.unidad}` : s.valor; }

function populateSelect(selectElement, data, nameField, idField, defaultText = null) {
    selectElement.innerHTML = defaultText ? `<option value="">${defaultText}</option>` : '';
    data.forEach(item => {
        const option = document.createElement('option');
        option.value = item[idField];
        option.textContent = item[nameField] || item.valor;
        selectElement.appendChild(option);
    });
}

function populateCheckboxGroup(container, items, idField, groupName, labelFn, checkedIds = new Set()) {
    container.innerHTML = '';
    items.forEach(item => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.name = groupName;
        checkbox.value = item[idField];
        checkbox.checked = checkedIds.has(item[idField]);
        label.appendChild(checkbox);
        label.append(` ${labelFn(item)}`);
        container.appendChild(label);
    });
}

function setPlaceholder(container, text) {
    container.innerHTML = `<p style="opacity:0.5;font-size:0.9em;padding:.25rem 0;">${text}</p>`;
}

function getCheckedIds(container) {
    return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
}

// --- IMÁGENES ---

async function convertToWebP(file, maxWidth = 1400, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            let w = img.naturalWidth;
            let h = img.naturalHeight;
            if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            canvas.toBlob(blob => { URL.revokeObjectURL(url); resolve(blob); }, 'image/webp', quality);
        };
        img.onerror = reject;
        img.src = url;
    });
}

function renderImageGrid() {
    imagesGrid.innerHTML = '';

    imageItems.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'image-card';
        card.draggable = true;
        card.dataset.index = index;

        card.innerHTML = `
            <img src="${item.previewUrl}" alt="Imagen ${index + 1}">
            <button type="button" class="image-remove-btn" title="Eliminar">✕</button>
            <span class="image-order-badge">${index + 1}</span>
        `;

        card.addEventListener('dragstart', () => {
            dragSrcIndex = index;
            setTimeout(() => card.classList.add('dragging'), 0);
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            imagesGrid.querySelectorAll('.image-card').forEach(c => c.classList.remove('drag-over'));
        });
        card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('drag-over'); });
        card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
        card.addEventListener('drop', e => {
            e.preventDefault();
            card.classList.remove('drag-over');
            if (dragSrcIndex === null || dragSrcIndex === index) return;
            const [moved] = imageItems.splice(dragSrcIndex, 1);
            imageItems.splice(index, 0, moved);
            dragSrcIndex = null;
            renderImageGrid();
        });

        card.querySelector('.image-remove-btn').addEventListener('click', () => {
            if (item.type === 'new') URL.revokeObjectURL(item.previewUrl);
            imageItems.splice(index, 1);
            renderImageGrid();
        });

        imagesGrid.appendChild(card);
    });

    // Botón agregar
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'image-add-card';
    addBtn.innerHTML = `<span class="image-add-icon">+</span><span>Agregar imagen</span>`;
    addBtn.addEventListener('click', () => imageInput.click());
    imagesGrid.appendChild(addBtn);
}

async function handleImageSelect(files) {
    const converting = document.createElement('div');
    converting.className = 'image-converting';
    converting.textContent = 'Convirtiendo...';
    imagesGrid.insertBefore(converting, imagesGrid.lastElementChild);

    for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const blob = await convertToWebP(file);
        const previewUrl = URL.createObjectURL(blob);
        imageItems.push({ type: 'new', blob, previewUrl });
    }

    imageInput.value = '';
    renderImageGrid();
}

async function loadExistingImages() {
    if (!isEditMode) return;
    const { data, error } = await supabase
        .from('imagen_producto')
        .select('*')
        .eq('id_producto', productId)
        .order('orden');
    if (error) { console.error('Error cargando imágenes:', error); return; }

    imageItems = (data || []).map(img => {
        const { data: urlData } = supabase.storage.from('productos').getPublicUrl(img.path_imagen);
        return { type: 'existing', id: img.id_imagen, path: img.path_imagen, previewUrl: urlData.publicUrl };
    });
    renderImageGrid();
}

async function saveImages(productId) {
    // 1. Subir imágenes nuevas y obtener sus paths
    for (const item of imageItems) {
        if (item.type !== 'new') continue;
        const filename = `${productId}/${Date.now()}_${Math.random().toString(36).slice(2)}.webp`;
        const { error } = await supabase.storage
            .from('productos')
            .upload(filename, item.blob, { contentType: 'image/webp', upsert: false });
        if (error) throw error;
        item.path = filename;
    }

    // 2. En modo edición, eliminar del storage las imágenes que se quitaron
    if (isEditMode) {
        const { data: dbImages } = await supabase
            .from('imagen_producto').select('path_imagen').eq('id_producto', productId);
        const keepPaths = new Set(imageItems.filter(i => i.type === 'existing').map(i => i.path));
        const toRemove = (dbImages || []).filter(r => !keepPaths.has(r.path_imagen)).map(r => r.path_imagen);
        if (toRemove.length > 0) {
            await supabase.storage.from('productos').remove(toRemove);
        }
    }

    // 3. Borrar registros anteriores y reinsertar en el orden final
    await supabase.from('imagen_producto').delete().eq('id_producto', productId);

    const inserts = imageItems
        .filter(item => item.path)
        .map((item, i) => ({ id_producto: productId, path_imagen: item.path, orden: i + 1 }));

    if (inserts.length > 0) {
        const { error } = await supabase.from('imagen_producto').insert(inserts);
        if (error) throw error;
    }
}

// --- VARIANTES ---

async function filterByType(checkedMaterialIds = new Set(), checkedSizeIds = new Set()) {
    const tipoId = productTypeSelect.value;
    if (!tipoId) {
        setPlaceholder(productMaterialsContainer, 'Seleccioná un tipo para ver los materiales disponibles.');
        setPlaceholder(productSizesContainer, 'Seleccioná un tipo para ver los tamaños disponibles.');
        return;
    }

    const [{ data: tipoMateriales }, { data: tipoTamanios }] = await Promise.all([
        supabase.from('tipo_material').select('id_material').eq('id_tipo', tipoId),
        supabase.from('tipo_tamanio').select('id_tamanio').eq('id_tipo', tipoId)
    ]);

    const materialIds = new Set((tipoMateriales || []).map(r => r.id_material));
    const tamanioIds = new Set((tipoTamanios || []).map(r => r.id_tamanio));

    const filteredMaterials = materialIds.size > 0 ? allMaterials.filter(m => materialIds.has(m.id_material)) : allMaterials;
    const filteredSizes = tamanioIds.size > 0 ? allSizes.filter(s => tamanioIds.has(s.id_tamanio)) : allSizes;

    populateCheckboxGroup(productMaterialsContainer, filteredMaterials, 'id_material', 'materials', m => m.nombre_material, checkedMaterialIds);
    populateCheckboxGroup(productSizesContainer, filteredSizes, 'id_tamanio', 'sizes', sizeLabel, checkedSizeIds);

    if (isEditMode) {
        productMaterialsContainer.querySelectorAll('input').forEach(cb => cb.disabled = false);
        productSizesContainer.querySelectorAll('input').forEach(cb => cb.disabled = false);
    }
}

// --- CARGA INICIAL ---

async function loadFormData() {
    const [tipos, materiales, tamanos, categorias] = await Promise.all([
        supabase.from('tipo').select('*'),
        supabase.from('material').select('*'),
        supabase.from('tamanio').select('*'),
        supabase.from('categoria').select('*')
    ]);

    allMaterials = materiales.data || [];
    allSizes = sortSizes(tamanos.data || []);

    populateSelect(productTypeSelect, tipos.data, 'nombre_tipo', 'id_tipo', 'Selecciona un tipo...');
    populateCheckboxGroup(productCategoriesContainer, categorias.data, 'id_categoria', 'categories', c => c.nombre_categoria);

    setPlaceholder(productMaterialsContainer, 'Seleccioná un tipo para ver los materiales disponibles.');
    setPlaceholder(productSizesContainer, 'Seleccioná un tipo para ver los tamaños disponibles.');

    productTypeSelect.addEventListener('change', () => filterByType());

    // Inicializar grid de imágenes vacío (botón agregar)
    renderImageGrid();
    imageInput.addEventListener('change', e => handleImageSelect(e.target.files));
}

async function loadProductForEdit() {
    if (!isEditMode) return;

    formTitle.textContent = 'Editar Producto';
    saveButton.textContent = 'Guardar Cambios';

    const [{ data: product, error }, { data: variantes }] = await Promise.all([
        supabase.from('producto')
            .select('*, producto_pertenece_categoria(id_categoria)')
            .eq('id_producto', productId)
            .single(),
        supabase.from('variante')
            .select('id_variante, id_material, id_tamanio')
            .eq('id_producto', productId)
    ]);

    if (error) { alert('Error cargando el producto para editar.'); console.error(error); return; }

    existingVariants = variantes || [];

    productNameInput.value = product.nombre;
    productDescriptionInput.value = product.descripcion;
    productTypeSelect.value = product.id_tipo;
    productNovedadCheckbox.checked = !!product.esNovedad;

    const usedMaterialIds = new Set(existingVariants.map(v => v.id_material));
    const usedSizeIds = new Set(existingVariants.map(v => v.id_tamanio));
    await filterByType(usedMaterialIds, usedSizeIds);

    editModeNotice.style.display = 'block';

    const categoryIds = product.producto_pertenece_categoria.map(cat => cat.id_categoria.toString());
    productCategoriesContainer.querySelectorAll('input').forEach(cb => {
        if (categoryIds.includes(cb.value)) cb.checked = true;
    });

    await loadExistingImages();
}

// --- SUBMIT ---

async function handleFormSubmit(e) {
    e.preventDefault();
    saveButton.disabled = true;
    saveButton.textContent = 'Guardando...';

    try {
        const productData = {
            nombre: productNameInput.value,
            descripcion: productDescriptionInput.value,
            id_tipo: productTypeSelect.value,
            esNovedad: productNovedadCheckbox.checked
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

        // Categorías
        const selectedCategoryIds = getCheckedIds(productCategoriesContainer).map(Number);
        await supabase.from('producto_pertenece_categoria').delete().eq('id_producto', currentProductId);
        if (selectedCategoryIds.length > 0) {
            const { error } = await supabase.from('producto_pertenece_categoria').insert(
                selectedCategoryIds.map(id => ({ id_producto: currentProductId, id_categoria: id }))
            );
            if (error) throw error;
        }

        // Variantes
        const selectedMaterialIds = getCheckedIds(productMaterialsContainer).map(Number);
        const selectedSizeIds = getCheckedIds(productSizesContainer).map(Number);

        if (selectedMaterialIds.length === 0 || selectedSizeIds.length === 0) {
            throw new Error('Debés seleccionar al menos un material y un tamaño.');
        }

        if (isEditMode) {
            const existingSet = new Set(existingVariants.map(v => `${v.id_material}-${v.id_tamanio}`));
            const desiredSet = new Set();
            for (const mid of selectedMaterialIds) {
                for (const sid of selectedSizeIds) desiredSet.add(`${mid}-${sid}`);
            }
            const toDelete = existingVariants.filter(v => !desiredSet.has(`${v.id_material}-${v.id_tamanio}`));
            const toCreate = [];
            for (const mid of selectedMaterialIds) {
                for (const sid of selectedSizeIds) {
                    if (!existingSet.has(`${mid}-${sid}`)) {
                        toCreate.push({ id_producto: currentProductId, id_material: mid, id_tamanio: sid, stock: 0 });
                    }
                }
            }
            if (toDelete.length > 0) {
                const { error } = await supabase.from('variante').delete().in('id_variante', toDelete.map(v => v.id_variante));
                if (error) throw error;
            }
            if (toCreate.length > 0) {
                const { error } = await supabase.from('variante').insert(toCreate);
                if (error) throw error;
            }
        } else {
            const variantes = [];
            for (const mid of selectedMaterialIds) {
                for (const sid of selectedSizeIds) {
                    variantes.push({ id_producto: currentProductId, id_material: mid, id_tamanio: sid, stock: 0 });
                }
            }
            const { error } = await supabase.from('variante').insert(variantes);
            if (error) throw error;
        }

        // Imágenes
        await saveImages(currentProductId);

        showToast(`Producto "${productData.nombre}" ${isEditMode ? 'actualizado' : 'creado'} con éxito`);
        setTimeout(() => { window.location.href = 'panel.html'; }, 1500);

    } catch (error) {
        console.error('Error al guardar el producto:', error);
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
