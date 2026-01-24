const FB = "https://bravo-civil-default-rtdb.firebaseio.com/";
const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const auth = {
    ss: null,
    async login() {
        const btn = document.getElementById('btn-login');
        const originalText = btn.innerText;
        btn.innerText = "Verificando...";
        btn.disabled = true;

        const u = document.getElementById('log-u').value;
        const p = document.getElementById('log-p').value;

        if (u === 'admin' && p === '123') {
            this.ss = { u: 'Admin', role: 'ADMIN', id: 'local_admin' };
            router.go('manager');
            btn.innerText = originalText;
            btn.disabled = false;
            return;
        }

        try {
            const r = await fetch(`${FB}users.json`);
            if (!r.ok) throw new Error("Banco de dados indisponível ou privado.");
            const d = await r.json() || {};
            for (let k in d) {
                if (d[k].u === u && d[k].p === p) {
                    this.ss = { ...d[k], id: k };
                    await projectManager.load();
                    router.go('manager');
                    return;
                }
            }
            alert('Usuário ou senha incorretos');
        } catch (e) {
            console.error(e);
            alert('Erro ao conectar com o banco de dados:\n' + e.message + '\n\nTente usar o login local: admin / 123');
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }
};

const userManager = {
    open() { document.getElementById('modal-users').classList.add('active'); this.render(); },
    async render() {
        if (!auth.ss || auth.ss.id === 'local_admin') {
            document.getElementById('user-list').innerHTML = '<p class="text-xs text-orange-500 italic text-center">Gestão de equipe indisponível no modo local.</p>';
            return;
        }
        try {
            const r = await fetch(`${FB}users.json`);
            const d = await r.json() || {};
            document.getElementById('user-list').innerHTML = Object.keys(d)
                .filter(k => d[k].owner === auth.ss.id)
                .map(k => `<div class="flex justify-between text-xs bg-white p-2 rounded shadow-sm mb-1"><span>${d[k].u}</span><button onclick="userManager.del('${k}')" class="text-red-500">x</button></div>`)
                .join('');
        } catch (e) {
            document.getElementById('user-list').innerHTML = '<p class="text-xs text-red-500">Erro ao carregar equipe.</p>';
        }
    },
    async add() {
        if (!auth.ss || auth.ss.id === 'local_admin') return alert("Indisponível offline.");
        const u = document.getElementById('nu-u').value;
        const p = document.getElementById('nu-p').value;
        if (u && p) {
            await fetch(`${FB}users/u${Date.now()}.json`, { method: 'PUT', body: JSON.stringify({ u, p, role: 'COLABORADOR', owner: auth.ss.id }) });
            this.render();
        }
    },
    async del(id) { 
        if (!auth.ss || auth.ss.id === 'local_admin') return;
        await fetch(`${FB}users/${id}.json`, { method: 'DELETE' }); 
        this.render(); 
    }
};

const measurementEngine = {
    editingHistoryId: null,
    async saveSnapshot() {
        if (!confirm("Confirmar fechamento da medição atual?")) return;
        if (!editor.curr) { alert("Erro: Projeto não carregado."); return; }
        const items = editor.db.filter(t => t.type === 'item');
        if (items.length === 0) { alert("Erro: Não há itens para medir."); return; }

        const snapshot = {
            id: 'm' + Date.now(),
            date: new Date().toISOString(),
            user: auth.ss ? auth.ss.u : 'Admin',
            items: items.map(t => ({ uuid: t.uuid, name: t.name, progress: parseFloat(t.progress || 0), cost: parseFloat(t.cost || 0) }))
        };

        if (!editor.measurements) editor.measurements = [];
        editor.measurements.push(snapshot);

        const btn = document.querySelector('button[onclick="measurementEngine.saveSnapshot()"]');
        if(btn) {
            const originalText = btn.innerHTML;
            btn.innerHTML = "SALVANDO...";
            btn.disabled = true;
            
            try {
                const pIndex = projectManager.all.findIndex(p => p.id === editor.curr);
                if (pIndex === -1) throw new Error("Projeto perdido");
                projectManager.all[pIndex].measurements = editor.measurements;
                projectManager.all[pIndex].data = editor.db;
                await projectManager.save();
                
                const reloadedP = projectManager.all.find(p => p.id === editor.curr);
                editor.measurements = reloadedP.measurements || [];
                editor.recalc();
                alert("Medição salva e sincronizada com sucesso!");
            } catch (e) {
                console.error(e);
                alert("Erro fatal ao salvar medição.");
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
                this.viewHistory();
            }
        }
    },

    viewHistory() {
        document.getElementById('modal-history').classList.add('active');
        const list = document.getElementById('history-list');
        const mList = editor.measurements || [];

        if (mList.length === 0) {
            list.innerHTML = `<div class="flex flex-col items-center justify-center h-40 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50"><i data-lucide="clipboard-x" class="w-8 h-8 text-slate-400 mb-2"></i><p class="text-slate-500 font-bold text-xs">Nenhuma medição encontrada.</p></div>`;
            if(window.lucide) lucide.createIcons();
            return;
        }

        list.innerHTML = mList.map((m, i) => {
            const d = new Date(m.date);
            const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const totalCost = m.items.reduce((acc, it) => acc + (parseFloat(it.cost) || 0), 0);
            const totalEarned = m.items.reduce((acc, it) => acc + ((parseFloat(it.cost) || 0) * (it.progress/100)), 0);
            const globalPerc = totalCost ? Math.round((totalEarned / totalCost) * 100) : 0;
            return `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center hover:border-blue-300 transition mb-2 group"><div class="cursor-pointer flex-grow" onclick="measurementEngine.viewDetail('${m.id}')"><div class="flex items-center gap-2 mb-1"><span class="bg-blue-600 text-white px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">M${i+1}</span><span class="text-xs font-bold text-slate-700">${dateStr}</span></div><p class="text-[10px] text-slate-400 flex items-center gap-1"><i data-lucide="user" class="w-3"></i> ${m.user}</p></div><div class="flex items-center gap-4"><div class="text-right"><span class="block text-xl font-black text-slate-800 leading-none">${globalPerc}%</span><span class="text-[8px] text-slate-400 uppercase font-bold">Avanço</span></div><div class="flex gap-1 pl-4 border-l"><button onclick="measurementEngine.openCorrection('${m.id}')" class="p-2 text-slate-300 hover:text-yellow-600 hover:bg-yellow-50 rounded transition" title="Corrigir"><i data-lucide="edit-2" class="w-4"></i></button><button onclick="measurementEngine.delete('${m.id}')" class="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded transition" title="Excluir"><i data-lucide="trash-2" class="w-4"></i></button></div></div></div>`;
        }).reverse().join('');
        if(window.lucide) lucide.createIcons();
    },

    viewDetail(mid) {
        const m = editor.measurements.find(x => x.id === mid);
        if (!m) return;
        const mIndex = editor.measurements.findIndex(x => x.id === mid);
        const prevM = mIndex > 0 ? editor.measurements[mIndex - 1] : null;

        document.getElementById('modal-history').classList.remove('active');
        document.getElementById('modal-history-detail').classList.add('active');
        document.getElementById('history-detail-subtitle').innerText = `${new Date(m.date).toLocaleString()} - Responsável: ${m.user}`;

        const tbody = document.getElementById('history-detail-body');
        tbody.innerHTML = m.items.map(item => {
            let prevProg = 0;
            if (prevM) {
                const prevItem = prevM.items.find(pi => pi.uuid === item.uuid);
                if (prevItem) prevProg = prevItem.progress;
            }
            const delta = (item.progress - prevProg).toFixed(2);
            
            const currentTask = editor.db.find(t => t.uuid === item.uuid);
            let groupName = "";
            if (currentTask && currentTask.parent) {
                const parent = editor.db.find(p => p.uuid === currentTask.parent);
                if(parent) groupName = parent.name;
            }

            if (item.progress > 0 || prevProg > 0) {
                const deltaClass = delta > 0 ? "text-blue-600 bg-blue-50" : (delta < 0 ? "text-red-600 bg-red-50" : "text-slate-400");
                const deltaSign = delta > 0 ? "+" : "";
                return `<tr class="hover:bg-slate-50 transition border-b border-slate-100"><td class="p-3 font-medium text-slate-700 text-[10px]"><span class="block text-[9px] text-slate-400 font-bold uppercase mb-0.5">${groupName}</span>${item.name}</td><td class="p-3 text-center text-slate-400 font-bold">${prevProg}%</td><td class="p-3 text-center font-bold ${deltaClass} rounded-lg">${deltaSign}${delta}%</td><td class="p-3 text-center font-black text-slate-900">${item.progress}%</td></tr>`;
            }
            return '';
        }).join('');
    },

    async delete(mid) {
        if (!confirm("ATENÇÃO: Excluir esta medição pode afetar o cálculo do 'Acumulado Anterior'. Continuar?")) return;
        editor.measurements = editor.measurements.filter(x => x.id !== mid);
        const pIndex = projectManager.all.findIndex(p => p.id === editor.curr);
        if (pIndex !== -1) {
            projectManager.all[pIndex].measurements = editor.measurements;
            await projectManager.save();
            editor.recalc();
            this.viewHistory();
        }
    },

    openCorrection(mid) {
        this.editingHistoryId = mid;
        const m = editor.measurements.find(x => x.id === mid);
        if (!m) return;
        document.getElementById('modal-history').classList.remove('active');
        document.getElementById('modal-history-edit').classList.add('active');
        document.getElementById('history-edit-body').innerHTML = m.items.map(item => `
            <tr class="border-b"><td class="p-2 text-slate-700 truncate max-w-[200px]">${item.name}</td><td class="p-2 text-right"><input type="number" value="${item.progress}" min="0" max="100" class="border p-1 w-20 text-center rounded font-bold text-slate-800 focus:border-blue-500 outline-none" id="edit-hist-${item.uuid}"> <span class="text-slate-400">%</span></td></tr>`).join('');
    },

    async saveCorrection() {
        const m = editor.measurements.find(x => x.id === this.editingHistoryId);
        if (m) {
            m.items.forEach(item => {
                const el = document.getElementById(`edit-hist-${item.uuid}`);
                if (el) item.progress = parseFloat(el.value) || 0;
            });
            const pIndex = projectManager.all.findIndex(p => p.id === editor.curr);
            if (pIndex !== -1) {
                projectManager.all[pIndex].measurements = editor.measurements;
                await projectManager.save();
                editor.recalc();
                alert("Correção aplicada.");
                document.getElementById('modal-history-edit').classList.remove('active');
                this.viewHistory();
            }
        }
    }
};

const editor = {
    curr: null, db: [], eap: [], kb: [], measurements: [], cfg: {}, baselines: [], snapshots: [], charts: {}, 
    mode: 'planning', ganttViewMode: 'Day', zoomLevel: 1, editingGroup: null, editingHistoryIndex: null,
    drag: { active: false, item: null }, link: { active: false, source: null }, 
    eapPan: { active: false, startX: 0, startY: 0, transX: 0, transY: 0 }, 
    financialBreakdown: {},
    linkingState: { active: false, source: null },
    saveTimeout: null, 

    async open(id) {
        this.curr = id;
        const p = projectManager.all.find(x => x.id === id);
        
        // PROTEÇÃO CONTRA PROJETO VAZIO/INEXISTENTE
        if (!p) {
            alert("Erro: Projeto não encontrado na memória. Se você atualizou a página no modo Local Admin, os dados foram perdidos.");
            router.go('manager');
            return;
        }

        if (!p.kb) p.kb = [];
        if (!p.measurements) p.measurements = [];
        this.db = p.data || [];
        this.eap = p.eap || [];
        this.kb = p.kb;
        this.measurements = p.measurements;
        this.cfg = p.cfg || { sat: false, sun: false, holidays: [] };
        this.baselines = p.baselines || [];
        this.snapshots = p.snapshots || [];
        document.getElementById('edit-name').innerText = p.name ? p.name.toUpperCase() : 'SEM NOME';
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
    isWorkDay(date) { const d = new Date(date + "T00:00:00"); if (!this.cfg.sat && d.getDay() === 6) return false; if (!this.cfg.sun && d.getDay() === 0) return false; if ((this.cfg.holidays || []).includes(date)) return false; return true; },
    addWorkDays(start, days) { let d = new Date(start + "T00:00:00"), c = 0, n = parseInt(days) - 1; while (c < n) { d.setDate(d.getDate() + 1); if (this.isWorkDay(d.toISOString().split('T')[0])) c++; } return d.toISOString().split('T')[0]; },
    getNextWorkDay(dateStr) { let d = new Date(dateStr + "T00:00:00"); do { d.setDate(d.getDate() + 1); } while (!this.isWorkDay(d.toISOString().split('T')[0])); return d.toISOString().split('T')[0]; },
    getDuration(start, end) { let d1 = new Date(start + "T00:00:00"), d2 = new Date(end + "T00:00:00"), c = 0; if (d2 < d1) return 1; while (d1 <= d2) { if (this.isWorkDay(d1.toISOString().split('T')[0])) c++; d1.setDate(d1.getDate() + 1); } return c; },
    changeGanttMode(m) { this.ganttViewMode = m; this.renderG(); },

    toggleLinkMode() {
        this.linkingState.active = !this.linkingState.active;
        this.linkingState.source = null; 
        const btn = document.getElementById('btn-link-mode');
        if (this.linkingState.active) {
            document.body.classList.add('linking-mode');
            btn.classList.remove('bg-slate-200', 'text-slate-600');
            btn.classList.add('bg-blue-600', 'text-white', 'animate-pulse');
            btn.innerHTML = `<i data-lucide="link-2" class="w-3"></i> SELECIONE A PREDECESSORA`;
        } else {
            document.body.classList.remove('linking-mode');
            btn.classList.add('bg-slate-200', 'text-slate-600');
            btn.classList.remove('bg-blue-600', 'text-white', 'animate-pulse');
            btn.innerHTML = `<i data-lucide="link" class="w-3"></i> LIGAR TAREFAS`;
            this.renderT();
        }
        if(window.lucide) lucide.createIcons();
    },

    handleRowClick(uuid) {
        if (!this.linkingState.active) return;
        if (!this.linkingState.source) {
            this.linkingState.source = uuid;
            this.renderT();
            const btn = document.getElementById('btn-link-mode');
            btn.innerHTML = `<i data-lucide="arrow-down-circle" class="w-3"></i> CLIQUE NA SUCESSORA`;
            if(window.lucide) lucide.createIcons();
            return;
        }
        if (this.linkingState.source === uuid) {
            this.linkingState.source = null;
            this.renderT();
            return;
        }
        const target = this.db.find(x => x.uuid === uuid);
        if (target) {
            if (!target.pred) target.pred = [];
            if (!target.pred.includes(this.linkingState.source)) {
                target.pred.push(this.linkingState.source);
                this.recalc(); 
            }
        }
        this.linkingState.source = null;
        document.getElementById('btn-link-mode').innerHTML = `<i data-lucide="link-2" class="w-3"></i> SELECIONE A PREDECESSORA`;
        if(window.lucide) lucide.createIcons();
        this.renderT();
    },

    moveItem(uuid, direction) {
        const index = this.db.findIndex(x => x.uuid === uuid);
        if (index === -1) return;
        const item = this.db[index];
        const newIndex = index + direction;
        if (newIndex < 1 || newIndex >= this.db.length) return; 
        const neighbor = this.db[newIndex];
        if (item.parent !== neighbor.parent && item.type !== 'group') {
            alert("Para manter a organização, mova itens apenas dentro do seu próprio grupo.");
            return;
        }
        if (item.type === 'item') {
            [this.db[index], this.db[newIndex]] = [this.db[newIndex], this.db[index]];
        } 
        else if (item.type === 'group') {
            alert("Mover Grupos inteiros requer arrastar e soltar (recurso futuro). Por enquanto, mova as tarefas.");
            return;
        }
        this.recalc();
    },

    upd(u, f, v) { 
        const t = this.db.find(x => x.uuid === u); 
        if(!t) return;
        
        if (f==='duration'||f==='cost') t[f]=parseFloat(v)||0; 
        else t[f]=v; 

        // OTIMIZAÇÃO: Se for nome, salva mas não redesenha tudo
        if (f === 'name') {
            this.autoSave();
            return; 
        }
        this.recalc(); 
    },

    updEnd(u, v) { const t = this.db.find(x => x.uuid === u); if(t){ t.end = v; t.duration = this.getDuration(t.start, t.end); this.recalc(); } },
    updPr(u, v) { const parts = v.split(','); const finalPreds = []; parts.forEach(p => { p = p.trim(); if (!p) return; if (!isNaN(p)) { const idx = parseInt(p) - 1; if (this.db[idx]) finalPreds.push(this.db[idx].uuid); } else { finalPreds.push(p); } }); const t = this.db.find(x => x.uuid === u); if(t) { t.pred = finalPreds; this.recalc(); } },
    
    addItem(parentId) { const p = this.db.find(x => x.uuid === parentId); if(p) p.collapsed=false; let idx = -1; for(let i=0; i<this.db.length; i++) { if(this.db[i].uuid===parentId || this.db[i].parent===parentId) idx=i; } if(idx!==-1) { this.db.splice(idx+1, 0, { uuid: 't'+Date.now(), name: 'Nova Tarefa', type: 'item', parent: parentId, duration: 5, start: new Date().toISOString().split('T')[0], progress: 0, cost: 0 }); this.recalc(); } },
    addGroup() { this.db.push({ uuid: 'g'+Date.now(), name: 'NOVA ETAPA', type: 'group', parent: 'root', cost: 0, progress: 0, collapsed: false }); this.recalc(); setTimeout(() => document.getElementById('wrapper-table').scrollTop = document.getElementById('wrapper-table').scrollHeight, 100); },
    toggleAllGroups(c) { this.db.forEach(t => { if(t.type==='group'||this.db.some(x=>x.parent===t.uuid)) t.collapsed=c; }); this.recalc(false); },
    toggleGroup(u) { const g = this.db.find(x=>x.uuid===u); if(g) g.collapsed=!g.collapsed; this.recalc(false); },
    rem(u) { if(confirm("Del?")) { let del=[u]; let added=true; while(added){added=false; this.db.forEach(t=>{if(del.includes(t.parent)&&!del.includes(t.uuid)){del.push(t.uuid);added=true;}});} this.db=this.db.filter(x=>!del.includes(x.uuid)); this.recalc(); } },
    cloneGroup(gid) { const gIdx = this.db.findIndex(x => x.uuid === gid); if (gIdx === -1) return; const og = this.db[gIdx]; const kids = this.db.filter(x => x.parent === gid); const newGid = 'g' + Date.now(); const newG = { ...og, uuid: newGid, name: og.name + ' (Cópia)' }; const newKids = kids.map((k, i) => ({ ...k, uuid: 't' + Date.now() + i, parent: newGid, progress: 0 })); let ins = gIdx; while (ins + 1 < this.db.length && this.db[ins + 1].parent === gid) ins++; this.db.splice(ins + 1, 0, newG, ...newKids); this.recalc(); },
    
    handleTableKey(e, i) { if(e.key==='Enter') { e.preventDefault(); i.blur(); const c = i.closest('td'); const r = c.closest('tr'); const nr = r.nextElementSibling; if (nr) { const tc = nr.children[c.cellIndex]; if (tc) { const ti = tc.querySelector('input'); if (ti && !ti.disabled) ti.focus(); } } } },

    renderT() {
        const thead = document.getElementById('table-head-row');
        if (!thead) return; // Segurança

        // Renderiza Cabeçalho Primeiro
        if (this.mode === 'planning') {
            thead.innerHTML = `<th class="w-8">#</th><th class="text-left">Descrição</th><th class="w-24">Início</th><th class="w-24">Término</th><th class="w-16">Duração</th><th class="w-24">Custo</th><th class="w-16">Links</th><th class="w-20">Ações</th>`;
        } else {
            thead.innerHTML = `<th class="w-8">#</th><th class="text-left">Descrição</th><th class="w-28 text-center text-slate-400 bg-slate-50 border-r border-slate-200">Físico Acumulado<br><span class="text-[8px] uppercase">(Anterior)</span></th><th class="w-32 text-center bg-blue-600 text-white font-black border-x border-blue-700">FÍSICO ATUAL<br><span class="text-[8px] opacity-80 uppercase">(Input Período)</span></th><th class="w-24 text-center font-bold text-slate-900 border-r border-slate-200">Novo Saldo<br><span class="text-[8px] uppercase text-slate-400">(Total)</span></th><th class="w-24 text-center">Status</th>`;
        }
        
        // Se não houver dados, para aqui para evitar erro
        if (!this.db || this.db.length === 0) {
            document.getElementById('tbody').innerHTML = '<tr><td colspan="8" class="text-center p-4 text-slate-400">Nenhum item encontrado.</td></tr>';
            return;
        }

        let h = '';
        this.db.forEach((t, i) => {
            const isG = t.type === 'group' || this.db.some(c=>c.parent===t.uuid);
            const parent = this.db.find(p => p.uuid === t.parent);
            if (!isG && parent && parent.collapsed) return;
            
            const hasPred = t.pred && t.pred.length > 0;
            const dateClass = hasPred ? 'blocked-cell' : 'input-cell text-center date-input';
            
            let linkDisplay = ''; 
            if (hasPred) {
                linkDisplay = t.pred.map(uid => { const idx = this.db.findIndex(x => x.uuid === uid); return idx !== -1 ? (idx + 1) : '?'; }).join(', ');
            }
            const kd = `onkeydown="editor.handleTableKey(event, this)"`;
            
            const isRoot = i === 0;
            let rowClasses = `${isG ? 'group-row' : ''} ${isRoot ? 'root-row' : ''} ${t.critical && !isG ? 'critical-row' : ''} hover:bg-slate-50 transition-colors`;
            
            if (this.linkingState.active) {
                rowClasses += ' cursor-pointer row-linking-hover';
                if (this.linkingState.source === t.uuid) {
                    rowClasses += ' row-linking-source';
                }
            }

            h += `<tr class="${rowClasses}" onclick="editor.handleRowClick('${t.uuid}')">`;
            h += `<td class="text-center text-[10px] text-slate-400 font-bold border-r">${i + 1}</td>`;
            h += `<td class="flex items-center gap-2 pl-2 border-r">
                    ${isG && !isRoot ? `<button onclick="event.stopPropagation(); editor.toggleGroup('${t.uuid}')" class="font-bold w-4 h-4 flex items-center justify-center bg-white border rounded hover:bg-slate-100 mr-1">${t.collapsed ? '+' : '-'}</button>` : ''}
                    <input value="${t.name}" onchange="editor.upd('${t.uuid}','name',this.value)" onclick="event.stopPropagation()" ${kd} class="input-cell font-bold" ${isRoot ? 'disabled' : ''}>
                  </td>`;

            if (this.mode === 'planning') {
                h += `<td><input type="text" value="${t.start || ''}" data-id="${t.uuid}" data-field="start" onclick="event.stopPropagation()" class="${isG ? 'input-cell text-center' : dateClass}" ${isG || hasPred ? 'disabled' : ''}></td>
                      <td><input type="text" value="${t.end || ''}" data-id="${t.uuid}" data-field="end" onclick="event.stopPropagation()" class="${isG ? 'input-cell text-center' : 'input-cell text-center date-input'}" ${isG ? 'disabled' : ''}></td>
                      <td><input type="number" value="${t.duration || 1}" onchange="editor.upd('${t.uuid}','duration',this.value)" onclick="event.stopPropagation()" ${kd} class="input-cell text-center font-bold" ${isG ? 'disabled' : ''}></td>
                      <td class="text-right p-2">${isG ? fmt(t.cost) : `<input type="number" value="${t.cost || 0}" onchange="editor.upd('${t.uuid}','cost',this.value)" onclick="event.stopPropagation()" ${kd} class="input-cell text-right">`}</td>
                      <td><input value="${linkDisplay}" onchange="editor.updPr('${t.uuid}',this.value)" onclick="event.stopPropagation()" ${kd} class="input-cell text-center" placeholder="Ex: 1, 3"></td>
                <td class="p-0 border-r no-print">
                    <div class="cell-actions" onclick="event.stopPropagation()">
                        ${!isG && i !== 0 ? `<button onclick="editor.moveItem('${t.uuid}', -1)" class="text-slate-400 hover:text-blue-600" title="Subir"><i data-lucide="arrow-up" class="w-3"></i></button><button onclick="editor.moveItem('${t.uuid}', 1)" class="text-slate-400 hover:text-blue-600" title="Descer"><i data-lucide="arrow-down" class="w-3"></i></button>` : ''}
                        ${!isG && i !== 0 ? `<div class="w-[1px] h-3 bg-slate-200 mx-1"></div>` : ''}
                        ${!isRoot ? `<button onclick="editor.rem('${t.uuid}')" class="text-red-300 hover:text-red-500" title="Excluir"><i data-lucide="trash-2" class="w-3.5"></i></button>` : ''}
                        ${isG && !isRoot ? `<button onclick="editor.cloneGroup('${t.uuid}')" class="text-slate-500 hover:text-slate-800" title="Duplicar"><i data-lucide="copy" class="w-3.5"></i></button>` : ''}
                        ${isG ? `<button onclick="editor.openPurchaseModal('${t.uuid}')" class="text-purple-600" title="Financeiro"><i data-lucide="dollar-sign" class="w-3.5"></i></button>` : ''}
                        ${isG ? `<button onclick="editor.addItem('${t.uuid}')" class="text-blue-500 hover:text-blue-700" title="Adicionar Item"><i data-lucide="plus-circle" class="w-3.5"></i></button>` : ''}
                    </div>
                </td>`;
            } else {
                const prev = this.getLastSnapshotProgress(t.uuid);
                const total = t.progress || 0;
                let currentInput = Math.max(0, (total - prev).toFixed(2));
                h += `<td class="text-center text-slate-500 font-medium text-[10px] bg-slate-50 border-r border-slate-200 select-none">${prev}%</td>`;
                h += `<td class="border-x border-blue-700 bg-blue-50 p-1">${isG ? '<div class="text-center text-slate-300">-</div>' : `<input type="number" min="0" max="100" step="0.01" value="${currentInput}" onchange="editor.updMeasurementDelta('${t.uuid}', this.value, ${prev})" onclick="event.stopPropagation()" ${kd} class="w-full h-full text-center font-black text-blue-800 bg-white border border-blue-300 rounded focus:ring-4 focus:ring-blue-200 outline-none" placeholder="0">`}</td>`;
                h += `<td class="text-center font-black text-slate-900 text-xs border-r border-slate-200 bg-white">${total}%</td>`;
                h += `<td class="text-center text-[9px] font-bold ${total >= 100 ? 'text-green-600' : 'text-orange-500'}">${total >= 100 ? '100%' : 'EM ANDAMENTO'}</td>`;
            }
            h += '</tr>';
        });
        document.getElementById('tbody').innerHTML = h;
        if(window.lucide) lucide.createIcons();
        this.setupDatePickers();
    },
    
    setupDatePickers() {
        if(!window.flatpickr) return;
        const els = document.querySelectorAll('.date-input');
        if(els.length > 0) {
            flatpickr(els, {
                dateFormat: "Y-m-d", altInput: true, altFormat: "d/m/Y", locale: "pt", allowInput: true,
                onChange: function(selectedDates, dateStr, instance) {
                    const input = instance.element;
                    const uuid = input.getAttribute('data-id');
                    const field = input.getAttribute('data-field');
                    if(uuid && field) {
                        if(field === 'start') editor.upd(uuid, 'start', dateStr);
                        if(field === 'end') editor.updEnd(uuid, dateStr);
                    }
                }
            });
        }
    },

    getLastSnapshotProgress(taskId) { if (!this.measurements || !this.measurements.length) return 0; const lastM = this.measurements[this.measurements.length - 1]; const item = lastM.items.find(i => i.uuid === taskId); return item ? parseFloat(item.progress) : 0; },
    updMeasurementDelta(taskId, deltaVal, previousTotal) { let delta = parseFloat(deltaVal) || 0; let newTotal = previousTotal + delta; if (newTotal > 100) { newTotal = 100; delta = 100 - previousTotal; } if (newTotal < 0) { newTotal = 0; } const t = this.db.find(x=>x.uuid===taskId); if(t){t.progress = newTotal; this.recalc();} },
    
    renderG() {
        const box = document.getElementById('gantt-box');
        if(!box) return;
        box.innerHTML = '';

        if (!this.db || this.db.length === 0) return;

        const tasks = []; 
        let minDate = new Date(); 
        let hasDates = false;

        this.db.forEach(t => { 
            if (t.start && t.start < minDate.toISOString().split('T')[0]) {
                minDate = new Date(t.start); 
                hasDates = true;
            }
        });
        
        // Se não houver datas válidas, não renderiza para evitar erro da lib
        if(!hasDates) return;

        const startView = new Date(minDate); 
        startView.setDate(startView.getDate() - 7); 

        this.db.forEach((t, i) => { 
            const isG = t.type === 'group' || this.db.some(c=>c.parent===t.uuid); 
            const parent = this.db.find(p => p.uuid === t.parent); 
            if (!isG && parent && parent.collapsed) return; 

            let css = 'bar-standard'; 
            let start = t.start; 
            let end = t.end; 

            if (!start || !end) { 
                start = new Date().toISOString().split('T')[0]; 
                end = start; 
                css = 'bar-invisible'; 
            } else { 
                if (isG) {
                    css = 'bar-group'; 
                } else { 
                    const today = new Date().toISOString().split('T')[0]; 
                    if (t.progress === 100) css = 'bar-risk-ok'; 
                    else if (t.end < today) css = 'bar-risk-critical'; 
                    else if (t.critical) css = 'bar-risk-high'; 
                    else css = 'bar-standard'; 
                } 
            } 
            
            tasks.push({ 
                id: t.uuid, 
                name: t.name, 
                start: start, 
                end: end, 
                progress: t.progress || 0, 
                dependencies: (t.pred || []).join(','), 
                custom_class: css, 
                _cost: t.cost || 0, 
                _dur: t.duration || 0 
            }); 
        });

        if (tasks.length > 0 && window.Gantt) {
            try {
                this.ganttInst = new Gantt("#gantt-box", tasks, { 
                    view_mode: this.ganttViewMode, 
                    language: 'ptBr', 
                    bar_height: 24, 
                    padding: 16, 
                    header_height: 50, 
                    custom_popup_html: function(task) { 
                        const start = new Date(task.start).toLocaleDateString('pt-BR'); 
                        const end = new Date(task.end).toLocaleDateString('pt-BR'); 
                        const cost = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(task._cost); 
                        const statusColor = task.progress >= 100 ? 'text-green-400' : (task.progress > 0 ? 'text-blue-400' : 'text-slate-400');
                        return `<div class="popup-wrapper font-sans"><div class="bg-slate-800 p-3 border-b border-slate-700"><div class="font-bold text-[11px] text-white uppercase tracking-wider mb-1 truncate">${task.name}</div><div class="flex justify-between items-center"><span class="text-[10px] font-black ${statusColor}">${task.progress}% Concluído</span><span class="text-[9px] text-slate-400 font-mono bg-slate-700 px-1 rounded">${task._dur} dias</span></div></div><div class="p-3 bg-slate-900/50 text-[10px] space-y-1 text-slate-300"><div class="flex justify-between"><span>Início:</span> <span class="text-white font-bold">${start}</span></div><div class="flex justify-between"><span>Término:</span> <span class="text-white font-bold">${end}</span></div><div class="flex justify-between border-t border-slate-700 pt-1 mt-1"><span>Custo:</span> <span class="text-green-400 font-bold">${cost}</span></div></div></div>`; 
                    } 
                });

                setTimeout(() => { 
                    const svg = document.querySelector('#gantt-box svg'); 
                    if (!svg) return; 
                    this.drawTodayLine(svg, startView);
                    this.db.forEach(t => { 
                        if (t.baseStart && t.baseEnd) { 
                            const taskGroup = svg.querySelector(`.bar-wrapper[data-id="${t.uuid}"]`); 
                            if (taskGroup && !taskGroup.classList.contains('bar-invisible')) { 
                                const rect = taskGroup.querySelector('.bar');
                                if (rect) {
                                    const start = new Date(t.start); 
                                    const baseStart = new Date(t.baseStart); 
                                    const baseEnd = new Date(t.baseEnd); 
                                    const durationDays = (new Date(t.end) - start) / (1000 * 60 * 60 * 24); 
                                    const baseDurationDays = (baseEnd - baseStart) / (1000 * 60 * 60 * 24); 
                                    const diffDays = (baseStart - start) / (1000 * 60 * 60 * 24); 
                                    if (durationDays > 0) { 
                                        const currentWidth = parseFloat(rect.getAttribute("width")); 
                                        const pxPerDay = currentWidth / Math.max(1, durationDays); 
                                        const baseX = parseFloat(rect.getAttribute("x")) + (diffDays * pxPerDay); 
                                        const baseWidth = Math.max(1, baseDurationDays * pxPerDay); 
                                        const baseRect = document.createElementNS("http://www.w3.org/2000/svg", "rect"); 
                                        baseRect.setAttribute("x", baseX); 
                                        baseRect.setAttribute("y", parseFloat(rect.getAttribute("y")) + 16); 
                                        baseRect.setAttribute("width", baseWidth); 
                                        baseRect.setAttribute("height", "4"); 
                                        baseRect.setAttribute("class", "baseline-bar"); 
                                        taskGroup.appendChild(baseRect); 
                                    } 
                                }
                            } 
                        } 
                    }); 
                }, 100);
            } catch(e) { console.error("Erro ao desenhar Gantt:", e); }
        }
    },

    drawTodayLine(svg, startDate) {
        const today = new Date();
        const diffTime = today - startDate;
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        let columnWidth = 38; 
        if (this.ganttViewMode === 'Week') columnWidth = 140; 
        if (this.ganttViewMode === 'Month') columnWidth = 120; 
        const xPos = (diffDays * columnWidth) + 15; 
        const svgHeight = svg.getAttribute('height');
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", xPos);
        line.setAttribute("y1", 0);
        line.setAttribute("x2", xPos);
        line.setAttribute("y2", svgHeight);
        line.setAttribute("class", "today-highlight-line");
        svg.appendChild(line);
    },

    renderDash() {
        if (!document.getElementById('pie-chart')) return; if (this.charts.pie) { this.charts.pie.destroy(); this.charts.pie = null; } if (this.charts.scurve) { this.charts.scurve.destroy(); this.charts.scurve = null; }
        const tot = this.db.reduce((a, t) => a + (t.type === 'item' ? 1 : 0), 0); const done = this.db.reduce((a, t) => a + (t.type === 'item' && t.progress == 100 ? 1 : 0), 0); const cost = this.db.reduce((a, t) => a + (t.type === 'item' ? (parseFloat(t.cost) || 0) : 0), 0); const prog = tot ? Math.round((done / tot) * 100) : 0; const measCount = this.measurements ? this.measurements.length : 0;
        document.getElementById('dash-kpi').innerHTML = `<div class="bg-blue-600 text-white p-6 rounded-[30px] shadow-lg"><h2 class="text-4xl font-black">${prog}%</h2><p class="text-[10px] opacity-70 uppercase">Global</p></div><div class="bg-white border p-6 rounded-[30px]"><h2 class="text-xl font-black text-slate-700">${fmt(cost)}</h2><p class="text-[10px] text-slate-400 uppercase">Orçamento</p></div><div class="bg-white border p-6 rounded-[30px]"><h2 class="text-xl font-black text-green-600">${done}/${tot}</h2><p class="text-[10px] text-slate-400 uppercase">Tarefas</p></div><div class="bg-white border p-6 rounded-[30px]"><h2 class="text-xl font-black text-purple-500">${measCount}</h2><p class="text-[10px] text-slate-400 uppercase">Medições</p></div>`;
        const ctxPie = document.getElementById('pie-chart'); const ctxS = document.getElementById('scurve-chart');
        if (ctxPie && ctxS && window.Chart) {
            this.charts.pie = new Chart(ctxPie, { type: 'doughnut', data: { labels: ['Concluído', 'Pendente'], datasets: [{ data: [done, tot - done], backgroundColor: ['#22c55e', '#e2e8f0'] }] }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
            const items = this.db.filter(t => t.type === 'item' && t.start && t.end && t.cost > 0); let labels = []; let dataPlanned = [];
            if (items.length > 0) { const allDates = items.map(t => [new Date(t.start), new Date(t.end)]).flat().sort((a, b) => a - b); const minD = new Date(allDates[0]); const maxD = new Date(allDates[allDates.length - 1]); let curr = new Date(minD.getFullYear(), minD.getMonth(), 1); const endPoint = new Date(maxD.getFullYear(), maxD.getMonth() + 1, 1); while (curr <= endPoint) { labels.push(curr.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })); let accum = 0; items.forEach(t => { const s = new Date(t.start); const e = new Date(t.end); const c = parseFloat(t.cost); if (curr >= e) { accum += c; } else if (curr > s) { const totalDur = (e - s); const elapsed = (curr - s); let pct = elapsed / totalDur; if (pct > 1) pct = 1; accum += c * pct; } }); dataPlanned.push(accum); curr.setMonth(curr.getMonth() + 1); } }
            this.charts.scurve = new Chart(ctxS, { type: 'line', data: { labels: labels.length ? labels : ['Início', 'Fim'], datasets: [{ label: 'Planejado Acumulado (R$)', data: dataPlanned.length ? dataPlanned : [0, cost], borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.4, pointRadius: 2 }] }, options: { maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: function(context) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.raw); } } } } } });
        }
        this.generateNarrative();
    },
    generateNarrative() { const el = document.getElementById('ai-narrative-content'); if (!el) return; const tot = this.db.reduce((a, t) => a + (t.type === 'item' ? 1 : 0), 0); if (tot === 0) { el.innerHTML = "Adicione tarefas."; return; } const done = this.db.reduce((a, t) => a + (t.type === 'item' && t.progress == 100 ? 1 : 0), 0); const progGlobal = Math.round((done / tot) * 100); const today = new Date(); let activeItems = 0; let plannedAccum = 0; this.db.forEach(t => { if (t.type === 'item' && t.start && t.end) { const s = new Date(t.start); const e = new Date(t.end); if (today >= s) { activeItems++; const totalDur = (e - s); const elapsed = (today - s); let expected = (elapsed / totalDur) * 100; if (expected > 100) expected = 100; plannedAccum += expected; } } }); const plannedAvg = activeItems ? (plannedAccum / activeItems) : 0; const deviation = progGlobal - plannedAvg; let narrative = ""; if (deviation < -10) narrative = `<p><strong class="text-red-600">Alerta:</strong> Atraso de <strong>${Math.round(Math.abs(deviation))}%</strong>.</p>`; else if (deviation < 0) narrative = `<p><strong class="text-orange-500">Atenção:</strong> Desvio de <strong>${Math.round(Math.abs(deviation))}%</strong>.</p>`; else narrative = `<p><strong class="text-green-600">Excelente:</strong> Obra em dia.</p>`; el.innerHTML = narrative; },
    
    openSnapshots() { document.getElementById('modal-snapshots').classList.add('active'); this.renderSnapshots(); },
    renderSnapshots() { const list = document.getElementById('snapshot-list'); if (this.snapshots.length === 0) { list.innerHTML = '<p class="text-slate-400 text-center text-xs">Nenhum snapshot.</p>'; return; } list.innerHTML = this.snapshots.map(s => `<div class="bg-slate-50 p-3 rounded border flex justify-between items-center mb-2"><div><p class="font-black text-slate-700 text-xs uppercase">${s.name}</p><p class="text-[9px] text-slate-400">${new Date(s.date).toLocaleString()}</p></div><div class="flex gap-2"><button onclick="editor.restoreSnapshot('${s.id}')" class="bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-[9px] font-bold hover:bg-indigo-200">RESTAURAR</button><button onclick="editor.deleteSnapshot('${s.id}')" class="text-red-400 hover:text-red-600"><i data-lucide="trash-2" class="w-3"></i></button></div></div>`).join(''); if(window.lucide) lucide.createIcons(); },
    createSnapshot() {
        const name = document.getElementById('snapshot-name').value;
        if (!name) return alert("Nome obrigatório");
        const snap = { id: 's' + Date.now(), name: name, date: new Date(), data: JSON.parse(JSON.stringify(this.db)), eap: JSON.parse(JSON.stringify(this.eap)), kb: JSON.parse(JSON.stringify(this.kb)) };
        this.snapshots.push(snap);
        document.getElementById('snapshot-name').value = '';
        this.autoSave();
        this.renderSnapshots();
        alert("Versão criada com sucesso.");
    },
    restoreSnapshot(sid) {
        const s = this.snapshots.find(x => x.id === sid);
        if (s && confirm(`Restaurar versão "${s.name}"? O estado atual será perdido.`)) {
            this.db = JSON.parse(JSON.stringify(s.data));
            this.eap = JSON.parse(JSON.stringify(s.eap));
            this.kb = JSON.parse(JSON.stringify(s.kb));
            this.recalc();
            this.renderSnapshots();
            this.renderEAP();
            this.renderKanban();
            alert("Projeto restaurado.");
        }
    },
    deleteSnapshot(sid) { if (confirm("Excluir versão?")) { this.snapshots = this.snapshots.filter(x => x.id !== sid); this.autoSave(); this.renderSnapshots(); } },

    renderCash() {
        const m={}; editor.financialBreakdown={};
        editor.db.forEach((t, index) => {
            if (index === 0) return;
            if (t.type === 'group' && t.start && t.cost > 0) {
                const g = t;
                const c=g.purchaseConfig||{mode:'standard',months:0,entry:0,installments:1};const s=new Date(g.start);if(c.mode==='custom'&&c.months>0)s.setMonth(s.getMonth()-c.months);let map=[];if(c.mode==='standard'){const e=new Date(g.end);const mo=Math.max(1,(e.getFullYear()-s.getFullYear())*12+(e.getMonth()-s.getMonth())+1);const v=g.cost/mo;for(let i=0;i<mo;i++)map.push([new Date(s.getFullYear(),s.getMonth()+i,1),v]);}else{const ev=g.cost*(c.entry/100);const iv=(g.cost-ev)/Math.max(1,c.installments);map.push([new Date(s),ev]);for(let i=1;i<=c.installments;i++)map.push([new Date(s.getFullYear(),s.getMonth()+i,1),iv]);}map.forEach(([d,v])=>{const k=d.toISOString().slice(0,7);m[k]=(m[k]||0)+v;if(!editor.financialBreakdown[k])editor.financialBreakdown[k]=[];editor.financialBreakdown[k].push({name:g.name,value:v});});
            }
        });
        const l=Object.keys(m).sort();const d=l.map(k=>m[k]);if(editor.charts.cash)editor.charts.cash.destroy();editor.charts.cash=new Chart(document.getElementById('cash-chart'),{type:'bar',data:{labels:l,datasets:[{label:'Desembolso (R$)',data:d,backgroundColor:'#3b82f6'}]},options:{maintainAspectRatio:false,onClick:(e,el)=>{if(el.length>0)editor.showFinancialDetail(l[el[0].index]);}}});
    }, 
    showFinancialDetail(m) {const l=document.getElementById('finance-list');document.getElementById('finance-detail-title').innerText="Detalhamento: "+m;const i=editor.financialBreakdown[m]||[];l.innerHTML=i.map(x=>`<div class="flex justify-between items-center border-b pb-1 mb-1 last:border-0"><span class="text-xs text-slate-700 font-medium truncate w-2/3">${x.name}</span><span class="text-xs font-bold text-slate-900">${fmt(x.value)}</span></div>`).join('');document.getElementById('finance-total').innerText=fmt(i.reduce((a,c)=>a+c.value,0));document.getElementById('modal-finance-detail').classList.add('active');}, renderKanban() {const c={todo:document.getElementById('kb-todo'),doing:document.getElementById('kb-doing'),done:document.getElementById('kb-done')};Object.values(c).forEach(x=>{if(x)x.innerHTML='';});if(!editor.kb)return;editor.kb.forEach(k=>{const h=`<div class="bg-white p-3 rounded-lg shadow mb-3 text-xs border-l-4 ${k.status==='todo'?'border-slate-400':k.status==='doing'?'border-blue-500':'border-green-500'} animate-fade-in"><textarea onchange="editor.updKb('${k.uuid}',this.value)" class="w-full font-bold outline-none resize-none bg-transparent hover:bg-slate-50 focus:bg-white rounded p-1 transition" rows="2">${k.title}</textarea><div class="flex justify-end gap-1 mt-2 opacity-50 hover:opacity-100 transition"><button onclick="editor.moveKb('${k.uuid}','todo')" class="w-5 h-5 bg-slate-100 rounded text-[9px]">1</button><button onclick="editor.moveKb('${k.uuid}','doing')" class="w-5 h-5 bg-blue-100 rounded text-[9px]">2</button><button onclick="editor.moveKb('${k.uuid}','done')" class="w-5 h-5 bg-green-100 rounded text-[9px]">3</button><button onclick="editor.remKb('${k.uuid}')" class="text-red-400 w-5 h-5">x</button></div></div>`;if(c[k.status])c[k.status].innerHTML+=h;});}, addKb(s) {if(!editor.kb)editor.kb=[];editor.kb.push({uuid:'k'+Date.now(),title:'Tarefa',status:s});editor.renderKanban();editor.autoSave();}, updKb(u,v) {const i=editor.kb.find(x=>x.uuid===u);if(i){i.title=v;editor.autoSave();}}, moveKb(u,s) {const i=editor.kb.find(x=>x.uuid===u);if(i){i.status=s;editor.renderKanban();editor.autoSave();}}, remKb(u) {if(confirm("Del?")){editor.kb=editor.kb.filter(x=>x.uuid!==u);editor.renderKanban();editor.autoSave();}}, renderBalance() {if(!editor.db.length)return;if(editor.charts.bal)editor.charts.bal.destroy();const u=[...new Set(editor.db.filter(t=>t.type==='item').map(t=>t.name))];const ds=editor.db.filter(t=>t.type==='group').map((g,i)=>({label:g.name,data:editor.db.filter(t=>t.parent===g.uuid&&t.progress<100).map(t=>({x:t.start,y:u.indexOf(t.name)+1})).sort((a,b)=>new Date(a.x)-new Date(b.x)),borderColor:`hsl(${i*40},70%,50%)`,showLine:true}));const ctx=document.getElementById('balance-chart').getContext('2d');editor.charts.bal=new Chart(ctx,{type:'scatter',data:{datasets:ds},options:{maintainAspectRatio:false,scales:{x:{type:'time',time:{unit:'day'}},y:{ticks:{callback:v=>u[v-1]}}}}});editor.analyzeFlow();}, analyzeFlow() {const a=[];const g=editor.db.filter(t=>t.type==='group'&&t.start&&t.end).sort((a,b)=>new Date(a.start)-new Date(b.start));for(let i=0;i<g.length-1;i++){const c=g[i],n=g[i+1];const dc=(new Date(c.end)-new Date(c.start))/(864e5),dn=(new Date(n.end)-new Date(n.start))/(864e5);if(dn<dc&&new Date(n.start)>new Date(c.start))a.push(`<div class="bg-red-50 p-2 rounded border border-red-100 text-[10px] text-red-700 font-bold">⚠️ Choque: ${n.name} > ${c.name}.</div>`);const gap=(new Date(n.start)-new Date(c.end))/(864e5);if(gap>5)a.push(`<div class="bg-yellow-50 p-2 rounded border border-yellow-100 text-[10px] text-yellow-700 font-bold">💤 Gap: ${Math.round(gap)}d entre ${c.name} e ${n.name}.</div>`);}if(!a.length)a.push('<div class="text-green-600 text-xs font-bold">Fluxo otimizado.</div>');document.getElementById('lob-alerts').innerHTML=a.join('');}, toggleMode() {editor.mode=editor.mode==='planning'?'measurement':'planning';document.getElementById('mode-label').innerText=editor.mode==='planning'?'MODO PADRÃO':'MODO MEDIÇÃO';document.getElementById('measurement-controls').className=editor.mode==='measurement'?'flex gap-2 ml-2 animate-fade-in bg-slate-100 p-1 rounded-lg border border-slate-200':'hidden';editor.renderT();}, switchView(v) {document.querySelectorAll('.view').forEach(x=>x.classList.add('hidden'));document.getElementById('v-'+v).classList.remove('hidden');if(v==='main')setTimeout(()=>editor.setupSync(),200);if(v==='bal')setTimeout(()=>editor.renderBalance(),200);if(v==='cash')setTimeout(()=>editor.renderCash(),200);if(v==='dash')setTimeout(()=>editor.renderDash(),200);if(v==='site')editor.renderSiteView();if(v==='kanban')editor.renderKanban();if(v==='eap')editor.renderEAP();}, 
    
    // OTIMIZAÇÃO: DEBOUNCE PARA AUTOSAVE
    autoSave() {
        if(editor.curr && auth.ss && auth.ss.id !== 'local_admin'){
            if (this.saveTimeout) clearTimeout(this.saveTimeout);
            this.saveTimeout = setTimeout(() => {
                const i=projectManager.all.findIndex(p=>p.id===editor.curr);
                if(i>-1){
                    projectManager.all[i].data=editor.db;
                    projectManager.all[i].eap=editor.eap;
                    projectManager.all[i].kb=editor.kb;
                    projectManager.all[i].cfg=editor.cfg;
                    projectManager.all[i].measurements=editor.measurements;
                    projectManager.all[i].baselines=editor.baselines;
                    projectManager.all[i].snapshots=editor.snapshots;
                    projectManager.save();
                }
            }, 500); // 500ms de espera
        }
    }, 
    
    saveBaseline() {const n=document.getElementById('new-baseline-name').value;if(!n)return alert("Nome necessário");const s={};editor.db.forEach(t=>{s[t.uuid]={start:t.start,end:t.end};});editor.baselines.push({id:'b'+Date.now(),name:n,date:new Date().toISOString(),items:s});document.getElementById('new-baseline-name').value='';editor.renderBaselineList();editor.autoSave();projectManager.save();alert('Baseline salva!');}, renderBaselineList() {const l=document.getElementById('baseline-list');l.innerHTML=editor.baselines.map(b=>`<div class="flex justify-between items-center bg-slate-50 p-2 mb-1 rounded border"><div><span class="font-bold text-[10px] text-slate-700 uppercase block">${b.name}</span><span class="text-[8px] text-slate-400">${new Date(b.date).toLocaleDateString()}</span></div><div class="flex gap-1"><button onclick="editor.applyBaseline('${b.id}')" class="bg-blue-100 text-blue-600 px-2 py-1 rounded text-[9px] font-bold hover:bg-blue-200">APLICAR</button><button onclick="editor.deleteBaseline('${b.id}')" class="text-red-400 hover:text-red-600 px-1 font-bold">x</button></div></div>`).join('');if(!editor.baselines.length)l.innerHTML='<p class="text-[9px] text-center text-slate-400">Vazio</p>';}, applyBaseline(bid) {const bl=editor.baselines.find(b=>b.id===bid);if(bl){editor.db.forEach(t=>{if(bl.items[t.uuid]){t.baseStart=bl.items[t.uuid].start;t.baseEnd=bl.items[t.uuid].end;}});editor.recalc();alert('Aplicado!');}}, deleteBaseline(bid) {if(confirm("Excluir?")){editor.baselines=editor.baselines.filter(b=>b.id!==bid);editor.renderBaselineList();editor.autoSave();}}, openPurchaseModal(gid) {editor.editingGroup=gid;const g=editor.db.find(x=>x.uuid===gid);document.getElementById('modal-purchase').classList.add('active');document.getElementById('modal-purchase-title').innerText=g.name;const c=g.purchaseConfig||{mode:'standard',months:0,entry:0,installments:1};document.getElementById('p-months').value=c.months;document.getElementById('p-entry').value=c.entry;document.getElementById('p-installments').value=c.installments;editor.setPurchaseMode(c.mode);}, setPurchaseMode(m) {editor.tempPurchaseMode=m;document.getElementById('panel-p-standard').className=m==='standard'?'block text-center py-4 text-[10px] text-slate-500':'hidden';document.getElementById('panel-p-custom').className=m==='custom'?'block space-y-3':'hidden';document.getElementById('btn-p-standard').className=`flex-1 py-2 rounded-md text-[10px] font-black uppercase ${m==='standard'?'bg-purple-600 text-white':'bg-slate-200'}`;document.getElementById('btn-p-custom').className=`flex-1 py-2 rounded-md text-[10px] font-black uppercase ${m==='custom'?'bg-purple-600 text-white':'bg-slate-200'}`;}, savePurchase() {const g=editor.db.find(x=>x.uuid===editor.editingGroup);g.purchaseConfig={mode:editor.tempPurchaseMode,months:parseInt(document.getElementById('p-months').value)||0,entry:parseFloat(document.getElementById('p-entry').value)||0,installments:parseInt(document.getElementById('p-installments').value)||1};document.getElementById('modal-purchase').classList.remove('active');editor.autoSave();}, openConfig() {document.getElementById('modal-config').classList.add('active');document.getElementById('cfg-sat').checked=editor.cfg.sat;document.getElementById('cfg-sun').checked=editor.cfg.sun;editor.renderHolidays();editor.renderBaselineList();}, saveConfig() {editor.cfg.sat=document.getElementById('cfg-sat').checked;editor.cfg.sun=document.getElementById('cfg-sun').checked;document.getElementById('modal-config').classList.remove('active');editor.recalc();}, addHoliday() {const h=document.getElementById('new-holiday').value;if(h){editor.cfg.holidays=editor.cfg.holidays||[];editor.cfg.holidays.push(h);editor.renderHolidays();}}, renderHolidays() {document.getElementById('holiday-list').innerHTML=(editor.cfg.holidays||[]).map(h=>`<div>${h}</div>`).join('');},
    
    recalculateSchedule() {
        if(!editor.measurements.length) return alert("Sem medições para basear o recálculo.");
        
        const sorted = [...editor.measurements].sort((a,b) => new Date(b.date) - new Date(a.date));
        const lastMeas = sorted[0];
        const lastDate = new Date(lastMeas.date).toISOString().split('T')[0];
        const restartDate = editor.getNextWorkDay(lastDate);

        if(!confirm(`Reprogramar saldo a partir de ${new Date(restartDate).toLocaleDateString()} (Dia seguinte à última medição)?`)) return;

        let changes = 0;
        editor.db.forEach(t => {
            if (t.type === 'item' && t.progress < 100) {
                const totalDuration = parseInt(t.duration) || 1;
                const remainingPct = (100 - t.progress) / 100;
                const remainingDays = Math.ceil(totalDuration * remainingPct);
                
                if (remainingDays > 0) {
                    const newEnd = editor.addWorkDays(restartDate, remainingDays);
                    if (newEnd > t.end) {
                        t.end = newEnd;
                        t.duration = editor.getDuration(t.start, t.end);
                        changes++;
                    }
                }
            }
        });

        if(changes > 0) {
            alert(`${changes} tarefas reprogramadas.`);
            editor.recalc();
        } else {
            alert("Nenhuma tarefa precisou ser adiada.");
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
                        t.pred.forEach(pid => { const p = this.db.find(x => x.uuid === pid); if (p && p.end && (!max || p.end > max)) max = p.end; });
                        if (max) { const ns = this.getNextWorkDay(max); if (t.start !== ns) { t.start = ns; changes = true; } }
                    } else if (!t.start) t.start = new Date().toISOString().split('T')[0];
                    if (t.start && t.duration) { const ne = this.addWorkDays(t.start, t.duration); if (t.end !== ne) { t.end = ne; changes = true; } }
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
            this.db[0].name = "RESUMO DO PROJETO";
            this.db[0].start = allStart || new Date().toISOString().split('T')[0];
            this.db[0].end = allEnd || this.db[0].start;
            this.db[0].cost = totalCost;
            this.db[0].duration = this.getDuration(this.db[0].start, this.db[0].end);
        }

        const ld = this.db.map(t => t.end).filter(Boolean).sort().reverse()[0];
        if(ld) this.db.filter(t => t.end === ld && t.type === 'item').forEach(t => this.traceCritical(t.uuid));
        
        this.renderT();
        this.renderSiteView();
        setTimeout(() => this.renderG(), 50);
        if (shouldSave) this.autoSave();
    },
    
    initEapDrag() {
        const vp = document.getElementById('eap-viewport'); const canvas = document.getElementById('eap-canvas');
        if(!vp || !canvas) return;
        
        vp.onmousedown = (e) => { if (e.button === 1) { e.preventDefault(); editor.eapPan.active = true; editor.eapPan.startX = e.clientX; editor.eapPan.startY = e.clientY; } else if (e.button === 0 && e.target.id === 'eap-svg') { editor.link = { active: false, source: null }; document.body.classList.remove('linking-cursor'); editor.renderEAP(); } };
        vp.onmousemove = (e) => { if (editor.eapPan.active) { editor.eapPan.transX += e.clientX - editor.eapPan.startX; editor.eapPan.transY += e.clientY - editor.eapPan.startY; editor.eapPan.startX = e.clientX; editor.eapPan.startY = e.clientY; canvas.style.transform = `translate(${editor.eapPan.transX}px, ${editor.eapPan.transY}px) scale(${editor.zoomLevel})`; } else if (editor.drag.active) { const n = editor.eap.find(x => x.uuid === editor.drag.item); if (n) { n.x = parseInt(n.x) + e.movementX / editor.zoomLevel; n.y = parseInt(n.y) + e.movementY / editor.zoomLevel; editor.renderEAP(); } } };
        vp.onmouseup = () => { editor.eapPan.active = false; if (editor.drag.active) { editor.drag.active = false; editor.autoSave(); } };
        vp.oncontextmenu = (e) => e.preventDefault();
    },

    renderEAP() {
        const layer = document.getElementById('eap-nodes-layer');
        if(!layer) return;
        layer.innerHTML = '';
        this.eap.forEach(n => {
            const isLinking = this.link.active && this.link.source === n.uuid;
            const el = document.createElement('div'); el.className = `eap-node ${isLinking ? 'linking-mode' : ''}`; el.style.left = n.x + 'px'; el.style.top = n.y + 'px';
            el.innerHTML = `<div class="eap-header" onmousedown="editor.startEapDrag(event, '${n.uuid}')"><span class="text-[9px] font-black uppercase text-slate-500">ID: ${n.uuid.substr(-4)}</span><div class="eap-btn btn-del hover:text-red-500 cursor-pointer" onclick="event.stopPropagation(); editor.remEap('${n.uuid}')">x</div></div><div class="eap-body" onclick="editor.handleEapBodyClick(event, '${n.uuid}')"><input value="${n.name}" onchange="editor.updEap('${n.uuid}','name',this.value)" class="w-full text-xs font-bold text-center outline-none bg-transparent mb-1"><div class="flex justify-center pb-2"><button class="bg-slate-200 text-[9px] px-2 rounded hover:bg-slate-300 font-bold text-slate-600" onclick="event.stopPropagation(); editor.toggleLink('${n.uuid}')"># LINK</button></div></div>`;
            layer.appendChild(el);
        });
        this.drawEapLines();
        document.getElementById('eap-canvas').style.transform = `translate(${editor.eapPan.transX}px, ${editor.eapPan.transY}px) scale(${editor.zoomLevel})`;
    },
    
    drawEapLines() {
        const svg = document.getElementById('eap-svg');
        if(!svg) return;
        while(svg.firstChild) svg.removeChild(svg.firstChild);
        
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
        marker.setAttribute("id", "arrow");
        marker.setAttribute("viewBox", "0 0 10 10");
        marker.setAttribute("refX", "10");
        marker.setAttribute("refY", "5");
        marker.setAttribute("markerWidth", "6");
        marker.setAttribute("markerHeight", "6");
        marker.setAttribute("orient", "auto");
        
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
        path.setAttribute("fill", "#64748b");
        
        marker.appendChild(path);
        defs.appendChild(marker);
        svg.appendChild(defs);

        this.eap.forEach(n => {
            (n.links || []).forEach(tid => {
                const t = this.eap.find(x => x.uuid === tid);
                if (t) {
                    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    l.setAttribute('x1', parseInt(n.x) + 90);
                    l.setAttribute('y1', parseInt(n.y) + 40);
                    l.setAttribute('x2', parseInt(t.x) + 90);
                    l.setAttribute('y2', parseInt(t.y) + 40);
                    l.setAttribute('stroke', '#64748b');
                    l.setAttribute('stroke-width', '2');
                    l.setAttribute('marker-end', 'url(#arrow)');
                    svg.appendChild(l);
                }
            });
        });
    },

    startEapDrag(e, uuid) { if (e.button === 0) { this.drag = { active: true, item: uuid }; e.stopPropagation(); } },
    handleEapBodyClick(e, uuid) { if (this.link.active && this.link.source !== uuid) { this.finishLink(uuid); e.stopPropagation(); } },
    toggleLink(u) { if (this.link.active && this.link.source === u) { this.link = { active: false, source: null }; document.body.classList.remove('linking-cursor'); } else { this.link = { active: true, source: u }; document.body.classList.add('linking-cursor'); } this.renderEAP(); },
    finishLink(t) { const s = this.eap.find(x => x.uuid === this.link.source); if (s && t !== this.link.source) { s.links = s.links || []; if (!s.links.includes(t)) s.links.push(t); } this.link = { active: false, source: null }; document.body.classList.remove('linking-cursor'); this.renderEAP(); this.autoSave(); },
    addEapNode() { this.eap.push({ uuid: 'e'+Date.now(), name: 'Item', x: 100, y: 100, links: [] }); this.renderEAP(); this.autoSave(); },
    updEap(u, f, v) { this.eap.find(x => x.uuid === u)[f] = v; this.autoSave(); },
    remEap(u) { this.eap = this.eap.filter(x => x.uuid !== u); this.renderEAP(); this.autoSave(); },
    zoom(d) { this.zoomLevel += d; if (this.zoomLevel < 0.5) this.zoomLevel = 0.5; this.renderEAP(); },
    resetZoom() { this.zoomLevel = 1; this.renderEAP(); },
};

