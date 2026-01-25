import { auth } from './auth.js';
import { editor } from './editor.js';
import { FB_URL, sanitizeFilename } from './utils.js'; 

export const projectManager = {
    all: [],

    async load() { 
        if (!auth.ss || auth.ss.id === 'local_admin') {
            this.all = JSON.parse(localStorage.getItem('bravo_projects') || '[]'); 
            this.render();
            return;
        }
        const r = await fetch(`${FB_URL}db_${auth.ss.id}.json`); 
        this.all = await r.json() || []; 
        this.render(); 
    },

    render() {
        const container = document.getElementById('grid-projects');
        container.innerHTML = this.all.map(p => `
            <div class="relative group bg-white p-8 rounded-[30px] border hover:border-blue-500 shadow-sm hover:shadow-md transition flex flex-col justify-between h-40">
                <div data-pid="${p.id}" class="cursor-pointer open-project-btn">
                    <h3 class="font-black uppercase text-xs text-slate-800 pointer-events-none">${p.name}</h3>
                    <p class="text-[10px] text-slate-400 mt-2 pointer-events-none">ID: ${p.id}</p>
                </div>
                <div class="flex justify-between items-end">
                    <button data-pid="${p.id}" class="export-btn text-blue-500 text-[10px] font-bold hover:underline flex gap-1 items-center"><i data-lucide="download" class="w-3"></i> JSON</button>
                    <button data-pid="${p.id}" class="dup-btn text-purple-500 text-[10px] font-bold hover:underline flex gap-1 items-center ml-2"><i data-lucide="copy" class="w-3"></i> Duplicar</button>
                    <button data-pid="${p.id}" class="del-btn text-red-200 hover:text-red-500"><i data-lucide="trash-2" class="w-4"></i></button>
                </div>
            </div>`).join('');
        
        container.querySelectorAll('.open-project-btn').forEach(b => b.onclick = () => editor.open(b.dataset.pid));
        container.querySelectorAll('.export-btn').forEach(b => b.onclick = () => this.exportProject(b.dataset.pid));
        container.querySelectorAll('.dup-btn').forEach(b => b.onclick = () => this.duplicate(b.dataset.pid));
        container.querySelectorAll('.del-btn').forEach(b => b.onclick = (e) => { e.stopPropagation(); this.del(b.dataset.pid); });

        if(window.lucide) window.lucide.createIcons();
    },

    async save() { 
        if (!auth.ss || auth.ss.id === 'local_admin') {
            localStorage.setItem('bravo_projects', JSON.stringify(this.all));
            return;
        }
        await fetch(`${FB_URL}db_${auth.ss.id}.json`, { method: 'PUT', body: JSON.stringify(this.all) }); 
    },

    openCreateSelection() { document.getElementById('modal-create-type').classList.add('active'); },
    
    createManual() {
        document.getElementById('modal-create-type').classList.remove('active');
        const n = prompt('Nome do Projeto:');
        if (n) {
            const rootId = 'g' + Date.now();
            this.all.push({ 
                id: 'p' + Date.now(), 
                name: n, 
                data: [{ uuid: rootId, name: 'RESUMO DO PROJETO', type: 'group', parent: 'root', cost: 0, progress: 0, collapsed: false }],
                eap: [], kb: [], measurements: [], baselines: [], snapshots: []
            });
            this.save();
            this.render();
        }
    },

    createWizard() {
        document.getElementById('modal-create-type').classList.remove('active');
        document.getElementById('cp-name').value = '';
        document.getElementById('cp-start').value = new Date().toISOString().split('T')[0];
        document.getElementById('modal-create-project').classList.add('active');
    },

    generateAndSave() {
        const name = document.getElementById('cp-name').value;
        if (!name) return alert("Nome é obrigatório");
        
        const start = document.getElementById('cp-start').value;
        const subs = parseInt(document.getElementById('cp-subs').value) || 0;
        const hasGround = document.getElementById('cp-ground').checked;
        const garages = parseInt(document.getElementById('cp-garage').value) || 0;
        const hasLazer = document.getElementById('cp-lazer').checked;
        const tipo = parseInt(document.getElementById('cp-tipo').value) || 1;
        const hasRooftop = document.getElementById('cp-rooftop').checked;
        const hasWater = document.getElementById('cp-water').checked;

        const db = [];
        const rootId = 'root_' + Date.now();
        db.push({ uuid: rootId, name: 'RESUMO DO PROJETO', type: 'group', parent: 'root', cost: 0, progress: 0, collapsed: false, start: start, end: start });

        let floors = [];
        let floorIndex = -subs; 
        
        for (let i = subs; i >= 1; i--) { floors.push({ name: `${floorIndex}º Pavimento - Subsolo ${i}`, type: 'sub' }); floorIndex++; }
        if (hasGround) { floors.push({ name: `0º Pavimento - Térreo`, type: 'ground' }); floorIndex = 1; } else if(floorIndex === 0) { floorIndex = 1; }
        for (let i = 1; i <= garages; i++) { floors.push({ name: `${floorIndex}º Pavimento - Garagem ${i}`, type: 'garage' }); floorIndex++; }
        if (hasLazer) { floors.push({ name: `${floorIndex}º Pavimento - Lazer/PUC`, type: 'lazer' }); floorIndex++; }
        for (let i = 1; i <= tipo; i++) { floors.push({ name: `${floorIndex}º Pavimento - Tipo ${i}`, type: 'tipo' }); floorIndex++; }
        if(hasRooftop) floors.push({ name: `Cobertura / Rooftop`, type: 'roof' });
        if(hasWater) floors.push({ name: `Barrilete / Caixa D'água`, type: 'water' });

        const createdTasks = {};

        const addTask = (serviceName, floorIndex, itemName, duration, preds = []) => {
            if (!createdTasks[serviceName]) createdTasks[serviceName] = [];
            const tid = 't' + Date.now() + Math.random().toString(36).substr(2, 5);
            createdTasks[serviceName][floorIndex] = tid;
            
            let gid = null;
            const existingGroup = db.find(x => x.name === serviceName && x.type === 'group');
            if (existingGroup) {
                gid = existingGroup.uuid;
            } else {
                gid = 'g' + Date.now() + Math.random().toString(36).substr(2, 5);
                db.push({ uuid: gid, name: serviceName, type: 'group', parent: rootId, cost: 0, progress: 0, collapsed: false });
            }
            let estStart = start;
            db.push({ uuid: tid, name: itemName, type: 'item', parent: gid, duration: duration, start: estStart, end: estStart, progress: 0, cost: 0, pred: preds });
            return tid;
        };

        const tPrelim = addTask('SERVIÇOS PRELIMINARES', 0, 'Mobilização e Canteiro', 15);
        const tTerra = addTask('MOVIMENTAÇÃO DE TERRA', 0, 'Escavação e Contenção', 20, [tPrelim]);
        const tFund = addTask('FUNDAÇÃO', 0, 'Infraestrutura (Estacas/Blocos)', 30, [tTerra]);

        floors.forEach((f, i) => {
            let preds = [];
            if (i === 0) preds.push(tFund); 
            else if(createdTasks['ESTRUTURA - VIGAS E LAJES'] && createdTasks['ESTRUTURA - VIGAS E LAJES'][i-1]) preds.push(createdTasks['ESTRUTURA - VIGAS E LAJES'][i-1]);
            addTask('ESTRUTURA - PILARES', i, f.name, 5, preds);
        });

        floors.forEach((f, i) => {
            let preds = [];
            if(createdTasks['ESTRUTURA - PILARES'][i]) preds.push(createdTasks['ESTRUTURA - PILARES'][i]);
            addTask('ESTRUTURA - VIGAS E LAJES', i, f.name, 7, preds);
        });

        this.all.push({ id: 'p' + Date.now(), name: name, data: db, eap: [], kb: [], measurements: [], baselines: [], snapshots: [] });
        this.save();
        this.render();
        document.getElementById('modal-create-project').classList.remove('active');
    },

    async del(id) { 
        if (confirm("ATENÇÃO: Isso excluirá todo o projeto permanentemente. Continuar?")) { 
            this.all = this.all.filter(p => p.id !== id); 
            await this.save(); 
            this.render(); 
        } 
    },
    
    // --- USO DA CORREÇÃO AQUI ---
    exportProject(id) {
        const p = this.all.find(x => x.id === id);
        if(!p) return;
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(p));
        const a = document.createElement('a');
        a.setAttribute("href", dataStr);
        
        const safeName = sanitizeFilename(p.name);
        a.setAttribute("download", `bravo_project_${safeName}.json`);
        
        document.body.appendChild(a);
        a.click();
        a.remove();
    },
    
    duplicate(id) {
        const p = this.all.find(x => x.id === id);
        if(!p) return;
        const copy = JSON.parse(JSON.stringify(p));
        copy.id = 'p' + Date.now();
        copy.name = copy.name + " (Cópia)";
        this.all.push(copy);
        this.save();
        this.render();
    },
    
    importFile(input) {
        const file = input.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = async(e) => {
            try{
                const json = JSON.parse(e.target.result);
                if(!json.id || !json.data) throw new Error("Arquivo inválido");
                json.id = 'p' + Date.now();
                json.name = json.name + " (Importado)";
                this.all.push(json);
                await this.save();
                this.render();
                alert("Projeto importado com sucesso!");
            }catch(err){
                alert("Erro ao importar: " + err.message);
            }
        };
        reader.readAsText(file);
        input.value = '';
    }
};