import { supabase } from '../auth.js';
import { showToast } from '../toast.js';

const typesList = document.getElementById('types-list');
const addTypeBtn = document.getElementById('add-type-btn');

const modal = document.getElementById('type-modal');
const modalTitle = document.getElementById('type-modal-title');
const modalNameInput = document.getElementById('type-modal-name');
const modalSizesContainer = document.getElementById('type-modal-sizes');
const modalMaterialsContainer = document.getElementById('type-modal-materials');
const modalSaveBtn = document.getElementById('type-modal-save');
const modalCloseBtn = document.getElementById('type-modal-close');

let activeTipoId = null;

export async function initTypes() {
    await loadTypes();

    addTypeBtn.addEventListener('click', () => openModal(null, null));
    typesList.addEventListener('click', handleListClick);
    modalCloseBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    modalSaveBtn.addEventListener('click', saveType);
}

async function loadTypes() {
    const { data: tipos, error } = await supabase.from('tipo').select('*').order('id_tipo');
    if (error) { console.error('Error al cargar los tipos:', error); return; }

    typesList.innerHTML = '';
    tipos.forEach(tipo => {
        const li = document.createElement('li');
        li.dataset.id = tipo.id_tipo;
        li.innerHTML = `
            <span class="type-name">${tipo.nombre_tipo}</span>
            <div class="actions">
                <button class="edit-btn">Modificar</button>
                <button class="delete-btn">Eliminar</button>
            </div>
        `;
        typesList.appendChild(li);
    });
}

async function openModal(tipoId, tipoNombre) {
    activeTipoId = tipoId;

    modalNameInput.value = tipoNombre || '';
    modalTitle.textContent = tipoId ? `Modificar — ${tipoNombre}` : 'Nuevo Tipo de Producto';
    modalSaveBtn.textContent = 'Guardar Tipo';
    modalSaveBtn.disabled = false;

    modalSizesContainer.innerHTML = '<p style="opacity:0.5;font-size:.85em;">Cargando...</p>';
    modalMaterialsContainer.innerHTML = '<p style="opacity:0.5;font-size:.85em;">Cargando...</p>';
    modal.style.display = 'flex';

    const [
        { data: allSizes },
        { data: allMaterials },
        { data: existingSizes },
        { data: existingMaterials }
    ] = await Promise.all([
        supabase.from('tamanio').select('*'),
        supabase.from('material').select('*'),
        tipoId ? supabase.from('tipo_tamanio').select('id_tamanio').eq('id_tipo', tipoId) : { data: [] },
        tipoId ? supabase.from('tipo_material').select('id_material').eq('id_tipo', tipoId) : { data: [] }
    ]);

    allSizes.sort((a, b) => {
        if (a.unidad !== b.unidad) return a.unidad.localeCompare(b.unidad);
        const getVal = v => v.includes('x')
            ? v.split('x').reduce((acc, n) => acc * parseFloat(n), 1)
            : parseFloat(v);
        return getVal(a.valor) - getVal(b.valor);
    });

    const checkedSizeIds = new Set((existingSizes || []).map(r => r.id_tamanio));
    const checkedMaterialIds = new Set((existingMaterials || []).map(r => r.id_material));

    modalSizesContainer.innerHTML = '';
    allSizes.forEach(s => {
        const label = document.createElement('label');
        label.innerHTML = `
            <input type="checkbox" value="${s.id_tamanio}" ${checkedSizeIds.has(s.id_tamanio) ? 'checked' : ''}>
            ${s.valor}${s.unidad ? ' ' + s.unidad : ''}
        `;
        modalSizesContainer.appendChild(label);
    });

    modalMaterialsContainer.innerHTML = '';
    allMaterials.forEach(m => {
        const label = document.createElement('label');
        label.innerHTML = `
            <input type="checkbox" value="${m.id_material}" ${checkedMaterialIds.has(m.id_material) ? 'checked' : ''}>
            ${m.nombre_material}
        `;
        modalMaterialsContainer.appendChild(label);
    });
}

function closeModal() {
    modal.style.display = 'none';
    activeTipoId = null;
}

function isDuplicateName(name, excludeId = null) {
    const norm = s => s.trim().toLowerCase();
    for (const li of typesList.querySelectorAll('li[data-id]')) {
        if (excludeId && li.dataset.id === String(excludeId)) continue;
        const liName = li.querySelector('.type-name')?.textContent || '';
        if (norm(liName) === norm(name)) return true;
    }
    return false;
}

async function saveType() {
    const nombre = modalNameInput.value.trim();
    if (!nombre) { alert('El nombre del tipo es obligatorio.'); return; }

    if (isDuplicateName(nombre, activeTipoId)) {
        showToast(`Ya existe un tipo llamado "${nombre}".`);
        return;
    }

    modalSaveBtn.disabled = true;
    modalSaveBtn.textContent = 'Guardando...';

    const checkedSizeIds = Array.from(modalSizesContainer.querySelectorAll('input:checked')).map(cb => Number(cb.value));
    const checkedMaterialIds = Array.from(modalMaterialsContainer.querySelectorAll('input:checked')).map(cb => Number(cb.value));

    try {
        let tipoId = activeTipoId;

        if (tipoId) {
            const { error } = await supabase.from('tipo').update({ nombre_tipo: nombre }).eq('id_tipo', tipoId);
            if (error) throw error;
        } else {
            const { data, error } = await supabase.from('tipo').insert({ nombre_tipo: nombre }).select().single();
            if (error) throw error;
            tipoId = data.id_tipo;
        }

        await supabase.from('tipo_tamanio').delete().eq('id_tipo', tipoId);
        await supabase.from('tipo_material').delete().eq('id_tipo', tipoId);

        if (checkedSizeIds.length > 0) {
            const { error } = await supabase.from('tipo_tamanio').insert(
                checkedSizeIds.map(id => ({ id_tipo: tipoId, id_tamanio: id }))
            );
            if (error) throw error;
        }

        if (checkedMaterialIds.length > 0) {
            const { error } = await supabase.from('tipo_material').insert(
                checkedMaterialIds.map(id => ({ id_tipo: tipoId, id_material: id }))
            );
            if (error) throw error;
        }

        const wasEditing = !!activeTipoId;
        closeModal();
        await loadTypes();
        window.dispatchEvent(new CustomEvent('catalog:changed'));
        showToast(wasEditing ? `Tipo "${nombre}" actualizado` : `Tipo "${nombre}" creado`);

    } catch (err) {
        alert('Error al guardar: ' + err.message);
        modalSaveBtn.disabled = false;
        modalSaveBtn.textContent = 'Guardar Tipo';
    }
}

async function deleteType(id) {
    if (confirm('¿Estás seguro de que querés eliminar este tipo?')) {
        const { error } = await supabase.from('tipo').delete().eq('id_tipo', id);
        if (error) { alert(`Error al eliminar: ${error.message}`); }
        else {
            await loadTypes();
            window.dispatchEvent(new CustomEvent('catalog:changed'));
        }
    }
}

async function handleListClick(event) {
    const target = event.target;
    const li = target.closest('li');
    if (!li) return;

    const id = li.dataset.id;

    if (target.classList.contains('edit-btn')) {
        const nombre = li.querySelector('.type-name').textContent;
        await openModal(id, nombre);
    }

    if (target.classList.contains('delete-btn')) {
        await deleteType(id);
    }
}
