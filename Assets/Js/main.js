// Lógica principal para Supabase (módulo)
// Reemplaza los valores de SUPABASE_URL y SUPABASE_ANON_KEY con los tuyos.
const SUPABASE_URL = 'https://jyetimtakzkaxqzzogzo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zosnWOqSQ5fcnKl-sXmYqw_9wvuhj9W';
// Número de WhatsApp (sin +). Modifícalo por tu número, por ejemplo: 5352384574
const WHATSAPP_NUMBER = '5352384574';

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Helpers ---
function $(sel) { return document.querySelector(sel); }

async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
}

async function signOut() {
    await supabase.auth.signOut();
}

async function uploadImageFile(file) {
    if (!file) return null;
    const filename = `${Date.now()}_${file.name}`;
    // Bucket 'cards' debe existir en tu proyecto Supabase Storage
    const { error: upErr } = await supabase.storage.from('cards').upload(filename, file, { upsert: true });
    if (upErr) throw upErr;
    const { data } = supabase.storage.from('cards').getPublicUrl(filename);
    return data.publicUrl;
}

async function createCard(title, description, imageUrl) {
    const { data, error } = await supabase.from('cards').insert([{ title, description, image_url: imageUrl }]);
    return { data, error };
}

async function fetchCards() {
    const { data, error } = await supabase.from('cards').select('id, title, description, image_url, created_at').order('created_at', { ascending: false });
    if (error) { console.error(error); return []; }
    return data || [];
}

