import { router, setConfig, getNextWorkDay, addWorkDays, getDuration, fmt, sanitizeFilename } from './utils.js';
import { projectManager } from './projectManager.js';
import { auth } from './auth.js';

export const editor = {
    curr: null, db: [], eap: [], kb: [], measurements: [], cfg: {}, baselines: [], snapshots: [], charts: {}, 
    mode: 'planning', ganttViewMode: 'Day', zoomLevel: 1, editingGroup: null,
    drag: { active: false, item: null }, link: { active: false, source: null }, 
    eapPan: { active: false, startX: 0, startY: 0, transX: 0, transY: 0 }, 
    financialBreakdown: {},
    linkingState: { active: false, source: null },

    async open(id) {
        this.curr = id;
        const p = projectManager.all.find(x => x.id === id);
        if (!p.kb) p.kb = [];
        if (!p.measurements) p.measurements = [];
        this.db = p.data || [];
        this.eap = p.eap || [];
        this.kb = p.kb;
        this.measurements = p.measurements;
        this.cfg = p.cfg || { sat: false, sun: false, holidays: [] };
        
        setConfig(this.cfg);

        this.baselines = p.baselines || [];
        this.snapshots = p.snapshots || [];
        document.getElementById('edit-name').innerText = p.name.toUpperCase();
        router.go('editor');
        this.recalc(false);
        setTimeout(() => { this.setupSync(); this.initEapDrag(); }, 500);
    },

    close() { this.curr = null; router.go('manager'); },

    setupSync() {
        const t = document.getElementById('wrapper-table');
        const g = document.getElementById('wrapper-gantt');
        let isSyncingLeft = false, isSyncingRight = false;
        if (t && g) {
            t.onscroll = function() { if (!isSyncingLeft) { isSyncingRight = true; g.scrollTop = t.scrollTop; } isSyncingLeft = false; };
            g.onscroll = function() { if (!isSyncingRight) { isSyncingLeft = true; t.scrollTop = g.scrollTop; } isSyncingRight = false; };
        }
    },

    recalc(shouldSave = true) {
        let changes = true, loops = 0;
        this.db.forEach(t => t.critical = false);
        
        while (changes && loops < 15) {
            changes = false;
            this.db.forEach(t => {
                if (t.type === 'item' && !this.db.some(c => c.parent === t.uuid)) {
                    if (t.pred && t.pred.length) {
                        let max = null;
                        t.pred.forEach(pid => { 
                            const p = this.db.find(x => x.uuid === pid); 
                            if (p && p.end && (!max || p.end > max)) max = p.end; 
                        });
                        if (max) { 
                            const ns = getNextWorkDay(max); 
                            if (t.start !== ns) { t.start = ns; changes = true; } 
                        }
                    } else if (!t.start) t.start = new Date().toISOString().split('T')[0];
                    
                    if (t.start && t.duration) { 
                        const ne = addWorkDays(t.start, t.duration); 
                        if (t.end !== ne) { t.end = ne; changes = true; } 
                    }
                }
            });
            loops++;
        }
        
        for(let k=0; k<6; k++) {
            this.db.forEach(g => {
                const ch = this.db.filter(x => x.parent === g.uuid);
                if (ch.length) {
                    const starts = ch.map(c => c.start).filter(Boolean).sort();
                    const ends = ch.map(c => c.end).filter(Boolean).sort().reverse();
                    if(starts.length) g.start = starts[0];
                    if(ends.length) g.end = ends[0];
                    g.cost = ch.reduce((s, c) => s + (parseFloat(c.cost) || 0), 0);
                    
                    if (g.cost > 0) {
                        const earned = ch.reduce((s,c) => s + ((parseFloat(c.cost)||0)*(c.progress||0)/100),0);
                        g.progress = Math.round((earned/g.cost)*100);
                    } else {
                        g.progress = Math.round(ch.reduce((s,c) => s + (c.progress||0),0)/ch.length);
                    }
                }
            });
        }
        
        if (this.db.length > 0) {
            const allStart = this.db.map(t => t.start).filter(Boolean).sort()[0];
            const allEnd = this.db.map(t => t.end).filter(Boolean).sort().reverse()[0];
            const totalCost = this.db.filter(t => t.type === 'item').reduce((acc, t) => acc + (parseFloat(t.cost) || 0), 0);
            
            if(this.db[0]) {
                this.db[0].name = "RESUMO DO PROJETO";
                this.db[0].start = allStart || new Date().toISOString().split('T')[0];
                this.db[0].end = allEnd || this.db[0].start;
                this.db[0].cost = totalCost;
                this.db[0].duration = getDuration(this.db[0].start, this.db[0].end);
            }
        }

        const ld = this.db.map(t => t.end).filter(Boolean).sort().reverse()[0];
        if(ld) this.db.filter(t => t.end === ld && t.type === 'item').forEach(t => this.traceCritical(t.uuid));
        
        this.renderT();
        setTimeout(() => this.renderG(), 50);
        if (shouldSave) this.autoSave();
    },

    traceCritical(uid) { 
        const t = this.db.find(x => x.uuid === uid); 
        if (t && !t.critical) { 
            t.critical = true; 
            (t.pred || []).forEach(pid => this.traceCritical(pid)); 
        } 
    },

    renderT() {
        const thead = document.getElementById('table-head-row');
        if (this.mode === 'planning') {
            thead.innerHTML = `<th class="w-8">#</th><th class="text-left">Descrição</th><th class="w-24">Início</th><th class="w-24">Término</th><th class="w-16">Duração</th><th class="w-24">Custo</th><th class="w-16">Links</th><th class="w-20">Ações</th>`;
        } else {
            thead.innerHTML = `<th class="w-8">#</th><th class="text-left">Descrição</th><th class="w-28 text-center text-slate-400 bg-slate-50 border-r border-slate-200">Físico Acumulado<br><span class="text-[8px] uppercase">(Anterior)</span></th><th class="w-32 text-center bg-blue-600 text-white font-black border-x border-blue-700">FÍSICO ATUAL<br><span class="text-[8px] opacity-80 uppercase">(Input Período)</span></th><th class="w-24 text-center font-bold text-slate-900 border-r border-slate-200">Novo Saldo<br><span class="text-[8px] uppercase text-slate-400">(Total)</span></th><th class="w-24 text-center">Status</th>`;
        }
        
        let h = '';
        this.db.forEach((t, i) => {
            const isG = t.type === 'group' || this.db.some(c=>c.parent===t.uuid);
            if (!isG && this.db.find(p => p.uuid === t.parent)?.collapsed) return;
            
            const hasPred = t.pred && t.pred.length > 0;
            const dateClass = hasPred ? 'blocked-cell' : 'input-cell text-center date-input';
            const isRoot = i === 0;

            let rowClasses = `${isG ? 'group-row' : ''} ${isRoot ? 'root-row' : ''} ${t.critical && !isG ? 'critical-row' : ''} hover:bg-slate-50 transition-colors`;
            
            if (this.linkingState.active) {
                rowClasses += ' cursor-pointer row-linking-hover';
                if (this.linkingState.source === t.uuid) rowClasses += ' row-linking-source';
            }

            h += `<tr class="${rowClasses}" data-uuid="${t.uuid}">`;
            h += `<td class="text-center text-[10px] text-slate-400 font-bold border-r">${i + 1}</td>`;
            
            h += `<td class="flex items-center gap-2 pl-2 border-r">
                    ${isG && !isRoot ? `<button class="toggle-group-btn font-bold w-4 h-4 flex items-center justify-center bg-white border rounded hover:bg-slate-100 mr-1" data-uuid="${t.uuid}">${t.collapsed ? '+' : '-'}</button>` : ''}
                    <input value="${t.name}" class="name-input input-cell font-bold" data-uuid="${t.uuid}" ${isRoot ? 'disabled' : ''}>
                  </td>`;

            if (this.mode === 'planning') {
                h += `<td><input type="text" value="${t.start || ''}" data-id="${t.uuid}" data-field="start" class="${isG ? 'input-cell text-center' : dateClass}" ${isG || hasPred ? 'disabled' : ''}></td>
                      <td><input type="text" value="${t.end || ''}" data-id="${t.uuid}" data-field="end" class="${isG ? 'input-cell text-center' : 'input-cell text-center date-input'}" ${isG ? 'disabled' : ''}></td>
                      <td><input type="number" value="${t.duration || 1}" class="dur-input input-cell text-center font-bold" data-uuid="${t.uuid}" ${isG ? 'disabled' : ''}></td>
                      <td class="text-right p-2">${isG ? fmt(t.cost) : `<input type="number" value="${t.cost || 0}" class="cost-input input-cell text-right" data-uuid="${t.uuid}">`}</td>
                      <td><input value="${(t.pred||[]).join(',')}" class="pred-input input-cell text-center" data-uuid="${t.uuid}"></td>
                      <td class="p-0 border-r no-print">
                        <div class="cell-actions">
                            ${!isG && i !== 0 ? `<button class="move-up-btn text-slate-400 hover:text-blue-600" data-uuid="${t.uuid}"><i data-lucide="arrow-up" class="w-3"></i></button><button class="move-down-btn text-slate-400 hover:text-blue-600" data-uuid="${t.uuid}"><i data-lucide="arrow-down" class="w-3"></i></button>` : ''}
                            ${!isRoot ? `<button class="rem-btn text-red-300 hover:text-red-500" data-uuid="${t.uuid}"><i data-lucide="trash-2" class="w-3.5"></i></button>` : ''}
                            ${isG ? `<button class="add-item-btn text-blue-500 hover:text-blue-700" data-uuid="${t.uuid}"><i data-lucide="plus-circle" class="w-3.5"></i></button>` : ''}
                        </div>
                      </td>`;
            } else {
                const total = t.progress || 0;
                h += `<td class="text-center text-slate-500">?%</td>`;
                h += `<td class="bg-blue-50 p-1"><input type="number" class="meas-input w-full h-full text-center" data-uuid="${t.uuid}"></td>`;
                h += `<td class="text-center font-black">${total}%</td><td class="text-center">STATUS</td>`;
            }
            h += '</tr>';
        });

        const tbody = document.getElementById('tbody');
        tbody.innerHTML = h;
        
        tbody.querySelectorAll('.toggle-group-btn').forEach(b => b.onclick = (e) => { e.stopPropagation(); this.toggleGroup(b.dataset.uuid); });
        tbody.querySelectorAll('.name-input').forEach(i => i.onchange = (e) => this.upd(i.dataset.uuid, 'name', e.target.value));
        tbody.querySelectorAll('.dur-input').forEach(i => i.onchange = (e) => this.upd(i.dataset.uuid, 'duration', e.target.value));
        tbody.querySelectorAll('.cost-input').forEach(i => i.onchange = (e) => this.upd(i.dataset.uuid, 'cost', e.target.value));
        tbody.querySelectorAll('.pred-input').forEach(i => i.onchange = (e) => this.updPr(i.dataset.uuid, e.target.value));
        tbody.querySelectorAll('.add-item-btn').forEach(b => b.onclick = (e) => { e.stopPropagation(); this.addItem(b.dataset.uuid); });
        tbody.querySelectorAll('.rem-btn').forEach(b => b.onclick = (e) => { e.stopPropagation(); this.rem(b.dataset.uuid); });
        
        this.setupDatePickers();
        if(window.lucide) window.lucide.createIcons();
    },

    setupDatePickers() {
        const els = document.querySelectorAll('.date-input');
        if(els.length > 0) {
            flatpickr(els, {
                dateFormat: "Y-m-d", altInput: true, altFormat: "d/m/Y", locale: "pt", allowInput: true,
                onChange: (selectedDates, dateStr, instance) => {
                    const input = instance.element;
                    const uuid = input.getAttribute('data-id');
                    const field = input.getAttribute('data-field');
                    if(uuid && field) {
                        if(field === 'start') this.upd(uuid, 'start', dateStr);
                        if(field === 'end') this.updEnd(uuid, dateStr);
                    }
                }
            });
        }
    },

    upd(u, f, v) { 
        const t = this.db.find(x => x.uuid === u); 
        if (f==='duration'||f==='cost') t[f]=parseFloat(v)||0; else t[f]=v; 
        this.recalc(); 
    },
    
    updEnd(u, v) { 
        const t = this.db.find(x => x.uuid === u); 
        t.end = v; 
        t.duration = getDuration(t.start, t.end); 
        this.recalc(); 
    },
    
    updPr(u, v) {
        const parts = v.split(','); 
        const finalPreds = []; 
        parts.forEach(p => { 
            p = p.trim(); 
            if (p) finalPreds.push(p); 
        }); 
        this.db.find(x => x.uuid === u).pred = finalPreds; 
        this.recalc(); 
    },

    addItem(parentId) {
        const p = this.db.find(x => x.uuid === parentId);
        if(p) p.collapsed = false;
        
        let idx = -1;
        for(let i=0; i<this.db.length; i++) { 
            if(this.db[i].uuid === parentId || this.db[i].parent === parentId) idx=i; 
        }
        
        if(idx !== -1) { 
            this.db.splice(idx+1, 0, { 
                uuid: 't'+Date.now(), name: 'Nova Tarefa', type: 'item', parent: parentId, 
                duration: 5, start: new Date().toISOString().split('T')[0], progress: 0, cost: 0 
            }); 
            this.recalc(); 
        }
    },
    
    toggleGroup(u) {
        const g = this.db.find(x => x.uuid === u);
        if(g) g.collapsed = !g.collapsed;
        this.recalc(false);
    },
    
    rem(u) {
        if(confirm("Deseja excluir?")) {
            let del = [u];
            let added = true;
            while(added){
                added = false;
                this.db.forEach(t => {
                    if(del.includes(t.parent) && !del.includes(t.uuid)){
                        del.push(t.uuid);
                        added = true;
                    }
                });
            }
            this.db = this.db.filter(x => !del.includes(x.uuid));
            this.recalc();
        }
    },

    renderG() {
        const tasks = []; 
        let minDate = new Date();
        
        this.db.forEach(t => {
            const isG = t.type === 'group' || this.db.some(c => c.parent === t.uuid);
            const parent = this.db.find(p => p.uuid === t.parent);
            if (!isG && parent && parent.collapsed) return;
            
            let css = 'bar-risk-low';
            if (isG) css = 'bar-group';
            else if (t.critical) css = 'bar-risk-critical';

            tasks.push({ 
                id: t.uuid, name: t.name, start: t.start, end: t.end, 
                progress: t.progress || 0, dependencies: (t.pred || []).join(','), 
                custom_class: css, _cost: t.cost || 0 
            });
            
            if (new Date(t.start) < minDate) minDate = new Date(t.start);
        });

        document.getElementById('gantt-box').innerHTML = '';
        if (tasks.length) {
            new Gantt("#gantt-box", tasks, { 
                view_mode: this.ganttViewMode, language: 'ptBr', bar_height: 25, padding: 15 
            });
        }
    },

    autoSave() {
        if(this.curr && auth.ss && auth.ss.id !== 'local_admin'){
            const i = projectManager.all.findIndex(p => p.id === this.curr);
            if(i > -1){
                projectManager.all[i].data = this.db;
                projectManager.save();
            }
        }
    },
    
    // --- USO DA CORREÇÃO AQUI ---
    exportCSV() {
        // Gera conteúdo do CSV
        const rows = [["ID", "Nome", "Tipo", "Inicio", "Fim", "Duracao (dias)", "Custo (R$)", "Progresso (%)", "Predecessoras"]];
        this.db.forEach(t => {
            rows.push([
                t.uuid, t.name, t.type === 'group' ? 'GRUPO' : 'TAREFA', t.start || '', t.end || '',
                t.duration || 0, (t.cost || 0).toString().replace('.', ','), (t.progress || 0).toString().replace('.', ','), (t.pred || []).join(',')
            ]);
        });
        
        let csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(";")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        
        const pName = document.getElementById('edit-name').innerText;
        const safeName = sanitizeFilename(pName);
        const dateStr = new Date().toISOString().split('T')[0];

        link.setAttribute("download", `bravo_export_${safeName}_${dateStr}.csv`);
        
        document.body.appendChild(link);
        link.click();
        link.remove();
    },

    initEapDrag() {},
    renderEAP() {},
    renderKanban() {},
    renderDash() {},
    renderCash() {},
    renderBalance() {},
    switchView(v) {
        document.querySelectorAll('.view').forEach(x => x.classList.add('hidden'));
        document.getElementById('v-'+v).classList.remove('hidden');
        if(v === 'main') setTimeout(() => this.setupSync(), 200);
    },
    printPresentation() { window.print(); }
};