const router = { go(id) { document.querySelectorAll('.page').forEach(p => p.classList.remove('active')); document.getElementById('page-' + id).classList.add('active'); if(window.lucide) lucide.createIcons(); } };

const projectManager = {
    all: [],
    async load() { 
        if (!auth.ss) return;
        if (auth.ss.id === 'local_admin') {
            // No modo local, ao recarregar, tudo é limpo. Isso é esperado.
            this.all = []; 
            return;
        }
        const r = await fetch(`${FB}db_${auth.ss.id}.json`); 
        this.all = await r.json() || []; 
        this.render(); 
    },
    render() { document.getElementById('grid-projects').innerHTML = this.all.map(p => `<div class="relative group bg-white p-8 rounded-[30px] border hover:border-blue-500 shadow-sm hover:shadow-md transition flex flex-col justify-between h-40"><div onclick="editor.open('${p.id}')" class="cursor-pointer"><h3 class="font-black uppercase text-xs text-slate-800">${p.name}</h3><p class="text-[10px] text-slate-400 mt-2">ID: ${p.id}</p></div><div class="flex justify-between items-end"><button onclick="projectManager.exportProject('${p.id}')" class="text-blue-500 text-[10px] font-bold hover:underline flex gap-1 items-center"><i data-lucide="download" class="w-3"></i> JSON</button><button onclick="projectManager.duplicate('${p.id}')" class="text-purple-500 text-[10px] font-bold hover:underline flex gap-1 items-center ml-2"><i data-lucide="copy" class="w-3"></i> Duplicar</button><button onclick="event.stopPropagation(); projectManager.del('${p.id}')" class="text-red-200 hover:text-red-500"><i data-lucide="trash-2" class="w-4"></i></button></div></div>`).join(''); if(window.lucide) lucide.createIcons(); },
    async save() { 
        if (!auth.ss || auth.ss.id === 'local_admin') return; 
        await fetch(`${FB}db_${auth.ss.id}.json`, { method: 'PUT', body: JSON.stringify(this.all) }); 
    },
    openCreateSelection() { document.getElementById('modal-create-type').classList.add('active'); },
    createManual() { document.getElementById('modal-create-type').classList.remove('active'); const n = prompt('Nome do Projeto:'); if (n) { const rootId = 'g' + Date.now(); this.all.push({ id: 'p' + Date.now(), name: n, data: [{ uuid: rootId, name: 'RESUMO DO PROJETO', type: 'group', parent: 'root', cost: 0, progress: 0, collapsed: false }], eap: [], kb: [], measurements: [], baselines: [], snapshots: [] }); this.save(); this.render(); } },
    createWizard() { document.getElementById('modal-create-type').classList.remove('active'); document.getElementById('cp-name').value = ''; document.getElementById('cp-start').value = new Date().toISOString().split('T')[0]; document.getElementById('modal-create-project').classList.add('active'); },
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

        floors.forEach((f, i) => {
            let preds = [];
            if (i > 0 && createdTasks['ALVENARIA E VEDAÇÃO'][i-1]) preds.push(createdTasks['ALVENARIA E VEDAÇÃO'][i-1]);
            const targetStructFloor = i + 3;
            if (targetStructFloor < floors.length) { if(createdTasks['ESTRUTURA - VIGAS E LAJES'][targetStructFloor]) preds.push(createdTasks['ESTRUTURA - VIGAS E LAJES'][targetStructFloor]); } 
            else { const lastLajeIndex = floors.length - 1; if(createdTasks['ESTRUTURA - VIGAS E LAJES'][lastLajeIndex]) preds.push(createdTasks['ESTRUTURA - VIGAS E LAJES'][lastLajeIndex]); }
            addTask('ALVENARIA E VEDAÇÃO', i, f.name, 10, preds);
        });

        floors.forEach((f, i) => {
            const pAlv = createdTasks['ALVENARIA E VEDAÇÃO'][i];
            addTask('INSTALAÇÕES HIDRÁULICAS', i, f.name, 5, [pAlv]);
            addTask('INSTALAÇÕES ELÉTRICAS', i, f.name, 5, [pAlv]);
            addTask('INFRA ELÉTRICA/AR', i, f.name, 5, [pAlv]);
        });

        floors.forEach((f, i) => {
            const pInfra = createdTasks['INFRA ELÉTRICA/AR'][i];
            addTask('REVESTIMENTO EM ARGAMASSA', i, f.name, 10, [pInfra]);
        });

        floors.forEach((f, i) => {
            const pReboco = createdTasks['REVESTIMENTO EM ARGAMASSA'][i];
            addTask('CONTRAPISO', i, f.name, 5, [pReboco]);
        });

        floors.forEach((f, i) => {
            const pReboco = createdTasks['REVESTIMENTO EM ARGAMASSA'][i];
            addTask('REVESTIMENTO CERÂMICO (PAREDE)', i, f.name, 7, [pReboco]);
        });

        floors.forEach((f, i) => {
            const pCeram = createdTasks['REVESTIMENTO CERÂMICO (PAREDE)'][i];
            addTask('FIAÇÃO ELÉTRICA', i, f.name, 5, [pCeram]);
        });

        floors.forEach((f, i) => {
            const pFiacao = createdTasks['FIAÇÃO ELÉTRICA'][i];
            addTask('FORROS', i, f.name, 5, [pFiacao]);
        });

        floors.forEach((f, i) => {
            const pForro = createdTasks['FORROS'][i];
            addTask('PISO CERÂMICO', i, f.name, 7, [pForro]);
        });

        floors.forEach((f, i) => {
            const pPiso = createdTasks['PISO CERÂMICO'][i];
            addTask('PINTURA', i, f.name, 10, [pPiso]);
            addTask('PORTAS DE MADEIRA', i, f.name, 5, [pPiso]); 
            addTask('ESQUADRIAS', i, f.name, 5, [pPiso]);
            addTask('LOUÇAS E METAIS', i, f.name, 3, [pPiso]);
        });

        const lastPaint = createdTasks['PINTURA'][floors.length - 1];
        addTask('ELEVADORES', 0, 'Instalação Global', 30, [lastPaint]); 
        addTask('URBANIZAÇÃO E ÁREAS EXTERNAS', 0, 'Geral', 20, [lastPaint]);
        addTask('LIMPEZA FINAL E ENTREGA', 0, 'Entrega', 10, [createdTasks['URBANIZAÇÃO E ÁREAS EXTERNAS'][0]]);

        this.all.push({ id: 'p' + Date.now(), name: name, data: db, eap: [], kb: [], measurements: [], baselines: [], snapshots: [] });
        this.save();
        this.render();
        document.getElementById('modal-create-project').classList.remove('active');
    },
    async del(id) { if (confirm("ATENÇÃO: Isso excluirá todo o projeto permanentemente. Continuar?")) { this.all = this.all.filter(p => p.id !== id); await this.save(); this.render(); } },
    exportProject(id) {const p=this.all.find(x=>x.id===id);if(!p)return;const dataStr="data:text/json;charset=utf-8,"+encodeURIComponent(JSON.stringify(p));const a=document.createElement('a');a.setAttribute("href",dataStr);a.setAttribute("download",`bravo_project_${p.name.replace(/\s+/g,'_')}.json`);document.body.appendChild(a);a.click();a.remove();},
    duplicate(id) {const p=this.all.find(x=>x.id===id);if(!p)return;const copy=JSON.parse(JSON.stringify(p));copy.id='p'+Date.now();copy.name=copy.name+" (Cópia)";this.all.push(copy);this.save();this.render();},
    importFile(input) {const file=input.files[0];if(!file)return;const reader=new FileReader();reader.onload=async(e)=>{try{const json=JSON.parse(e.target.result);if(!json.id||!json.data)throw new Error("Arquivo inválido");json.id='p'+Date.now();json.name=json.name+" (Importado)";this.all.push(json);await this.save();this.render();alert("Projeto importado com sucesso!");}catch(err){alert("Erro ao importar: "+err.message);}};reader.readAsText(file);input.value='';}
};