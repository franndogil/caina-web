import { supabase } from '../auth.js';

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

async function handleCreate(e) {
    e.preventDefault();
    const nombre = newMaterialNameInput.value.trim();
    if (!nombre) return;

    const { error } = await supabase.from('material').insert([{ nombre_material: nombre }]);
    if (error) { alert(`Error creando material: ${error.message}`); }
    else {
        newMaterialNameInput.value = '';
        await loadMaterials();
    }
}

function handleListClick(event) {
    const target = event.target;
    const li = target.closest('li');
    if (!li) return;
    const id = li.dataset.id;

    if (target.classList.contains('delete-btn')) { deleteMaterial(id); }
    if (target.classList.contains('edit-btn')) {
        const currentName = li.querySelector('.name').textContent;
        li.innerHTML = `
            <input type="text" value="${currentName}" class="edit-input">
            <div class="actions">
                <button class="save-btn">Guardar</button>
                <button class="cancel-btn">Cancelar</button>
            </div>
        `;
    }
    if (target.classList.contains('save-btn')) {
        const newName = li.querySelector('.edit-input').value.trim();
        if (newName) { updateMaterial(id, newName); }
    }
    if (target.classList.contains('cancel-btn')) { loadMaterials(); }
}

async function deleteMaterial(id) {
    if (confirm(`¿Eliminar material ID ${id}?`)) {
        const { error } = await supabase.from('material').delete().eq('id_material', id);
        if (error) { alert(`Error al eliminar: ${error.message}`); }
        else { await loadMaterials(); }
    }
}

async function updateMaterial(id, newName) {
    const { error } = await supabase.from('material').update({ nombre_material: newName }).eq('id_material', id);
    if (error) { alert(`Error al actualizar: ${error.message}`); }
    else { await loadMaterials(); }
}