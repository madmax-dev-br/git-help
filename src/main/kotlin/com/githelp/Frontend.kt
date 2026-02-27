package com.githelp

import io.ktor.server.application.*
import io.ktor.server.html.*
import kotlinx.html.*

fun HTML.gitHelpPage() {
    head {
        title("Git-Help - Premium Git Manager")
        style {
            unsafe {
                raw(
                        """
                    :root {
                        --bg-color: #0f172a;
                        --card-bg: rgba(30, 41, 59, 0.7);
                        --text-primary: #f1f5f9;
                        --text-secondary: #94a3b8;
                        --accent: rgb(242,115,33);
                        --accent-glow: rgba(242,115,33, 0.5);
                        --border: rgba(255, 255, 255, 0.1);
                    }
                    body {
                        margin: 0;
                        font-family: 'Inter', sans-serif;
                        background-color: var(--bg-color);
                        color: var(--text-primary);
                        height: 100vh;
                        overflow: hidden;
                        display: flex;
                        flex-direction: column;
                    }
                    .container {
                        display: flex;
                        flex-grow: 1;
                        height: 100%;
                    }
                    .sidebar {
                        width: 300px;
                        background: var(--card-bg);
                        backdrop-filter: blur(10px);
                        padding: 20px;
                        border-right: 1px solid var(--border);
                        display: flex;
                        flex-direction: column;
                        overflow-y: auto;
                    }
                    .main-content {
                        flex-grow: 1;
                        position: relative;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        overflow-y: auto;
                    }
                    .setup-screen {
                        text-align: center;
                        animation: fadeIn 0.5s ease-out;
                    }
                    input[type="text"] {
                        background: rgba(0, 0, 0, 0.3);
                        border: 1px solid var(--border);
                        padding: 12px 20px;
                        border-radius: 8px;
                        color: var(--text-primary);
                        font-size: 16px;
                        width: 300px;
                        outline: none;
                        transition: all 0.3s;
                    }
                    input[type="text"]:focus {
                        border-color: var(--accent);
                        box-shadow: 0 0 15px var(--accent-glow);
                    }
                    .card {
                        background: var(--card-bg);
                        border: 1px solid var(--border);
                        border-radius: 12px;
                        padding: 20px;
                        margin: 10px;
                        width: 320px;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                        backdrop-filter: blur(10px);
                        transition: transform 0.2s;
                    }
                    .top-bar {
                        width: 100%;
                        padding: 20px;
                        display: flex;
                        justify-content: center;
                        background: rgba(15, 23, 42, 0.8);
                        position: absolute;
                        top: 0;
                        z-index: 10;
                    }
                    .project-column {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 20px;
                        margin-top: 80px;
                        padding-bottom: 40px;
                    }
                    .line-connector {
                        width: 2px;
                        background: var(--border);
                        height: 30px;
                        position: relative;
                    }
                    .connector-active {
                        background: var(--accent);
                    }
                    .action-btn {
                        background: var(--card-bg);
                        border: 1px solid var(--accent);
                        color: var(--accent);
                        padding: 10px;
                        margin-top: 10px;
                        border-radius: 8px;
                        cursor: pointer;
                        width: 100%;
                        transition: all 0.2s;
                    }
                    .action-btn:hover {
                        background: var(--accent);
                        color: var(--bg-color);
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    .modal-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(0, 0, 0, 0.5);
                        backdrop-filter: blur(5px);
                        display: none;
                        justify-content: center;
                        align-items: center;
                        z-index: 100;
                    }
                    .modal {
                        background: var(--card-bg);
                        padding: 30px;
                        border-radius: 12px;
                        border: 1px solid var(--border);
                        width: 700px;
                        animation: fadeIn 0.3s ease-out;
                        max-height: 90vh;
                        display: flex;
                        flex-direction: column;
                    }
                    .modal-projects {
                        margin: 15px 0;
                        max-height: 350px;
                        overflow-y: auto;
                        border: 1px solid var(--border);
                        border-radius: 8px;
                        padding: 10px;
                        background: rgba(0,0,0,0.2);
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    }
                    .modal-projects label {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        cursor: pointer;
                        font-size: 14px;
                    }
                    .modal-projects input[type="checkbox"] {
                        accent-color: var(--accent);
                        width: 16px;
                        height: 16px;
                    }
                    .snackbar {
                        visibility: hidden;
                        min-width: 250px;
                        margin-left: -125px;
                        background-color: #333;
                        color: #fff;
                        text-align: center;
                        border-radius: 8px;
                        padding: 16px;
                        position: fixed;
                        z-index: 1000;
                        left: 50%;
                        bottom: 30px;
                        font-size: 16px;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                        border: 1px solid var(--border);
                    }
                    .snackbar.show {
                        visibility: visible;
                        animation: fadein 0.5s, fadeout 0.5s 2.5s;
                    }
                    .snackbar.error {
                        background-color: rgba(220, 38, 38, 0.9);
                        border-color: #ef4444;
                    }
                    .snackbar.success {
                        background-color: rgba(22, 163, 74, 0.9);
                        border-color: #22c55e;
                    }
                    @keyframes fadein {
                        from {bottom: 0px; opacity: 0;}
                        to {bottom: 30px; opacity: 1;}
                    }
                    @keyframes fadeout {
                        from {bottom: 30px; opacity: 1;}
                        to {bottom: 0px; opacity: 0;}
                    }
                    .sidebar-section {
                        margin-bottom: 24px;
                    }
                    .sidebar-section h3 {
                        font-size: 12px;
                        text-transform: uppercase;
                        color: var(--text-secondary);
                        margin-bottom: 12px;
                        letter-spacing: 0.05em;
                    }
                    .project-item {
                        padding: 10px 12px;
                        margin-bottom: 4px;
                        cursor: pointer;
                        border-radius: 6px;
                        color: var(--text-primary);
                        font-size: 14px;
                        transition: all 0.2s;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    }
                    .project-item:hover {
                        background: rgba(255, 255, 255, 0.05);
                    }
                    .project-item.active {
                        background: rgba(242, 115, 33, 0.1);
                        color: var(--accent);
                        border: 1px solid rgba(242, 115, 33, 0.2);
                    }
                    .project-icon {
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                        background: var(--text-secondary);
                    }
                    .project-item.active .project-icon {
                        background: var(--accent);
                        box-shadow: 0 0 8px var(--accent);
                    }
                    .global-loading-overlay {
                        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                        background: rgba(15, 23, 42, 0.4); 
                        backdrop-filter: blur(10px);
                        -webkit-backdrop-filter: blur(10px);
                        z-index: 9999;
                        display: none; justify-content: center; align-items: center;
                        flex-direction: column; color: var(--accent);
                    }
                    .spinner {
                        border: 4px solid rgba(255,255,255,0.1); border-top: 4px solid var(--accent);
                        border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite;
                    }
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                    .warning-box, .info-box {
                        border-radius: 10px;
                        padding: 14px 18px;
                        margin: 12px 24px;
                        font-size: 13px;
                        line-height: 1.7;
                        width: calc(100% - 48px);
                        max-width: 700px;
                        box-sizing: border-box;
                    }
                    .warning-box {
                        background: rgba(245, 158, 11, 0.08);
                        border: 1px solid rgba(245, 158, 11, 0.35);
                        color: #f59e0b;
                        box-shadow: 0 2px 8px rgba(245, 158, 11, 0.06);
                    }
                    .info-box {
                        background: rgba(16, 185, 129, 0.08);
                        border: 1px solid rgba(16, 185, 129, 0.35);
                        color: #10b981;
                        box-shadow: 0 2px 8px rgba(16, 185, 129, 0.06);
                    }
                    .warning-box .warning-title, .info-box .info-title {
                        font-weight: 700;
                        font-size: 14px;
                        margin-bottom: 8px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    .warning-box .warning-title { color: #fbbf24; }
                    .info-box .info-title { color: #34d399; }
                    
                    .warning-box .warning-line, .info-box .info-line {
                        padding: 3px 0 3px 22px;
                        position: relative;
                    }
                    .warning-box .warning-line::before { content: '•'; position: absolute; left: 8px; color: #f59e0b; }
                    .info-box .info-line::before { content: '•'; position: absolute; left: 8px; color: #10b981; }
                    
                    .base-branch-tag {
                        display: inline-block;
                        background: rgba(148, 163, 184, 0.12);
                        border: 1px solid rgba(148, 163, 184, 0.25);
                        padding: 2px 8px;
                        border-radius: 4px;
                        font-size: 11px;
                        color: #94a3b8;
                        margin-left: 4px;
                    }
                    """
                )
            }
        }
        script {
            unsafe {
                raw(
                        """
                    let currentData = null;
                    let activeModalAction = null;
                    let visualizingBranch = null;

                    function saveRecentBranch(name) {
                        if (!name || name === 'main' || name === 'master') return;
                        let recents = JSON.parse(localStorage.getItem('recentBranches') || '[]');
                        recents = recents.filter(b => b !== name);
                        recents.unshift(name);
                        recents = recents.slice(0, 5);
                        localStorage.setItem('recentBranches', JSON.stringify(recents));
                    }

                    function renderRecentTags(containerId, inputId, onSelect = null) {
                        const container = document.getElementById(containerId);
                        if (!container) return;
                        const recents = JSON.parse(localStorage.getItem('recentBranches') || '[]');
                        if (recents.length === 0) {
                            container.style.display = 'none';
                            return;
                        }
                        container.style.display = 'flex';
                        container.style.flexWrap = 'wrap';
                        container.style.gap = '8px';
                        container.style.marginTop = '8px';
                        container.innerHTML = '';
                        recents.forEach(branch => {
                            const tag = document.createElement('span');
                            tag.style = "background: rgba(242, 115, 33, 0.1); border: 1px solid rgba(242, 115, 33, 0.3); color: var(--accent); padding: 2px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; transition: all 0.2s;";
                            tag.innerText = branch;
                            tag.onclick = () => {
                                const input = document.getElementById(inputId);
                                if (input) {
                                    input.value = branch;
                                    input.dispatchEvent(new Event('input'));
                                    if (onSelect) onSelect(branch);
                                }
                            };
                            tag.onmouseover = () => tag.style.background = 'rgba(242, 115, 33, 0.2)';
                            tag.onmouseout = () => tag.style.background = 'rgba(242, 115, 33, 0.1)';
                            container.appendChild(tag);
                        });
                    }

                    async function init() {
                        renderSidebar();
                        const savedProject = localStorage.getItem('lastProject');
                        if (savedProject) {
                            document.getElementById('projectPath').value = savedProject;
                            await loadProject(savedProject);
                        }
                    }

                    async function setProject() {
                        const path = document.getElementById('projectPath').value;
                        if (!path) {
                            showToast('Please enter a project path', 'error');
                            return;
                        }
                        await loadProject(path);
                    }
                    
                    async function loadProject(path) {
                        const loading = document.getElementById('globalLoading');
                        if (loading) loading.style.display = 'flex';
                        try {
                            // 1. Fetch updates
                            const fetchRes = await fetch('/api/git/status', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ path: path })
                            });
                            
                            if (fetchRes.ok) {
                                const tempStatus = await fetchRes.json();
                                const allPaths = [path, ...(tempStatus.submodules || []).map(s => s.path)];
                                
                                // Fetch all concurrently
                                await Promise.all(allPaths.map(async (p) => {
                                    try {
                                        await fetch('/api/git/fetch', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ path: p })
                                        });
                                    } catch (e) { console.error('Fetch failed for ' + p, e); }
                                }));
                            }

                            // 2. Get final status
                            const response = await fetch('/api/git/status', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ path: path })
                            });

                            if (response.ok) {
                                currentData = await response.json();
                                saveProjectToHistory(path, currentData.mainProject.name);
                                localStorage.setItem('lastProject', path);
                                
                                renderDashboard(currentData);
                                renderSidebar();
                            } else {
                                const err = await response.text();
                                showToast('Failed to load project: ' + err, 'error');
                            }
                        } catch (e) {
                            showToast('Networking error: ' + e.message, 'error');
                        } finally {
                            if (loading) loading.style.display = 'none';
                        }
                    }

                    function saveProjectToHistory(path, name) {
                        let history = JSON.parse(localStorage.getItem('projectHistory') || '[]');
                        history = history.filter(p => p.path !== path);
                        history.unshift({ path, name, timestamp: Date.now() });
                        history = history.slice(0, 10);
                        localStorage.setItem('projectHistory', JSON.stringify(history));
                    }

                    function showToast(message, type = 'info') {
                        const x = document.getElementById("snackbar");
                        x.className = "snackbar " + type + " show";
                        x.innerText = message;
                        setTimeout(function(){ x.className = x.className.replace("show", ""); }, 3000);
                    }

                    window.onload = init;
                    
                    function renderDashboard(data) {
                        const main = document.getElementById('main');
                        const existingTop = document.querySelector('.top-bar');
                        
                        const groupsContainer = document.createElement('div');
                        groupsContainer.style.display = 'flex';
                        groupsContainer.style.flexDirection = 'column';
                        groupsContainer.style.gap = '60px';
                        groupsContainer.style.alignItems = 'center';
                        groupsContainer.style.width = '100%';
                        groupsContainer.style.paddingBottom = '40px';
                        
                        const allProjs = [data.mainProject, ...(data.submodules || [])];

                        // Collect warnings
                        const warnings = [];
                        const parentBranches = allProjs.map(p => ({ name: p.name, baseBranch: p.parentBranch || 'N/A' }));
                        const uniqueParents = new Set(parentBranches.map(p => p.baseBranch));
                        if (uniqueParents.size > 1) {
                            warnings.push('Base branches have diverged across projects and submodules:');
                            parentBranches.forEach(p => {
                                warnings.push('  ' + p.name + ' → base: ' + p.baseBranch);
                            });
                        }

                        // Check for detached HEAD
                        allProjs.forEach(p => {
                            const cur = visualizingBranch ? p.branches.find(b => b.name === visualizingBranch) : p.branches.find(b => b.isCurrent);
                            if (!cur && !visualizingBranch) warnings.push(p.name + ' is in a detached HEAD state');
                        });

                        // Check for local-only branches
                        allProjs.forEach(p => {
                            const cur = visualizingBranch ? p.branches.find(b => b.name === visualizingBranch) : p.branches.find(b => b.isCurrent);
                            if (cur && cur.isLocalOnly) {
                                const modePrefix = visualizingBranch ? '[Visual Mode] ' : '';
                                warnings.push(modePrefix + p.name + ': branch "' + cur.name + '" has not been pushed to remote');
                            }
                        });

                        const groups = {}; // baseBranch -> array of projects
                        allProjs.forEach(p => {
                            let bName = p.parentBranch || 'N/A';
                            
                            // If visualizing, use the parent branch of the visualized branch for grouping logic
                            if (visualizingBranch) {
                                const vBranch = p.branches.find(b => b.name === visualizingBranch);
                                if (vBranch) {
                                    bName = vBranch.parentBranch || 'N/A';
                                }
                            }

                            if(!groups[bName]) groups[bName] = [];
                            groups[bName].push(p);
                        });
                        
                        Object.keys(groups).forEach(branchName => {
                            const groupDiv = document.createElement('div');
                            groupDiv.style.display = 'flex';
                            groupDiv.style.alignItems = 'center';
                            groupDiv.style.position = 'relative';
                            
                            // 1) The left indicator card for the branch
                            const leftCard = document.createElement('div');
                            leftCard.style = "background:var(--card-bg); padding:10px 15px; border-radius:8px; border:1px solid rgba(148, 163, 184, 0.4); white-space:nowrap; z-index:2; position:relative; box-shadow: 0 4px 6px rgba(0,0,0,0.3); font-size:14px;";
                            leftCard.innerHTML = `<strong>Base:</strong> <span style="color:#94a3b8;">${'$'}{branchName}</span>`;
                            groupDiv.appendChild(leftCard);
                            
                            // 2) Horiz connector line going out right from the left card
                            const hLine = document.createElement('div');
                            hLine.style = "width: 40px; height: 2px; background: var(--accent); z-index: 1;";
                            groupDiv.appendChild(hLine);
                            
                            // 3) The right side container for projects sharing this branch
                            const rightColumn = document.createElement('div');
                            rightColumn.style.display = 'flex';
                            rightColumn.style.flexDirection = 'column';
                            
                            const projs = groups[branchName];
                            projs.forEach((proj, idx) => {
                                const rowDiv = document.createElement('div');
                                rowDiv.style.display = 'flex';
                                rowDiv.style.alignItems = 'stretch';
                                
                                const connectorDiv = document.createElement('div');
                                connectorDiv.style.width = '40px';
                                connectorDiv.style.position = 'relative';
                                
                                const vLineTop = document.createElement('div');
                                vLineTop.style.position = 'absolute';
                                vLineTop.style.left = '0';
                                vLineTop.style.top = '0';
                                vLineTop.style.width = '2px';
                                vLineTop.style.height = '50%';
                                vLineTop.style.background = (idx > 0) ? 'var(--accent)' : 'transparent';
                                
                                const vLineBottom = document.createElement('div');
                                vLineBottom.style.position = 'absolute';
                                vLineBottom.style.left = '0';
                                vLineBottom.style.bottom = '0';
                                vLineBottom.style.width = '2px';
                                vLineBottom.style.height = '50%';
                                vLineBottom.style.background = (idx < projs.length - 1) ? 'var(--accent)' : 'transparent';
                                
                                const rowHLine = document.createElement('div');
                                rowHLine.style.position = 'absolute';
                                rowHLine.style.left = '0';
                                rowHLine.style.top = 'calc(50% - 1px)';
                                rowHLine.style.width = '100%';
                                rowHLine.style.height = '2px';
                                rowHLine.style.background = 'var(--accent)';
                                
                                connectorDiv.appendChild(vLineTop);
                                connectorDiv.appendChild(vLineBottom);
                                connectorDiv.appendChild(rowHLine);
                                
                                const cardWrap = document.createElement('div');
                                cardWrap.style.padding = '20px 0';
                                cardWrap.appendChild(createCard(proj));
                                
                                rowDiv.appendChild(connectorDiv);
                                rowDiv.appendChild(cardWrap);
                                rightColumn.appendChild(rowDiv);
                            });
                            
                            groupDiv.appendChild(rightColumn);
                            groupsContainer.appendChild(groupDiv);
                        });
                        
                        main.innerHTML = '';
                        
                        // Top bar
                        if(existingTop) {
                            main.appendChild(existingTop);
                        } else {
                            const topBar = document.createElement('div');
                            topBar.className = 'top-bar';
                            topBar.innerHTML = `
                                <div style="display:flex; flex-direction:column; gap: 8px; align-items: center; width: 100%;">
                                    <div style="display:flex; gap: 10px; align-items: center; position:relative; width:300px;">
                                        <input type="text" id="branchSearch" placeholder="Search branches..." onfocus="filterBranches(this.value)" oninput="filterBranches(this.value)">
                                        <div id="searchResults" style="position: absolute; top: 50px; background: var(--card-bg); width: 300px; max-height: 200px; overflow-y: auto; display: none; flex-direction: column; border-radius: 8px; border: 1px solid var(--border); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5);"></div>
                                    </div>
                                    <div id="recentTagsMain"></div>
                                </div>
                            `;
                            main.appendChild(topBar);
                            renderRecentTags('recentTagsMain', 'branchSearch', (b) => {
                                visualizingBranch = b;
                                saveRecentBranch(b);
                                renderDashboard(currentData);
                            });
                        }

                        // Warning box (always rendered, hidden if no warnings)
                        if (warnings.length > 0) {
                            const warningBox = document.createElement('div');
                            warningBox.className = 'warning-box';
                            warningBox.style.marginTop = '80px';
                            let warningHtml = '<div class="warning-title">⚠ Warnings</div>';
                            warnings.forEach(w => {
                                warningHtml += '<div class="warning-line">' + w + '</div>';
                            });
                            warningBox.innerHTML = warningHtml;
                            main.appendChild(warningBox);
                        }

                        // Info box for Visualizing Mode
                        if (visualizingBranch) {
                            const infoBox = document.createElement('div');
                            infoBox.className = 'info-box';
                            infoBox.style.marginTop = warnings.length > 0 ? '0' : '80px';
                            infoBox.innerHTML = `
                                <div class="info-title">
                                    <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                                        <span>🟢 Visualizing Mode</span>
                                        <button onclick="visualizingBranch=null; renderDashboard(currentData)" style="background:transparent; border:none; color:#10b981; cursor:pointer; font-size:12px;">Reset</button>
                                    </div>
                                </div>
                                <div class="info-line">Viewing project structure with focus on branch: <strong>${'$'}{visualizingBranch}</strong></div>
                            `;
                            main.appendChild(infoBox);
                        }
                        
                        main.appendChild(groupsContainer);

                        // If there are preserved errors from a previous action, display them
                        if (window.pendingCardErrors) {
                            window.pendingCardErrors = null;
                        }
                    }
                    
                    function createCard(project) {
                        const div = document.createElement('div');
                        div.className = 'card';
                        div.id = 'card-' + project.path.replace(/[^a-zA-Z0-9]/g, '-');
                        
                        if (project.isSubmodule) {
                            div.style.borderLeft = '4px solid var(--accent)';
                            div.style.background = 'rgba(255,255,255,0.02)';
                        }
                        
                        const currentBranch = project.branches.find(b => b.isCurrent);
                        let branchInfo = 'Detached';
                        let isVisual = false;
                        let displayHash = project.commitHash;
                        let displayDate = project.commitDate;

                        if (visualizingBranch && project.branches.some(b => b.name === visualizingBranch)) {
                            const vBranch = project.branches.find(b => b.name === visualizingBranch);
                            branchInfo = visualizingBranch + ' <span style="font-size:10px; opacity:0.7;">(Visual)</span>';
                            isVisual = true;
                            displayHash = vBranch.commitHash || project.commitHash;
                            displayDate = vBranch.commitDate || project.commitDate;
                        } else if (currentBranch) {
                            let isLocal = currentBranch.isLocalOnly ? `<span title="Local only branch (not pushed)" style="color:#aaa; font-size:12px; margin-left:6px;">☁(Local)</span>` : ``;
                            branchInfo = currentBranch.name + isLocal;
                        }
                        
                        let commitInfoStr = '';
                        if(displayHash) {
                             commitInfoStr = `<div style="font-size:11px; color:#aaa; margin-top:5px; margin-bottom: 2px;">Commit: <span style="font-family:monospace; color:#ccc;">${'$'}{displayHash}</span> | Date: ${'$'}{displayDate}</div>`;
                        }
                        
                        const accentColor = isVisual ? '#10b981' : 'var(--accent)';

                        div.innerHTML = `
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <h3 style="margin:0; overflow:hidden; text-overflow:ellipsis;" title="${'$'}{project.name}">${'$'}{project.name}</h3>
                                <div class="card-spinner spinner" style="width:20px; height:20px; border-width:2px; display:none;"></div>
                            </div>
                            <p style="color: var(--text-secondary); margin-top:10px; margin-bottom:4px;">Branch: <span style="color: ${'$'}{accentColor}; font-weight:600;">${'$'}{branchInfo}</span></p>
                            ${'$'}{commitInfoStr}
                        `;
                        return div;
                    }

                    // Global Action Logs tracking state
                    window.actionLogs = [];
                    function addLogEntry(action, status, detail) {
                        const time = new Date().toLocaleTimeString();
                        window.actionLogs.unshift({time, action, status, detail});
                        renderActionLogs();
                    }

                    function showActionLogsModal() {
                        document.getElementById('actionLogsModalOverlay').style.display = 'flex';
                        renderActionLogs();
                    }

                    function hideActionLogsModal() {
                        document.getElementById('actionLogsModalOverlay').style.display = 'none';
                    }

                    function renderActionLogs() {
                        const logsContainer = document.getElementById('actionLogsContent');
                        if(!logsContainer) return;
                        if(window.actionLogs.length === 0) {
                            logsContainer.innerHTML = '<p style="color:#aaa;">No actions logged yet.</p>';
                            return;
                        }
                        let html = '';
                        window.actionLogs.forEach(entry => {
                            const statusColor = entry.status === 'success' ? '#10b981' : (entry.status === 'warning' ? '#f59e0b' : '#ef4444');
                            html += `
                                <div style="margin-bottom:15px; padding-bottom:10px; border-bottom:1px solid var(--border);">
                                    <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                                        <span style="font-weight:bold;">${'$'}{entry.action}</span>
                                        <span style="color:#aaa; font-size:12px;">${'$'}{entry.time}</span>
                                    </div>
                                    <div style="font-size:13px;">
                                        Status: <span style="color:${'$'}{statusColor}">${'$'}{entry.status.toUpperCase()}</span>
                                    </div>
                                    <div style="font-size:12px; color:#ddd; margin-top:5px; white-space:pre-wrap; word-wrap:break-word;">
                                        ${'$'}{entry.detail}
                                    </div>
                                </div>
                            `;
                        });
                        logsContainer.innerHTML = html;
                    }

                    function renderSidebar() {
                        const sidebar = document.getElementById('sidebar-content');
                        const history = JSON.parse(localStorage.getItem('projectHistory') || '[]');
                        const currentPath = currentData ? currentData.mainProject.path : localStorage.getItem('lastProject');

                        let html = `
                            <div class="sidebar-section">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
                                    <h3 style="margin:0;">Projects</h3>
                                    <button onclick="location.reload()" style="background:transparent; border:none; color:var(--text-secondary); cursor:pointer; font-size:18px; line-height:1;" title="New Project" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text-secondary)'">+</button>
                                </div>
                                <div class="project-list">
                        `;
                        
                        if (history.length === 0) {
                            html += `<div style="color:var(--text-secondary); font-size:13px; font-style:italic;">No recent projects</div>`;
                        } else {
                            history.forEach(p => {
                                const activeClass = p.path === currentPath ? 'active' : '';
                                html += `
                                    <div class="project-item ${'$'}{activeClass}" onclick="visualizingBranch=null; loadProject('${'$'}{p.path.replace(/\\/g, '\\\\')}')">
                                        <div class="project-icon"></div>
                                        <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${'$'}{p.name}</div>
                                    </div>
                                `;
                            });
                        }
                        
                        html += `
                                </div>
                            </div>
                            
                            <div class="sidebar-section">
                                <h3>Logs</h3>
                                <button class="action-btn" onclick="showActionLogsModal()" style="margin-bottom:10px;">Activity Log</button>
                            </div>

                            <div class="sidebar-section">
                                <h3>Actions</h3>
                                <button class="action-btn" onclick="openModal('switchBranch')">Switch Branch</button>
                                <button class="action-btn" onclick="openModal('createBranch')">Create Branch</button>
                                <button class="action-btn" onclick="openModal('mergeBack')">Merge Back</button>
                                <button class="action-btn" onclick="openModal('pull')">Pull</button>
                                <button class="action-btn" onclick="openModal('push')">Push</button>
                            </div>
                        `;
                        
                        sidebar.innerHTML = html;
                    }

                    // Hide search results if clicked outside
                    document.addEventListener('click', function(event) {
                        const searchResults = document.getElementById('searchResults');
                        const searchInput = document.getElementById('branchSearch');
                        if (searchResults && !searchResults.contains(event.target) && event.target !== searchInput) {
                            searchResults.style.display = 'none';
                        }
                    });
                    
                    function filterBranches(query) {
                        const resultsContainer = document.getElementById('searchResults');
                        if (!currentData) {
                            resultsContainer.style.display = 'none';
                            return;
                        }
                        
                        const allBranches = new Set();
                        currentData.mainProject.branches.forEach(b => allBranches.add(b.name));
                        currentData.submodules.forEach(sub => sub.branches.forEach(b => allBranches.add(b.name)));
                        
                        const matches = Array.from(allBranches).filter(b => b.toLowerCase().includes((query||'').toLowerCase()));
                        
                        resultsContainer.innerHTML = '';
                        if (matches.length > 0) {
                            resultsContainer.style.display = 'flex';
                            matches.forEach(branch => {
                                const item = document.createElement('div');
                                item.style.padding = '10px';
                                item.style.cursor = 'pointer';
                                item.style.borderBottom = '1px solid var(--border)';
                                item.innerText = branch;
                                item.onclick = () => {
                                    visualizingBranch = branch;
                                    document.getElementById('searchResults').style.display = 'none';
                                    renderDashboard(currentData);
                                };
                                item.onmouseover = () => item.style.background = 'rgba(255,255,255,0.1)';
                                item.onmouseout = () => item.style.background = 'transparent';
                                resultsContainer.appendChild(item);
                            });
                        } else {
                            resultsContainer.style.display = 'none';
                        }
                    }
                    
                    function toggleSelectAllProjects() {
                        const selectAll = document.getElementById('selectAllProjects').checked;
                        const checkboxes = document.querySelectorAll('.project-checkbox');
                        checkboxes.forEach(cb => cb.checked = selectAll);
                    }
                    
                    function updateSelectAllStatus() {
                        const checkboxes = document.querySelectorAll('.project-checkbox');
                        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
                        document.getElementById('selectAllProjects').checked = allChecked;
                    }

                    function openModal(action) {
                        activeModalAction = action;
                        const modalOverlay = document.getElementById('modalOverlay');
                        const modalTitle = document.getElementById('modalTitle');
                        const modalInput = document.getElementById('modalInput');
                        const projectsContainer = document.getElementById('modalProjects');
                        
                        modalOverlay.style.display = 'flex';
                        projectsContainer.innerHTML = '';
                        
                        const allProjects = [currentData.mainProject, ...(currentData.submodules || [])];
                        
                        modalInput.style.display = 'block';
                        modalInput.value = '';
                        
                        const extraInputContainer = document.getElementById('modalExtraInputContainer');
                        const extraInputLabel = document.getElementById('modalExtraInputLabel');
                        const extraInput = document.getElementById('modalExtraInput');
                        
                        extraInputContainer.style.display = 'none';
                        extraInput.value = '';

                        // Clear previous autocomplete
                        if (window.modalAutocompleteCleanup) {
                            window.modalAutocompleteCleanup();
                            window.modalAutocompleteCleanup = null;
                        }

                        if (window.modalExtraAutocompleteCleanup) {
                            window.modalExtraAutocompleteCleanup();
                            window.modalExtraAutocompleteCleanup = null;
                        }

                        window.activeModalRequiresInput = false;

                        const currentActiveBranch = visualizingBranch || (currentData.mainProject.branches.find(b => b.isCurrent)?.name || 'main');

                        if (action === 'switchBranch') {
                            modalTitle.innerText = 'Switch Branch';
                            modalInput.placeholder = 'Search branch...';
                            modalInput.value = visualizingBranch || '';
                            window.activeModalRequiresInput = true;
                            setupModalAutocomplete(modalInput);
                        } else if (action === 'createBranch') {
                            modalTitle.innerText = 'Create New Branch';
                            modalInput.value = '';
                            modalInput.placeholder = 'New branch name...';
                            window.activeModalRequiresInput = true;
                            
                            extraInputContainer.style.display = 'flex';
                            extraInputLabel.innerText = 'Base Branch (source)';
                            extraInput.value = currentActiveBranch;
                            setupModalAutocomplete(extraInput, true); 
                        } else if (action === 'mergeBack') {
                            modalTitle.innerText = 'Merge Back';
                            modalInput.placeholder = 'Branch to merge...';
                            modalInput.value = currentData.mainProject.parentBranch || 'main'; // The source branch
                            window.activeModalRequiresInput = true;
                            setupModalAutocomplete(modalInput);

                            extraInputContainer.style.display = 'flex';
                            extraInputLabel.innerText = 'Target Branch (into)';
                            extraInput.value = currentActiveBranch;
                            setupModalAutocomplete(extraInput, true); 
                        } else if (action === 'pull') {
                            modalTitle.innerText = 'Pull';
                            modalInput.placeholder = 'Branch to pull...';
                            modalInput.value = currentActiveBranch;
                            window.activeModalRequiresInput = true;
                            setupModalAutocomplete(modalInput);
                        } else if (action === 'push') {
                            modalTitle.innerText = 'Push';
                            modalInput.placeholder = 'Branch to push...';
                            modalInput.value = currentActiveBranch;
                            window.activeModalRequiresInput = true;
                            setupModalAutocomplete(modalInput);
                        }
                        
                        const existingTags = document.getElementById('modalRecentTags');
                        if (existingTags) existingTags.parentNode.removeChild(existingTags);

                        if (['switchBranch', 'createBranch', 'mergeBack'].includes(action)) {
                            const tagsContainer = document.createElement('div');
                            tagsContainer.id = 'modalRecentTags';
                            modalInput.parentNode.appendChild(tagsContainer);
                            renderRecentTags('modalRecentTags', 'modalInput');
                        }

                        updateModalProjectStatus(modalInput.value);

                        if (action === 'push') {
                             const hasLocalOnly = allProjects.some(p => {
                                const cb = p.branches.find(b => b.isCurrent);
                                return cb && cb.isLocalOnly;
                             });
                             if (hasLocalOnly) {
                                const upstreamDiv = document.createElement('div');
                                upstreamDiv.style = "margin-top: 15px; padding-top: 10px; border-top: 1px solid var(--border);";
                                upstreamDiv.id = 'pushUpstreamCheckContainer';
                                upstreamDiv.innerHTML = `
                                    <label style="display:flex; align-items:center; gap:8px; color:#f59e0b; font-size:13px; font-weight:bold;">
                                        <input type="checkbox" id="pushSetUpstreamCb" checked>
                                        Auto-set upstream (origin) for local-only branches
                                    </label>
                                `;
                                projectsContainer.appendChild(upstreamDiv);
                             }
                        }

                        validateModalInput();
                    }

                    function updateModalProjectStatus(val) {
                        const projectsContainer = document.getElementById('modalProjects');
                        if (!projectsContainer || !activeModalAction) return;

                        const allProjects = [currentData.mainProject, ...(currentData.submodules || [])];
                        let projectsHtml = `
                            <label style="font-weight:bold; border-bottom: 1px solid var(--border); padding-bottom: 8px; margin-bottom: 4px;">
                                <input type="checkbox" id="selectAllProjects" checked onchange="toggleSelectAllProjects()"> Select All
                            </label>
                        `;

                        allProjects.forEach(p => {
                            let label = '';
                            
                            if (activeModalAction === 'switchBranch') {
                                const branchExists = p.branches.some(b => b.name === val);
                                if (branchExists) {
                                    label = `<span style="color:#22c55e; font-size:12px;">(Exists)</span>`;
                                } else {
                                    label = `<span style="color:#f87171; font-size:12px;">(Will not change)</span>`;
                                }
                            } else if (activeModalAction === 'mergeBack') {
                                const branchExists = p.branches.some(b => b.name === val);
                                if (branchExists) {
                                    label = `<span style="color:#22c55e; font-size:12px;">(Found)</span>`;
                                } else {
                                    label = `<span style="color:#f87171; font-size:12px;">(Branch missing)</span>`;
                                }
                            } else if (activeModalAction === 'createBranch') {
                                if (val) {
                                    const branchExists = p.branches.some(b => b.name === val);
                                    if (branchExists) {
                                        label = `<span style="color:#f87171; font-size:12px;">(Already exists)</span>`;
                                    } else {
                                        label = `<span style="color:#22c55e; font-size:12px;">(New)</span>`;
                                    }
                                }
                            } else if (activeModalAction === 'pull' || activeModalAction === 'push') {
                                const branchExists = p.branches.some(b => b.name === val);
                                if (branchExists) {
                                    label = `<span style="color:#22c55e; font-size:12px;">(Exists)</span>`;
                                } else {
                                    label = `<span style="color:#f87171; font-size:12px;">(Missing)</span>`;
                                }
                            }

                            projectsHtml += `
                                <label style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                                    <span>
                                        <input type="checkbox" class="project-checkbox" value="${'$'}{p.path}" checked onchange="updateSelectAllStatus()">
                                        <span style="overflow:hidden; text-overflow:ellipsis;">${'$'}{p.name}</span>
                                    </span>
                                    ${'$'}{label}
                                </label>
                            `;
                        });
                        projectsContainer.innerHTML = projectsHtml;
                    }

                    function setupModalAutocomplete(input, isBase = false) {
                        const results = document.createElement('div');
                        results.id = isBase ? 'modalBaseSearchResults' : 'modalSearchResults';
                        results.style = "position: absolute; top: 40px; left: 0; background: #1e293b; width: 100%; max-height: 150px; overflow-y: auto; display: none; flex-direction: column; border-radius: 8px; border: 1px solid var(--border); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5); z-index: 1000;";
                        input.parentNode.appendChild(results);

                        const handler = (e) => {
                            const query = e.target.value.toLowerCase();
                            if (!query) {
                                results.style.display = 'none';
                                return;
                            }
                            const allBranches = new Set();
                            currentData.mainProject.branches.forEach(b => allBranches.add(b.name));
                            currentData.submodules.forEach(sub => sub.branches.forEach(b => allBranches.add(b.name)));
                            const matches = Array.from(allBranches).filter(b => b.toLowerCase().includes(query));

                            results.innerHTML = '';
                            if (matches.length > 0) {
                                results.style.display = 'flex';
                                matches.forEach(branch => {
                                    const item = document.createElement('div');
                                    item.style = "padding: 10px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.1); font-size: 13px;";
                                    item.innerText = branch;
                                    item.onclick = () => {
                                        input.value = branch;
                                        results.style.display = 'none';
                                        if (!isBase) updateModalProjectStatus(branch);
                                        validateModalInput();
                                    };
                                    item.onmouseover = () => item.style.background = 'rgba(255,255,255,0.1)';
                                    item.onmouseout = () => item.style.background = 'transparent';
                                    results.appendChild(item);
                                });
                            } else {
                                results.style.display = 'none';
                            }
                        };

                        input.addEventListener('input', handler);
                        input.addEventListener('focus', handler);

                        const cleanup = () => {
                            input.removeEventListener('input', handler);
                            input.removeEventListener('focus', handler);
                            if (results.parentNode) results.parentNode.removeChild(results);
                        };

                        if (isBase) window.modalExtraAutocompleteCleanup = cleanup;
                        else window.modalAutocompleteCleanup = cleanup;
                    }

                    function openCheckoutModal(branchName) {
                        document.getElementById('searchResults').style.display = 'none';
                        activeModalAction = 'checkout';
                        
                        document.getElementById('modalOverlay').style.display = 'flex';
                        document.getElementById('modalTitle').innerText = `Checkout '${'$'}{branchName}'`;
                        document.getElementById('modalInput').style.display = 'none';
                        
                        if (window.modalAutocompleteCleanup) {
                            window.modalAutocompleteCleanup();
                            window.modalAutocompleteCleanup = null;
                        }

                        if (window.modalExtraAutocompleteCleanup) {
                            window.modalExtraAutocompleteCleanup();
                            window.modalExtraAutocompleteCleanup = null;
                        }

                        const extraInputContainer = document.getElementById('modalExtraInputContainer');
                        if (extraInputContainer) extraInputContainer.style.display = 'none';
                        
                        window.activeModalRequiresInput = false;
                        validateModalInput();
                        
                        window.checkoutTargetBranch = branchName;
                        
                        const projectsContainer = document.getElementById('modalProjects');
                        let projectsHtml = `
                            <label style="font-weight:bold; border-bottom: 1px solid var(--border); padding-bottom: 8px; margin-bottom: 4px;">
                                <input type="checkbox" id="selectAllProjects" checked onchange="toggleSelectAllProjects()"> Select All
                            </label>
                        `;
                        
                        const allProjects = [currentData.mainProject, ...(currentData.submodules || [])];
                        allProjects.forEach(p => {
                            const branchExists = p.branches.some(b => b.name === branchName);
                            const extraLabel = branchExists ? `<span style="color:#22c55e; font-size:12px;">(Exists)</span>` : `<span style="color:#aaa; font-size:12px;">(Will create)</span>`;
                            projectsHtml += `
                                <label style="display:flex; justify-content:space-between; width:100%;">
                                    <span>
                                        <input type="checkbox" class="project-checkbox" value="${'$'}{p.path}" data-create="${'$'}{!branchExists}" checked onchange="updateSelectAllStatus()">
                                        ${'$'}{p.name}
                                    </span>
                                    ${'$'}{extraLabel}
                                </label>
                            `;
                        });
                        projectsContainer.innerHTML = projectsHtml;
                    }
                    
                    function closeModal() {
                        document.getElementById('modalOverlay').style.display = 'none';
                    }
                    
                    function getOriginalBranch(path) {
                        const proj = [currentData.mainProject, ...(currentData.submodules || [])].find(p => p.path === path);
                        if (!proj) return 'main';
                        const current = proj.branches.find(b => b.isCurrent);
                        return current ? current.name : 'main'; 
                    }

                    async function submitModal() {
                        const input = document.getElementById('modalInput');
                        const inputValue = input ? input.value.trim() : '';
                        
                        if (window.activeModalRequiresInput && !inputValue) {
                            showToast('Please provide a required value', 'warning');
                            return;
                        }
                        
                        closeModal();
                        
                        if (activeModalAction === 'checkout' || activeModalAction === 'switchBranch') {
                            const target = activeModalAction === 'switchBranch' ? inputValue : window.checkoutTargetBranch;
                            const checkboxes = document.querySelectorAll('.project-checkbox:checked');
                            const selected = Array.from(checkboxes).map(cb => {
                                const path = cb.value;
                                // For switch branch, check if branch exists in this specific project
                                const proj = [currentData.mainProject, ...(currentData.submodules || [])].find(p => p.path === path);
                                const exists = proj ? proj.branches.some(b => b.name === target) : false;
                                return { path: path, createIfMissing: !exists };
                            });
                            
                            window.checkoutTargetBranch = target; // Ensure it's set for performCheckout
                            await performCheckoutOnSelected(target, selected);
                            saveRecentBranch(target);
                        } else {
                            let endpoint = '';
                            let extraParams = {};
                            
                            if (activeModalAction === 'createBranch') {
                                endpoint = '/api/git/create-branch';
                                const bbInput = document.getElementById('modalExtraInput');
                                if (bbInput) extraParams.baseBranch = bbInput.value.trim();
                            }
                            else if (activeModalAction === 'mergeBack') {
                                endpoint = '/api/git/merge';
                                const targetInput = document.getElementById('modalExtraInput');
                                if (targetInput) extraParams.targetBranch = targetInput.value.trim();
                            }
                            else if (activeModalAction === 'pull') {
                                endpoint = '/api/git/pull';
                                extraParams.branch = inputValue;
                            }
                            else if (activeModalAction === 'push') {
                                endpoint = '/api/git/push';
                                extraParams.branch = inputValue;
                                const setUpstreamCb = document.getElementById('pushSetUpstreamCb');
                                if (setUpstreamCb) {
                                    extraParams.setUpstream = setUpstreamCb.checked;
                                }
                            }
                            
                            await performActionOnSelected(inputValue, endpoint, extraParams);
                            if (activeModalAction === 'createBranch' || activeModalAction === 'mergeBack') {
                                saveRecentBranch(inputValue);
                            }
                        }
                    }

                    async function performCheckoutOnSelected(targetBranch, manualSelected = null) {
                        const checkboxes = document.querySelectorAll('.project-checkbox:checked');
                        const selected = manualSelected || Array.from(checkboxes).map(cb => ({ path: cb.value, createIfMissing: cb.dataset.create === 'true' }));
                        
                        if (selected.length === 0) return showToast('No projects selected', 'warning');
                        
                        document.getElementById('globalLoading').style.display = 'flex';
                        
                        let results = [];
                        // We do them concurrently visually, but await all to finish
                        await Promise.all(selected.map(async (s) => {
                            const cardId = 'card-' + s.path.replace(/[^a-zA-Z0-9]/g, '-');
                            const spinner = document.querySelector(`#${'$'}{cardId} .card-spinner`);
                            if (spinner) spinner.style.display = 'block';
                            
                            try {
                                const res = await fetch('/api/git/checkout', {
                                    method: 'POST',
                                    headers: {'Content-Type': 'application/json'},
                                    body: JSON.stringify({ path: s.path, branch: targetBranch, createIfMissing: s.createIfMissing })
                                });
                                const success = res.ok;
                                const errorMsg = success ? null : await res.text();
                                results.push({ path: s.path, success, errorMsg, originalBranch: getOriginalBranch(s.path) });
                            } catch(e) {
                                results.push({ path: s.path, success: false, errorMsg: e.message, originalBranch: getOriginalBranch(s.path) });
                            }
                            if (spinner) spinner.style.display = 'none';
                        }));
                        
                        document.getElementById('globalLoading').style.display = 'none';
                        
                        const errors = results.filter(r => !r.success);
                        if (errors.length > 0) {
                            const errDetails = errors.map(e => e.path.split(/[\\/]/).pop() + ": " + e.errorMsg).join('\\n');
                            addLogEntry('Checkout Branches', 'error', 'Failures:\\n' + errDetails);
                            showGlobalErrorModal(errors, results, targetBranch, 'checkout');
                        } else {
                            addLogEntry('Checkout Branches', 'success', 'Successfully checked out branch: ' + targetBranch + ' on ' + selected.length + ' repositories.');
                            showToast(`Checkout completed successfully`, 'success');
                            await loadProject(currentData.mainProject.path);
                        }
                    }
                    
                    async function performActionOnSelected(param, endpoint, extraParams = {}) {
                        const checkboxes = document.querySelectorAll('.project-checkbox:checked');
                        const selectedPaths = Array.from(checkboxes).map(cb => cb.value);
                        
                        if (selectedPaths.length === 0) return showToast('No projects selected', 'warning');
                        
                        document.getElementById('globalLoading').style.display = 'flex';
                        let results = [];
                        
                        await Promise.all(selectedPaths.map(async (path) => {
                            const cardId = 'card-' + path.replace(/[^a-zA-Z0-9]/g, '-');
                            const spinner = document.querySelector(`#${'$'}{cardId} .card-spinner`);
                            if (spinner) spinner.style.display = 'block';
                            
                            try {
                                let bodyData = {};
                                if (activeModalAction === 'push') {
                                    bodyData = { path: path, branch: extraParams.branch, setUpstream: extraParams.setUpstream || false };
                                } else if (activeModalAction === 'pull') {
                                    bodyData = { path: path, branch: extraParams.branch };
                                } else if (activeModalAction === 'createBranch') {
                                    bodyData = { path: path, branch: param, baseBranch: extraParams.baseBranch };
                                } else if (activeModalAction === 'mergeBack') {
                                    bodyData = { path: path, branch: param, targetBranch: extraParams.targetBranch };
                                } else {
                                    bodyData = { path: path, branch: param };
                                }
                                
                                const res = await fetch(endpoint, {
                                    method: 'POST',
                                    headers: {'Content-Type': 'application/json'},
                                    body: JSON.stringify(bodyData)
                                });
                                const success = res.ok;
                                const errorMsg = success ? null : await res.text();
                                results.push({ path, success, errorMsg });
                            } catch(e) {
                                results.push({ path, success: false, errorMsg: e.message });
                            }
                            
                            if (spinner) spinner.style.display = 'none';
                        }));
                        
                        document.getElementById('globalLoading').style.display = 'none';
                        
                        const errors = results.filter(r => !r.success);
                        if (errors.length > 0) {
                            const errDetails = errors.map(e => e.path.split(/[\\/]/).pop() + ": " + e.errorMsg).join('\\n');
                            addLogEntry(activeModalAction, 'error', 'Failures:\\n' + errDetails);
                            showGlobalErrorModal(errors, results, param, activeModalAction);
                        } else {
                            addLogEntry(activeModalAction, 'success', 'Action completed successfully on ' + selectedPaths.length + ' repositories.' + (param ? ' Param/Branch: ' + param : ''));
                            showToast(`Action completed successfully`, 'success');
                            await loadProject(currentData.mainProject.path);
                        }
                    }

                    function showGlobalErrorModal(errors, allResults, attemptedValue, actionType) {
                        const overlay = document.getElementById('errorModalOverlay');
                        overlay.style.display = 'flex';
                        
                        let html = `<ul style="padding-left: 20px;">`;
                        errors.forEach(e => {
                            const name = e.path.split(/[\\/]/).pop();
                            html += `
                                <li style="margin-bottom:12px;">
                                    <strong>${'$'}{name}</strong>
                                    <details>
                                        <summary style="cursor:pointer; color:#f87171; font-size:13px; margin-top:4px;">View Error Details</summary>
                                        <pre style="color:#f87171; background:rgba(0,0,0,0.1); padding:8px; border-radius:4px; margin-top:4px; font-size:11px; white-space:pre-wrap; word-wrap:break-word;">${'$'}{e.errorMsg}</pre>
                                    </details>
                                </li>
                            `;
                        });
                        html += `</ul>`;
                        
                        document.getElementById('errorModalContent').innerHTML = html;
                        
                        // Pass pending errors to display after reload
                        window.pendingCardErrors = errors;
                        
                        if (actionType === 'checkout') {
                            document.getElementById('rollbackBtn').style.display = 'block';
                            document.getElementById('ignoreBtn').innerText = 'Ignore and Continue';
                            window.lastCheckoutResults = allResults;
                        } else {
                            document.getElementById('rollbackBtn').style.display = 'none';
                            document.getElementById('ignoreBtn').innerText = 'Close';
                        }
                    }

                    async function rollbackCheckout() {
                        document.getElementById('errorModalOverlay').style.display = 'none';
                        document.getElementById('globalLoading').style.display = 'flex';
                        
                        const successes = window.lastCheckoutResults.filter(r => r.success);
                        await Promise.all(successes.map(async (s) => {
                            try {
                                await fetch('/api/git/checkout', {
                                    method: 'POST',
                                    headers: {'Content-Type': 'application/json'},
                                    body: JSON.stringify({ path: s.path, branch: s.originalBranch, createIfMissing: false })
                                });
                            } catch(e) {}
                        }));
                        
                        document.getElementById('globalLoading').style.display = 'none';
                        showToast('Rolled back successful checkouts', 'info');
                        await loadProject(currentData.mainProject.path);
                    }

                    function ignoreAndContinue() {
                        document.getElementById('errorModalOverlay').style.display = 'none';
                        loadProject(currentData.mainProject.path);
                    }

                    function validateModalInput() {
                        const btn = document.getElementById('modalConfirmBtn');
                        if (window.activeModalRequiresInput) {
                            const val = document.getElementById('modalInput').value.trim();
                            if (!val) {
                                btn.disabled = true;
                                btn.style.opacity = '0.5';
                                btn.style.cursor = 'not-allowed';
                            } else {
                                btn.disabled = false;
                                btn.style.opacity = '1';
                                btn.style.cursor = 'pointer';
                            }
                        } else {
                            btn.disabled = false;
                            btn.style.opacity = '1';
                            btn.style.cursor = 'pointer';
                        }
                    }
                    """
                )
            }
        }
    }
    body {
        div("global-loading-overlay") {
            id = "globalLoading"
            div("spinner") {}
            div {
                style = "margin-top: 15px; font-weight: bold; letter-spacing:1px;"
                +"Executing..."
            }
        }

        div("container") {
            div("sidebar") {
                h2 {
                    style = "margin-bottom: 20px; color: var(--accent); font-size: 24px;"
                    +"Git-Help"
                }
                div { id = "sidebar-content" }
            }
            div("main-content") {
                id = "main"
                div("setup-screen") {
                    h1 { +"Welcome to Git-Help" }
                    p { +"Enter the absolute path of your Git project" }
                    input(type = InputType.text) {
                        id = "projectPath"
                        placeholder = "/home/user/projects/my-app"
                        onKeyPress = "if(event.key === 'Enter') setProject()"
                    }
                }
            }
        }

        div("modal-overlay") {
            id = "modalOverlay"
            div("modal") {
                h2 {
                    id = "modalTitle"
                    +"Action"
                }
                div("modal-projects") { id = "modalProjects" }
                div {
                    id = "modalExtraInputContainer"
                    style = "display: none; flex-direction: column; gap: 5px; margin-bottom: 15px;"
                    label {
                        id = "modalExtraInputLabel"
                        style =
                                "font-size: 12px; color: var(--text-secondary); margin-bottom: 3px; display: block;"
                        +"Extra Branch"
                    }
                    div {
                        style = "position: relative; width: 100%;"
                        input(type = InputType.text) {
                            id = "modalExtraInput"
                            placeholder = "e.g. main, develop..."
                            style = "width: 100%; box-sizing: border-box;"
                        }
                    }
                }
                div {
                    style = "position: relative; width: 100%;"
                    input(type = InputType.text) {
                        id = "modalInput"
                        placeholder = "Value..."
                        style = "margin-bottom: 5px; width: 100%; box-sizing: border-box;"
                        onInput = "updateModalProjectStatus(this.value); validateModalInput()"
                    }
                }
                div {
                    style = "margin-top: 10px; display: flex; justify-content: flex-end; gap: 10px;"
                    button {
                        classes = setOf("action-btn")
                        style = "width: auto; margin: 0; background: transparent;"
                        onClick = "closeModal()"
                        +"Cancel"
                    }
                    button {
                        id = "modalConfirmBtn"
                        classes = setOf("action-btn")
                        style = "width: auto; margin: 0; background: var(--accent); color: white;"
                        onClick = "submitModal()"
                        +"Confirm"
                    }
                }
            }
        }

        // Global Error Modal
        div("modal-overlay") {
            id = "errorModalOverlay"
            style = "z-index: 200;"
            div("modal") {
                style = "width: 500px; border-color: #ef4444;"
                h2 {
                    style = "color: #ef4444;"
                    +"Operation Failed"
                }
                div {
                    id = "errorModalContent"
                    style =
                            "margin-top:10px; font-size:14px; color: var(--text-secondary); max-height: 250px; overflow-y:auto; line-height: 1.4;"
                }
                div {
                    style = "margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;"
                    button {
                        id = "rollbackBtn"
                        classes = setOf("action-btn")
                        style = "width: auto; margin: 0; background: transparent; display:none;"
                        onClick = "rollbackCheckout()"
                        +"Undo Successful"
                    }
                    button {
                        id = "ignoreBtn"
                        classes = setOf("action-btn")
                        style =
                                "width: auto; margin: 0; background: #ef4444; color: white; border: none;"
                        onClick = "ignoreAndContinue()"
                        +"Ignore and Continue"
                    }
                }
            }
        }

        // Activity Logs Modal
        div("modal-overlay") {
            id = "actionLogsModalOverlay"
            style = "z-index: 210;"
            div("modal") {
                div {
                    style =
                            "display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;"
                    h2 { +"Activity Log" }
                    button {
                        style =
                                "background:transparent; border:none; color:var(--text-secondary); cursor:pointer; font-size:20px;"
                        onClick = "hideActionLogsModal()"
                        +"✕"
                    }
                }
                div {
                    id = "actionLogsContent"
                    style = "max-height: 400px; overflow-y:auto; padding-right:10px;"
                }
            }
        }

        div { id = "snackbar" }
    }
}
