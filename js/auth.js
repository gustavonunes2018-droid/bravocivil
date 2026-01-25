import { FB_URL, router } from './utils.js';
import { projectManager } from './projectManager.js';

export const auth = {
    ss: null, // Session Storage
    
    async login() {
        const btn = document.getElementById('btn-login');
        const originalText = btn.innerText;
        btn.innerText = "Verificando...";
        btn.disabled = true;

        const u = document.getElementById('log-u').value;
        const p = document.getElementById('log-p').value;

        if (u === 'admin' && p === '123') {
            this.ss = { u: 'Admin', role: 'ADMIN', id: 'local_admin' };
            await this.postLoginSuccess(originalText, btn);
            return;
        }

        try {
            const r = await fetch(`${FB_URL}users.json`);
            if (!r.ok) throw new Error("Banco de dados indisponível ou privado.");
            const d = await r.json() || {};
            let found = false;
            for (let k in d) {
                if (d[k].u === u && d[k].p === p) {
                    this.ss = { ...d[k], id: k };
                    found = true;
                    break;
                }
            }
            if (found) {
                await this.postLoginSuccess(originalText, btn);
            } else {
                alert('Usuário ou senha incorretos');
            }
        } catch (e) {
            console.error(e);
            alert('Erro ao conectar com o banco de dados:\n' + e.message + '\n\nTente usar o login local: admin / 123');
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    },

    async postLoginSuccess(originalText, btn) {
        await projectManager.load();
        router.go('manager');
        btn.innerText = originalText;
        btn.disabled = false;
    }
};