function renderCards(cards) {
    const grid = document.querySelector('.card-grid');
    if (!grid) return;
    // vaciar y renderizar
    grid.innerHTML = '';
    for (const c of cards) {
        const wrap = document.createElement('div');
        wrap.className = 'cards';
        // Generar enlace de WhatsApp con mensaje prellenado
        const waText = `Hola, me interesa reservar la casa de: ${c.title}`;
        const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waText)}`;
        wrap.innerHTML = `
                    <img src="${c.image_url || 'Assets/Img/img acerca de.jpg'}" class="card-img-top" alt="${escapeHtml(c.title)}" loading="lazy">
                    <div class="card-body">
                        <h5 class="card-title">${escapeHtml(c.title)}</h5>
                        <p class="card-text">${escapeHtml(c.description || '')}</p>
                        <a href="${waUrl}" class="btn btn-primary" target="_blank" rel="noopener noreferrer">Reservar</a>
                    </div>
                `;
        grid.appendChild(wrap);
    }
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"]+/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
}

// --- Página admin ---
async function setupAdmin() {
    const loginForm = $('#login-form');
    const logoutBtn = $('#btn-logout');
    const msgAuth = $('#auth-msg');
    const adminPanel = $('#admin-panel');

    function updateUiForUser(user) {
        const authSection = $('#auth-section');
        const logoutBtnEl = $('#btn-logout');
        if (user) {
            adminPanel.style.display = 'block';
            if (authSection) authSection.style.display = 'none';
            if (logoutBtnEl) logoutBtnEl.style.display = 'inline-block';
            msgAuth.textContent = `Conectado: ${user.email}`;
            // cargar lista de cards para editar/eliminar
            loadAdminCards();
        } else {
            adminPanel.style.display = 'none';
            if (authSection) authSection.style.display = 'block';
            if (logoutBtnEl) logoutBtnEl.style.display = 'none';
            msgAuth.textContent = 'No autenticado';
        }
    }

    const { data: { session } } = await supabase.auth.getSession();
    updateUiForUser(session?.user ?? null);

    supabase.auth.onAuthStateChange((_event, session) => {
        updateUiForUser(session?.user ?? null);
    });

    loginForm?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const email = $('#email').value;
        const password = $('#password').value;
        $('#btn-login').disabled = true;
        const { error } = await signIn(email, password);
        $('#btn-login').disabled = false;
        if (error) {
            msgAuth.textContent = 'Error: ' + error.message;
        } else {
            msgAuth.textContent = 'Sesión iniciada';
        }
    });

    logoutBtn?.addEventListener('click', async () => {
        await signOut();
    });

    // crear card
    const cardForm = $('#card-form');
    const adminMsg = $('#admin-msg');
    cardForm?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const title = $('#card-title').value.trim();
        const description = $('#card-desc').value.trim();
        const fileInput = $('#card-image');
        const file = fileInput.files && fileInput.files[0];
        adminMsg.textContent = 'Subiendo...';
        try {
            const imageUrl = file ? await uploadImageFile(file) : null;
            const { error } = await createCard(title, description, imageUrl);
            if (error) throw error;
            adminMsg.textContent = 'Card creada correctamente.';
            cardForm.reset();
            // refrescar lista
            await loadAdminCards();
        } catch (err) {
            console.error(err);
            adminMsg.textContent = 'Error: ' + (err.message || err.toString());
        }
    });
}

// --- Admin: listar, editar, eliminar ---
async function deleteCard(id) {
    const { error } = await supabase.from('cards').delete().eq('id', id);
    return error;
}

async function updateCard(id, updates) {
    const { data, error } = await supabase.from('cards').update(updates).eq('id', id);
    return { data, error };
}

async function loadAdminCards() {
    const container = $('#cards-list');
    if (!container) return;
    container.innerHTML = 'Cargando...';
    try {
        const cards = await fetchCards();
        renderAdminCards(cards);
    } catch (err) {
        console.error(err);
        container.innerHTML = 'Error cargando cards.';
    }
}

function renderAdminCards(cards) {
    const container = $('#cards-list');
    if (!container) return;
    if (!cards.length) { container.innerHTML = '<div class="text-muted">No hay cards aún.</div>'; return; }
    const table = document.createElement('div');
    table.className = 'list-group';
    for (const c of cards) {
        const item = document.createElement('div');
        item.className = 'list-group-item';
        item.innerHTML = `
            <div class="d-flex w-100 justify-content-between align-items-center">
                <div>
                    <h6 class="mb-1">${escapeHtml(c.title)}</h6>
                    <small class="text-muted">${new Date(c.created_at).toLocaleString()}</small>
                </div>
                <div>
                    <button class="btn btn-sm btn-outline-primary me-1" data-action="edit" data-id="${c.id}">Editar</button>
                    <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${c.id}">Eliminar</button>
                </div>
            </div>
            <p class="mb-1 mt-2">${escapeHtml(c.description || '')}</p>
        `;
        table.appendChild(item);
    }
    container.innerHTML = '';
    container.appendChild(table);

    // handlers
    container.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', async (ev) => {
            const action = btn.getAttribute('data-action');
            const id = btn.getAttribute('data-id');
            if (action === 'delete') {
                if (!confirm('¿Eliminar esta card?')) return;
                const err = await deleteCard(id);
                if (err) { alert('Error: ' + err.message); return; }
                await loadAdminCards();
            } else if (action === 'edit') {
                openEditForm(id);
            }
        });
    });
}

function openEditForm(id) {
    const container = $('#cards-list');
    const item = container.querySelector(`button[data-action="edit"][data-id="${id}"]`)?.closest('.list-group-item');
    if (!item) return;
    // obtener datos actuales
    const titleEl = item.querySelector('h6');
    const descEl = item.querySelector('p');
    const currTitle = titleEl ? titleEl.textContent : '';
    const currDesc = descEl ? descEl.textContent : '';
    // reemplazar por formulario simple
    item.innerHTML = `
        <div>
            <div class="mb-2"><input class="form-control form-control-sm" id="edit-title-${id}" value="${escapeHtml(currTitle)}"></div>
            <div class="mb-2"><textarea class="form-control form-control-sm" id="edit-desc-${id}" rows="2">${escapeHtml(currDesc)}</textarea></div>
            <div class="text-end">
                <button class="btn btn-sm btn-secondary me-1" id="cancel-${id}">Cancelar</button>
                <button class="btn btn-sm btn-primary" id="save-${id}">Guardar</button>
            </div>
        </div>
    `;

    $('#cancel-' + id).addEventListener('click', async () => { await loadAdminCards(); });
    $('#save-' + id).addEventListener('click', async () => {
        const newTitle = $('#edit-title-' + id).value.trim();
        const newDesc = $('#edit-desc-' + id).value.trim();
        const { error } = await updateCard(id, { title: newTitle, description: newDesc });
        if (error) { alert('Error: ' + error.message); return; }
        await loadAdminCards();
    });
}

// --- Página público (casas) ---
async function setupPublic() {
    try {
        const cards = await fetchCards();
        renderCards(cards);
    } catch (err) {
        console.error('Error cargando cards', err);
    }
}

// Detectar página
const path = location.pathname.split('/').pop();
if (path === 'admin.html') {
    await setupAdmin();
} else {
    await setupPublic();
}
