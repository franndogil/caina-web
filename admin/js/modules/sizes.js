import { supabase } from '../auth.js';
import { showToast } from '../toast.js';

const sizesList = document.getElementById('sizes-list');
const addSizeForm = document.getElementById('add-size-form');
const newSizeValueInput = document.getElementById('new-size-value');
const newSizeUnitInput = document.getElementById('new-size-unit');

export async function initSizes() {
    await loadSizes();
    addSizeForm.addEventListener('submit', handleCreate);
    sizesList.addEventListener('click', handleListClick);
}

function sizeDisplay(valor, unidad) {
    return unidad ? `${valor} ${unidad}` : valor;
}

async function loadSizes() {
    const { data: sizes, error } = await supabase.from('tamanio').select('*');
    if (error) { console.error('Error cargando tamaños:', error); return; }

    sizes.sort((a, b) => {
        if ((a.unidad || '') !== (b.unidad || '')) return (a.unidad || '').localeCompare(b.unidad || '');
        const getVal = v => v.trim().includes('x')
            ? v.trim().split('x').reduce((acc, n) => acc * parseFloat(n), 1)
            : parseFloat(v);
        return getVal(a.valor) - getVal(b.valor);
    });

    sizesList.innerHTML = '';
    sizes.forEach(size => {
        const li = document.createElement('li');
        li.dataset.id = size.id_tamanio;
        li.dataset.valor = size.valor;
        li.dataset.unidad = size.unidad || '';
        li.innerHTML = `
            <span class="text">${sizeDisplay(size.valor, size.unidad)}</span>
            <div class="actions">
                <button class="edit-btn">Modificar</button>
                <button class="delete-btn">Eliminar</button>
            </div>
        `;
        sizesList.appendChild(li);
    });
}

function isDuplicateSize(valor, unidad, excludeId = null) {
    const norm = s => s.trim().toLowerCase();
    for (const li of sizesList.querySelectorAll('li[data-id]')) {
        if (excludeId && li.dataset.id === String(excludeId)) continue;
        if (norm(li.dataset.valor) === norm(valor) && norm(li.dataset.unidad) === norm(unidad)) return true;
    }
    return false;
}

async function handleCreate(e) {
    e.preventDefault();
    const valor = newSizeValueInput.value.trim();
    const unidad = newSizeUnitInput.value.trim();
    if (!valor) { alert('El valor es obligatorio.'); return; }

    if (isDuplicateSize(valor, unidad)) {
        showToast(`Ya existe un tamaño "${sizeDisplay(valor, unidad)}".`);
        return;
    }

    const { error } = await supabase.from('tamanio').insert([{ valor, unidad }]);
    if (error) { alert(`Error creando tamaño: ${error.message}`); }
    else {
        newSizeValueInput.value = '';
        newSizeUnitInput.value = '';
        await loadSizes();
        window.dispatchEvent(new CustomEvent('catalog:changed'));
        showToast(`Tamaño "${sizeDisplay(valor, unidad)}" agregado`);
    }
}

function handleListClick(event) {
    const target = event.target;
    const li = target.closest('li');
    if (!li) return;
    const id = li.dataset.id;
    const valor = li.dataset.valor;
    const unidad = li.dataset.unidad;
    const display = sizeDisplay(valor, unidad);

    if (target.classList.contains('delete-btn')) { deleteSize(id, display); }

    if (target.classList.contains('edit-btn')) {
        li.innerHTML = `
            <input type="text" value="${valor}" placeholder="Valor" class="edit-valor">
            <input type="text" value="${unidad}" placeholder="Unidad (ej: cm, cc)" class="edit-unidad">
            <div class="actions">
                <button class="save-btn">Guardar</button>
                <button class="cancel-btn">Cancelar</button>
            </div>
        `;
    }
    if (target.classList.contains('save-btn')) {
        const newValor = li.querySelector('.edit-valor').value.trim();
        const newUnidad = li.querySelector('.edit-unidad').value.trim();
        if (newValor) {
            if (isDuplicateSize(newValor, newUnidad, id)) {
                showToast(`Ya existe un tamaño "${sizeDisplay(newValor, newUnidad)}".`);
            } else {
                updateSize(id, newValor, newUnidad);
            }
        }
    }
    if (target.classList.contains('cancel-btn')) { loadSizes(); }
}

async function deleteSize(id, display) {
    if (confirm(`¿Eliminar el tamaño "${display}"?`)) {
        const { error } = await supabase.from('tamanio').delete().eq('id_tamanio', id);
        if (error) { alert(`Error al eliminar: ${error.message}`); }
        else {
            await loadSizes();
            window.dispatchEvent(new CustomEvent('catalog:changed'));
            showToast(`Tamaño "${display}" eliminado`);
        }
    }
}

async function updateSize(id, valor, unidad) {
    const { error } = await supabase.from('tamanio').update({ valor, unidad }).eq('id_tamanio', id);
    if (error) { alert(`Error al actualizar: ${error.message}`); }
    else {
        await loadSizes();
        window.dispatchEvent(new CustomEvent('catalog:changed'));
        showToast(`Tamaño "${sizeDisplay(valor, unidad)}" actualizado`);
    }
}
