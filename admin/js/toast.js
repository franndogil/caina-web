export function showToast(message, duration = 2500) {
    const existing = document.getElementById('admin-toast');
    if (existing) {
        clearTimeout(existing._dismissTimer);
        existing.remove();
    }

    const toast = document.createElement('div');
    toast.id = 'admin-toast';
    toast.className = 'admin-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Doble rAF para que la transición CSS se dispare correctamente
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('admin-toast--visible')));

    toast._dismissTimer = setTimeout(() => {
        toast.classList.remove('admin-toast--visible');
        setTimeout(() => toast.remove(), 250);
    }, duration);
}
