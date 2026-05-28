import { supabase } from '../auth.js';
import { showToast } from '../toast.js';

const materialsList = document.getElementById('materials-list');
const addMaterialForm = document.getElementById('add-material-form');
const newMaterialNameInput = document.getElementById('new-material-name');

export async function initMaterials() {
    await loadMaterials();
    addMaterialForm.addEventListener('submit', handleCreate);
    materialsList.addEventListener('click', handleListClick);
}

async function loadMaterials() {
    const { data: materials, error } = await supabase.from('material').select('*').order('id_material');
    if (error) { console.error('Error cargando materiales:', error); return; }

    materialsList.innerHTML = '';
    materials.forEach(material => {
        const li = document.createElement('li');
        li.dataset.id = material.id_material;
        li.dataset.nombre = material.nombre_material;
        li.innerHTML = `
            <span class="name">${material.nombre_material}</span>
            <div class="actions">
                <button class="edit-btn">Modificar</button>
                <button class="delete-btn">Eliminar</button>
            </div>
        `;
        materialsList.appendChild(li);
    });
}

function isDuplicateName(name, excludeId = null) {
    const norm = s => s.trim().toLowerCase();
    for (const li of materialsList.querySelectorAll('li[data-id]')) {
        if (excludeId && li.dataset.id === String(excludeId)) continue;
        if (norm(li.dataset.nombre) === norm(name)) return true;
    }
    return false;
}

async function handleCreate(e) {
    e.preventDefault();
    const nombre = newMaterialNameInput.value.trim();
    if (!nombre) return;

    if (isDuplicateName(nombre)) {
        showToast(`Ya existe un material llamado "${nombre}".`);
        return;
    }

    const { error } = await supabase.from('material').insert([{ nombre_material: nombre }]);
    if (error) { alert(`Error creando material: ${error.message}`); }
    else {
        newMaterialNameInput.value = '';
        await loadMaterials();
        window.dispatchEvent(new CustomEvent('catalog:changed'));
        showToast(`Material "${nombre}" agregado`);
    }
}

function handleListClick(event) {
    const target = event.target;
    const li = target.closest('li');
    if (!li) return;
    const id = li.dataset.id;
    const nombre = li.dataset.nombre;

    if (target.classList.contains('delete-btn')) { deleteMaterial(id, nombre); }
    if (target.classList.contains('edit-btn')) {
        li.innerHTML = `
            <input type="text" value="${nombre}" class="edit-input">
            <div class="actions">
                <button class="save-btn">Guardar</button>
                <button class="cancel-btn">Cancelar</button>
            </div>
        `;
    }
    if (target.classList.contains('save-btn')) {
        const newName = li.querySelector('.edit-input').value.trim();
        if (newName) {
            if (isDuplicateName(newName, id)) {
                showToast(`Ya existe un material llamado "${newName}".`);
            } else {
                updateMaterial(id, newName);
            }
        }
    }
    if (target.classList.contains('cancel-btn')) { loadMaterials(); }
}

async function deleteMaterial(id, nombre) {
    if (confirm(`¿Eliminar el material "${nombre}"?`)) {
        const { error } = await supabase.from('material').delete().eq('id_material', id);
        if (error) { alert(`Error al eliminar: ${error.message}`); }
        else {
            await loadMaterials();
            window.dispatchEvent(new CustomEvent('catalog:changed'));
            showToast(`Material "${nombre}" eliminado`);
        }
    }
}

async function updateMaterial(id, newName) {
    const { error } = await supabase.from('material').update({ nombre_material: newName }).eq('id_material', id);
    if (error) { alert(`Error al actualizar: ${error.message}`); }
    else {
        await loadMaterials();
        window.dispatchEvent(new CustomEvent('catalog:changed'));
        showToast(`Material "${newName}" actualizado`);
    }
}
