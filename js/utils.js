export const FB_URL = "https://bravo-civil-default-rtdb.firebaseio.com/";

export const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

// Configurações globais de dias úteis
export let config = { sat: false, sun: false, holidays: [] };

export const setConfig = (newConfig) => {
    config = newConfig;
};

export const isWorkDay = (date) => {
    const d = new Date(date + "T00:00:00");
    if (!config.sat && d.getDay() === 6) return false;
    if (!config.sun && d.getDay() === 0) return false;
    if ((config.holidays || []).includes(date)) return false;
    return true;
};

export const addWorkDays = (start, days) => {
    let d = new Date(start + "T00:00:00"), c = 0, n = parseInt(days) - 1;
    while (c < n) {
        d.setDate(d.getDate() + 1);
        if (isWorkDay(d.toISOString().split('T')[0])) c++;
    }
    return d.toISOString().split('T')[0];
};

export const getNextWorkDay = (dateStr) => {
    let d = new Date(dateStr + "T00:00:00");
    do {
        d.setDate(d.getDate() + 1);
    } while (!isWorkDay(d.toISOString().split('T')[0]));
    return d.toISOString().split('T')[0];
};

export const getDuration = (start, end) => {
    let d1 = new Date(start + "T00:00:00"), d2 = new Date(end + "T00:00:00"), c = 0;
    if (d2 < d1) return 1;
    while (d1 <= d2) {
        if (isWorkDay(d1.toISOString().split('T')[0])) c++;
        d1.setDate(d1.getDate() + 1);
    }
    return c;
};

export const router = {
    go(id) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const page = document.getElementById('page-' + id);
        if(page) page.classList.add('active');
        if(window.lucide) window.lucide.createIcons();
    }
};

// --- CORREÇÃO: Função para limpar caracteres inválidos em nomes de arquivo ---
export const sanitizeFilename = (name) => {
    if (!name) return 'arquivo_sem_nome';
    // Substitui < > : " / \ | ? * por underline (_)
    return name.replace(/[<>:"/\\|?*]+/g, '_').trim();
};