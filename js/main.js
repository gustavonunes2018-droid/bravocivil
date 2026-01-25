import { auth } from './auth.js';
import { projectManager } from './projectManager.js';
import { editor } from './editor.js';
import { router } from './utils.js';

window.auth = auth;
window.projectManager = projectManager;
window.editor = editor;
window.router = router;

document.addEventListener('DOMContentLoaded', () => {
    if(window.lucide) window.lucide.createIcons();

    const btnLogin = document.getElementById('btn-login');
    if(btnLogin) btnLogin.addEventListener('click', () => auth.login());
    
    const inputPass = document.getElementById('log-p');
    if(inputPass) inputPass.addEventListener('keypress', (e) => {
        if(e.key === 'Enter') auth.login();
    });

    const fileInput = document.getElementById('import-file');
    if(fileInput) {
        fileInput.addEventListener('change', () => projectManager.importFile(fileInput));
    }

    const btnNewProject = document.getElementById('btn-new-project');
    if(btnNewProject) btnNewProject.onclick = () => projectManager.openCreateSelection();

    const btnManual = document.getElementById('btn-create-manual');
    if(btnManual) btnManual.onclick = () => projectManager.createManual();

    const btnWizard = document.getElementById('btn-create-wizard');
    if(btnWizard) btnWizard.onclick = () => projectManager.createWizard();

    const btnGen = document.getElementById('btn-generate-project');
    if(btnGen) btnGen.onclick = () => projectManager.generateAndSave();

    const btnClose = document.getElementById('btn-close-editor');
    if(btnClose) btnClose.onclick = () => editor.close();
    
    // Botões de Visualização do Editor
    const views = ['eap', 'main', 'site', 'kanban', 'bal', 'cash', 'dash'];
    views.forEach(v => {
        const btn = document.getElementById('btn-v-' + v);
        if(btn) btn.onclick = () => editor.switchView(v);
    });

    // Botões Toolbar Editor
    const btnAddGroup = document.getElementById('btn-add-group');
    if(btnAddGroup) btnAddGroup.onclick = () => editor.addGroup();
    
    const btnExp = document.getElementById('btn-expand-all');
    if(btnExp) btnExp.onclick = () => editor.toggleAllGroups(false);

    const btnCol = document.getElementById('btn-collapse-all');
    if(btnCol) btnCol.onclick = () => editor.toggleAllGroups(true);

    const btnRecalc = document.getElementById('btn-recalc');
    if(btnRecalc) btnRecalc.onclick = () => editor.recalculateSchedule(); // Note: Implementar se não existir
    
    const btnExportCSV = document.getElementById('btn-export-csv');
    if(btnExportCSV) btnExportCSV.onclick = () => editor.exportCSV();
});