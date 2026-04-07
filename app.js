/* ============================================================
   TCF Canada Expression Écrite Simulator — Application Logic
   ============================================================ */

// ==================== STATE ====================
let currentTask = 1;
let sessionMode = 'complet';
let timerSeconds = 0;
let timerInterval = null;
let sessionStarted = false;
let currentScenario = '';
let isEvaluating = false;

const examResponses = { 1: '', 2: '', 3: '' };
const examScenarios = { 1: '', 2: '', 3: '' };

// ==================== TASK CONFIG ====================
const TASK_CONFIG = {
    1: {
        title: 'Message Personnel',
        fullTitle: 'Tâche 1 — Message Personnel',
        wordMin: 60,
        wordMax: 120,
        duration: 600,       // 10 min
        type: 'email'
    },
    2: {
        title: 'Article / Récit Argumenté',
        fullTitle: 'Tâche 2 — Article / Récit Argumenté',
        wordMin: 120,
        wordMax: 150,
        duration: 1200,      // 20 min
        type: 'article'
    },
    3: {
        title: 'Analyse Comparative',
        fullTitle: 'Tâche 3 — Analyse Comparative',
        wordMin: 120,
        wordMax: 180,
        duration: 1800,      // 30 min
        type: 'argumentation'
    }
};

// ==================== DOM REFERENCES ====================
const $ = id => document.getElementById(id);

const DOM = {
    timer: $('timer'),
    wordCount: $('wordCount'),
    wordLimit: $('wordLimit'),
    wordRange: $('wordRange'),
    userInput: $('userInput'),
    scenario: $('scenario'),
    startOverlay: $('startOverlay'),
    submitBtn: $('submitBtn'),
    btnGenerate: $('btnGenerate'),
    btnNextTask: $('btnNextTask'),
    saveStatus: $('saveStatus'),
    evalResult: $('evalResult'),
    loadingPanel: $('loadingPanel'),
    taskIndicator: $('taskIndicator'),
    scenarioBadge: $('scenarioBadge'),
    writingStatus: $('writingStatus'),
    settingsModal: $('settingsModal'),
    appView: $('appView'),
    historyView: $('historyView'),
    btnRealScenario: $('btnRealScenario'),
    btnUpdateSubjects: $('btnUpdateSubjects'),
};

// ==================== REAL SUBJECTS DATABASE ====================
// In-memory combined database (Base + localStorage updates)
let SUBJECTS_DB = { 1: [], 2: [], 3: [] };

function initializeSubjectsDB() {
    // Start with the hardcoded base from subjects-data.js
    SUBJECTS_DB = JSON.parse(JSON.stringify(typeof REAL_SUBJECTS !== 'undefined' ? REAL_SUBJECTS : { 1: [], 2: [], 3: [] }));
    
    // Add custom/local updates if any
    const localUpdates = localStorage.getItem('tcf_subjects_updates');
    if (localUpdates) {
        try {
            const updates = JSON.parse(localUpdates);
            Object.keys(updates).forEach(task => {
                // Prepend or merge updates
                SUBJECTS_DB[task] = [...new Set([...updates[task], ...SUBJECTS_DB[task]])];
            });
        } catch (e) { console.error('Erreur chargement updates:', e); }
    }
}

async function updateSubjectsFromWeb() {
    if (isEvaluating) return;

    DOM.btnUpdateSubjects.disabled = true;
    DOM.btnUpdateSubjects.innerHTML = '⏳ Actualisation...';
    showToast("Recherche par mois en cours...");

    const now = new Date();
    const months = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
    const currentM = months[now.getMonth()];
    const prevM = months[(now.getMonth() - 1 + 12) % 12];
    const year = now.getFullYear();

    const targets = [
        { url: `https://reussir-tcfcanada.com/${currentM}-${year}-expression-ecrite/`, mName: currentM },
        { url: `https://reussir-tcfcanada.com/${prevM}-${year}-expression-ecrite/`, mName: prevM },
        { url: `https://prepmontcfca.com/expression-ecrite-${currentM}-${year}/`, mName: currentM },
        { url: `https://prepmontcfca.com/expression-ecrite-${prevM}-${year}/`, mName: prevM },
        { url: 'https://formation-tcfcanada.com/expression-ecrite-sujets-dactualites/', mName: 'actualités' }
    ];

    let newFoundCount = 0;
    let localUpdates = { 1: [], 2: [], 3: [] };

    for (const target of targets) {
        try {
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(target.url)}`;
            const response = await fetch(proxyUrl);
            if (!response.ok) continue;
            
            const data = await response.json();
            const html = data.contents;
            if (!html || html.length < 500) continue;

            const tag = `(${target.mName} ${year})`;
            
            // Task 1 & 2
            const t1Matches = html.match(/[^>]{50,}(60|soixante)\s?-\s?(120|cent vingt)[^<]{30,}/gi) || [];
            const t2Matches = html.match(/[^>]{100,}(120|cent vingt)\s?-\s?(150|cent cinquante)[^<]{50,}/gi) || [];
            
            t1Matches.forEach(m => {
                let clean = m.replace(/<\/?[^>]+(>|$)/g, "").trim();
                if (clean.length > 40) {
                    if (!clean.includes('202')) clean += ` ${tag}`;
                    if (!localUpdates[1].includes(clean)) {
                        localUpdates[1].push(clean);
                        newFoundCount++;
                    }
                }
            });

            t2Matches.forEach(m => {
                let clean = m.replace(/<\/?[^>]+(>|$)/g, "").trim();
                if (clean.length > 80) {
                    if (!clean.includes('202')) clean += ` ${tag}`;
                    if (!localUpdates[2].includes(clean)) {
                        localUpdates[2].push(clean);
                        newFoundCount++;
                    }
                }
            });

            // Task 3
            const docMatches = html.match(/Document\s?1\s?:?\s?([^]+?)Document\s?2\s?:?\s?([^]+?)(?=<|\n\n|Tâche)/gi) || [];
            docMatches.forEach(m => {
                const parts = m.split(/Document\s?2\s?:?/i);
                if (parts.length === 2) {
                    let d1 = parts[0].replace(/Document\s?1\s?:?/i, "").replace(/<\/?[^>]+(>|$)/g, "").trim();
                    let d2 = parts[1].replace(/<\/?[^>]+(>|$)/g, "").trim();
                    if (d1.length > 50 && d2.length > 50) {
                        if (!d1.includes('202')) d1 += ` ${tag}`;
                        if (!d2.includes('202')) d2 += ` ${tag}`;
                        localUpdates[3].push({ doc1: d1, doc2: d2 });
                        newFoundCount++;
                    }
                }
            });

        } catch (e) {
            console.warn(`Scrape error ${target.url}:`, e);
        }
    }

    if (newFoundCount > 0) {
        localStorage.setItem('tcf_subjects_updates', JSON.stringify(localUpdates));
        initializeSubjectsDB();
        showToast(`Mise à jour réussie : ${newFoundCount} éléments trouvés ✓`);
    } else {
        showToast("Aucun nouveau sujet trouvé aujourd'hui.");
    }

    DOM.btnUpdateSubjects.disabled = false;
    DOM.btnUpdateSubjects.innerHTML = '🔄 Actualiser';
}

// ==================== PROVIDER CONFIG ====================
const PROVIDERS = {
    github: {
        name: 'GitHub Models',
        endpoint: 'https://models.github.ai/inference/chat/completions',
        keyPrefix: 'ghp_',
        defaultModel: 'openai/gpt-4.1-mini',
        headers: (apiKey) => ({
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        })
    },
    nvidia: {
        name: 'Nvidia NIM',
        endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
        keyPrefix: 'nvapi-',
        defaultModel: 'meta/llama-3.1-70b-instruct',
        headers: (apiKey) => ({
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        })
    }
};

// ==================== SETTINGS ====================
function getProvider() {
    return localStorage.getItem('tcf_provider') || 'github';
}

function getApiKey(provider) {
    const p = provider || getProvider();
    return localStorage.getItem(`tcf_${p}_api_key`) || '';
}

function getModel(provider) {
    const p = provider || getProvider();
    return localStorage.getItem(`tcf_${p}_model`) || PROVIDERS[p].defaultModel;
}

function getAutoFallback() {
    return localStorage.getItem('tcf_auto_fallback') === 'true';
}

function onProviderChange() {
    const provider = $('providerSelect').value;
    $('githubConfig').style.display = provider === 'github' ? 'block' : 'none';
    $('nvidiaConfig').style.display = provider === 'nvidia' ? 'block' : 'none';
}

function openSettings() {
    // Load saved values
    const provider = getProvider();
    $('providerSelect').value = provider;
    $('githubApiKey').value = localStorage.getItem('tcf_github_api_key') || '';
    $('nvidiaApiKey').value = localStorage.getItem('tcf_nvidia_api_key') || '';
    $('githubModelSelect').value = getModel('github');
    $('nvidiaModelSelect').value = getModel('nvidia');
    $('autoFallback').checked = getAutoFallback();
    onProviderChange();
    DOM.settingsModal.classList.add('open');
}

function closeSettings() {
    DOM.settingsModal.classList.remove('open');
}

function saveSettings() {
    const provider = $('providerSelect').value;
    const githubKey = $('githubApiKey').value.trim();
    const nvidiaKey = $('nvidiaApiKey').value.trim();
    const githubModel = $('githubModelSelect').value;
    const nvidiaModel = $('nvidiaModelSelect').value;
    const autoFallback = $('autoFallback').checked;

    localStorage.setItem('tcf_provider', provider);
    if (githubKey) localStorage.setItem('tcf_github_api_key', githubKey);
    if (nvidiaKey) localStorage.setItem('tcf_nvidia_api_key', nvidiaKey);
    localStorage.setItem('tcf_github_model', githubModel);
    localStorage.setItem('tcf_nvidia_model', nvidiaModel);
    localStorage.setItem('tcf_auto_fallback', String(autoFallback));

    closeSettings();
    showToast(`Configuration enregistrée ✓ — ${PROVIDERS[provider].name}`);
}

// ==================== SESSION MODES ====================
function changeSessionMode(mode) {
    if (sessionStarted) {
        if (!confirm('Changer de mode annulera votre session en cours. Continuer ?')) return;
        resetSessionState();
    }

    sessionMode = mode;

    $('mode-complet').classList.toggle('active', mode === 'complet');
    $('mode-training').classList.toggle('active', mode === 'training');

    const label = $('sidebar-label');
    const desc = $('mode-desc');
    const overlayTitle = $('overlay-title');
    const overlayDesc = $('overlay-desc');

    if (mode === 'complet') {
        label.innerText = 'PARCOURS EXAMEN • 60 min';
        desc.innerHTML = '<strong>Mode Examen :</strong> 60 minutes pour réaliser les 3 tâches consécutivement. Passez d\'une tâche à l\'autre librement.';
        overlayTitle.innerText = 'Prêt pour l\'examen complet ?';
        overlayDesc.innerText = 'Le chronomètre de 60 minutes démarrera dès que vous appuierez sur le bouton. Vous pourrez naviguer librement entre les 3 tâches.';
    } else {
        label.innerText = 'ENTRAÎNEMENT LIBRE';
        desc.innerHTML = '<strong>Mode Entraînement :</strong> Choisissez une tâche et entraînez-vous avec son chronomètre dédié (10, 20 ou 30 min).';
        overlayTitle.innerText = 'Entraînement ciblé';
        overlayDesc.innerText = `Vous allez pratiquer la ${TASK_CONFIG[currentTask].fullTitle} avec un chronomètre de ${TASK_CONFIG[currentTask].duration / 60} minutes.`;
    }

    DOM.startOverlay.style.display = 'flex';
    DOM.userInput.disabled = true;
    DOM.submitBtn.disabled = true;
    DOM.btnGenerate.disabled = true;
    if (DOM.btnRealScenario) DOM.btnRealScenario.disabled = true;
    if ($('btnCustomScenario')) $('btnCustomScenario').disabled = true;
    if ($('btnCustomScenario')) $('btnCustomScenario').disabled = true;
    DOM.saveStatus.innerText = '⏳ Session non démarrée';
    DOM.evalResult.style.display = 'none';
    DOM.loadingPanel.style.display = 'none';
    DOM.btnNextTask.style.display = 'none';
    DOM.timer.innerText = '--:--';
    DOM.timer.classList.remove('urgent');

    updateTaskButtons();
    updateScenarioPlaceholder();
}

function updateTaskButtons() {
    for (let i = 1; i <= 3; i++) {
        const dur = $(`dur${i}`);
        const mins = TASK_CONFIG[i].duration / 60;
        dur.innerText = sessionMode === 'complet'
            ? `${mins} min`
            : `${mins} min`;
        $(`progress${i}`).innerText = '';
    }
}

// ==================== SESSION LIFECYCLE ====================
function startSession() {
    if (!getApiKey()) {
        openSettings();
        showToast('Veuillez d\'abord configurer votre clé API');
        return;
    }

    sessionStarted = true;
    DOM.startOverlay.style.display = 'none';
    DOM.userInput.disabled = false;
    DOM.submitBtn.disabled = false;
    DOM.btnGenerate.disabled = false;
    if (DOM.btnRealScenario) DOM.btnRealScenario.disabled = false;
    if ($('btnCustomScenario')) $('btnCustomScenario').disabled = false;
    if ($('btnCustomScenario')) $('btnCustomScenario').disabled = false;
    DOM.saveStatus.innerText = '✅ Session active';

    if (sessionMode === 'complet') {
        timerSeconds = 3600;
    } else {
        timerSeconds = TASK_CONFIG[currentTask].duration;
    }

    selectTask(currentTask);
}

function resetSessionState() {
    sessionStarted = false;
    clearInterval(timerInterval);
    timerInterval = null;
    examResponses[1] = '';
    examResponses[2] = '';
    examResponses[3] = '';
    examScenarios[1] = '';
    examScenarios[2] = '';
    examScenarios[3] = '';
    DOM.userInput.value = '';
    DOM.timer.classList.remove('urgent');
}

function resetSession() {
    resetSessionState();
    currentTask = 1;
    changeSessionMode(sessionMode);
}

// ==================== TIMER ====================
function startTimer() {
    clearInterval(timerInterval);
    updateTimerDisplay(timerSeconds);

    timerInterval = setInterval(() => {
        if (timerSeconds > 0) {
            timerSeconds--;
            updateTimerDisplay(timerSeconds);
            if (timerSeconds <= 60) DOM.timer.classList.add('urgent');
        } else {
            clearInterval(timerInterval);
            timerInterval = null;
            finishSessionDueToTime();
        }
    }, 1000);
}

function ensureTimerIsRunning() {
    if (!sessionStarted || timerInterval) return;
    startTimer();
}

function updateTimerDisplay(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    DOM.timer.innerText = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function finishSessionDueToTime() {
    DOM.userInput.disabled = true;
    DOM.saveStatus.innerText = '⏱️ Temps écoulé !';
    showToast('Temps écoulé ! Évaluation automatique...');
    submitForEvaluation();
}

// ==================== TASK SELECTION ====================
function selectTask(taskNum) {
    // Save current progress
    if (sessionStarted && sessionMode === 'complet') {
        examResponses[currentTask] = DOM.userInput.value;
        if (currentScenario) examScenarios[currentTask] = currentScenario;
    }

    currentTask = taskNum;
    const cfg = TASK_CONFIG[taskNum];

    // Update buttons
    document.querySelectorAll('.task-btn').forEach(b => b.classList.remove('active'));
    $(`task${taskNum}-btn`).classList.add('active');

    // Update info bar
    DOM.taskIndicator.innerText = cfg.fullTitle;
    DOM.wordLimit.innerText = cfg.wordMax;
    DOM.wordRange.innerText = `min: ${cfg.wordMin} • max: ${cfg.wordMax}`;
    DOM.scenarioBadge.innerText = `CONSIGNE — TÂCHE ${taskNum}`;

    // Restore or clear content
    if (sessionMode === 'complet' && sessionStarted) {
        DOM.userInput.value = examResponses[taskNum] || '';
        if (examScenarios[taskNum]) {
            currentScenario = examScenarios[taskNum];
            DOM.scenario.innerHTML = formatScenarioHTML(currentScenario, taskNum);
        } else {
            currentScenario = '';
            DOM.scenario.innerHTML = `<p class="scenario-placeholder">Veuillez choisir un sujet pour commencer la rédaction (Sujets réels, IA ou personnalisé).</p>`;
        }
    } else if (sessionMode === 'training' && sessionStarted) {
        DOM.userInput.value = '';
        timerSeconds = cfg.duration;
        clearInterval(timerInterval);
        timerInterval = null;
        updateTimerDisplay(timerSeconds);
        currentScenario = '';
        DOM.scenario.innerHTML = `<p class="scenario-placeholder">Veuillez choisir un sujet pour commencer la rédaction (le chrono démarrera alors).</p>`;
    }

    // Update overlay desc for training
    if (!sessionStarted && sessionMode === 'training') {
        $('overlay-desc').innerText = `Vous allez pratiquer la ${cfg.fullTitle} avec un chronomètre de ${cfg.duration / 60} minutes.`;
    }

    // Next task button & Submit button label
    if (sessionMode === 'complet') {
        DOM.submitBtn.innerText = 'Terminer l\'examen';
        if (sessionStarted && taskNum < 3) {
            DOM.btnNextTask.style.display = 'inline-flex';
            DOM.btnNextTask.innerText = `Tâche ${taskNum + 1} →`;
        } else {
            DOM.btnNextTask.style.display = 'none';
        }
    } else {
        DOM.submitBtn.innerText = 'Soumettre pour Évaluation';
        DOM.btnNextTask.style.display = 'none';
    }

    if (!sessionStarted) {
        DOM.startOverlay.style.display = 'flex';
        DOM.submitBtn.disabled = true;
        DOM.userInput.disabled = true;
        DOM.btnGenerate.disabled = true;
        if (DOM.btnRealScenario) DOM.btnRealScenario.disabled = true;
        updateTimerDisplay(sessionMode === 'complet' ? 3600 : cfg.duration);
    } else {
        DOM.submitBtn.disabled = false;
        DOM.userInput.disabled = false;
        DOM.btnGenerate.disabled = false;
        if (DOM.btnRealScenario) DOM.btnRealScenario.disabled = false;
    }

    DOM.evalResult.style.display = 'none';
    DOM.loadingPanel.style.display = 'none';
    updateWordCount();
}

function goToNextTask() {
    if (currentTask < 3) {
        selectTask(currentTask + 1);
    }
}

// ==================== WORD COUNT ====================
function updateWordCount() {
    const text = DOM.userInput.value.trim();
    const count = text ? text.split(/\s+/).length : 0;
    const cfg = TASK_CONFIG[currentTask];

    DOM.wordCount.innerText = count;

    if (count > cfg.wordMax) {
        DOM.wordCount.classList.add('over-limit');
        DOM.writingStatus.innerText = `⚠️ Dépassement (+${count - cfg.wordMax})`;
        DOM.writingStatus.style.color = 'var(--danger)';
    } else if (count < cfg.wordMin && count > 0) {
        DOM.wordCount.classList.remove('over-limit');
        DOM.writingStatus.innerText = `${cfg.wordMin - count} mots restants (min)`;
        DOM.writingStatus.style.color = 'var(--warning)';
    } else if (count >= cfg.wordMin) {
        DOM.wordCount.classList.remove('over-limit');
        DOM.writingStatus.innerText = '✓ Dans la plage cible';
        DOM.writingStatus.style.color = 'var(--success)';
    } else {
        DOM.wordCount.classList.remove('over-limit');
        DOM.writingStatus.innerText = '—';
        DOM.writingStatus.style.color = 'var(--text-muted)';
    }

    // Update progress indicators in sidebar
    if (sessionStarted) {
        const prog = $(`progress${currentTask}`);
        if (count > 0) {
            prog.innerText = `${count} mots rédigés`;
        } else {
            prog.innerText = '';
        }
    }
}

DOM.userInput.addEventListener('input', updateWordCount);

// ==================== SCENARIO GENERATION ====================
function updateScenarioPlaceholder() {
    DOM.scenario.innerHTML = '<p class="scenario-placeholder">Appuyez sur « Commencer la session » pour générer un sujet d\'examen.</p>';
}

async function generateScenario() {
    if (!sessionStarted || isEvaluating) return;

    if (!getApiKey()) {
        openSettings();
        return;
    }

    const cfg = TASK_CONFIG[currentTask];
    DOM.scenario.innerHTML = '<p class="scenario-placeholder">⏳ Génération du sujet en cours...</p>';

    const systemPrompt = buildGenerationPrompt(currentTask);

    try {
        const response = await callAI(systemPrompt, `Génère une consigne pour la Tâche ${currentTask} d'Expression Écrite TCF Canada. Commence directement par la consigne sans introduction.`);

        if (response) {
            currentScenario = response;
            examScenarios[currentTask] = response;
            DOM.scenario.innerHTML = formatScenarioHTML(response, currentTask);
            ensureTimerIsRunning();
        } else {
            DOM.scenario.innerHTML = '<p class="scenario-placeholder" style="color: var(--danger);">Erreur lors de la génération. Vérifiez votre clé API.</p>';
        }
    } catch (err) {
        console.error('Generation error:', err);
        DOM.scenario.innerHTML = `<p class="scenario-placeholder" style="color: var(--danger);">Erreur: ${err.message}</p>`;
    }
}

function customScenario() {
    if (!sessionStarted || isEvaluating) return;
    
    const userSubject = prompt("Veuillez coller la consigne de votre choix :");
    if (userSubject && userSubject.trim() !== '') {
        currentScenario = userSubject.trim();
        examScenarios[currentTask] = currentScenario;
        DOM.scenario.innerHTML = formatScenarioHTML(currentScenario, currentTask);
        ensureTimerIsRunning();
    }
}

function getCurrentMonthFR() {
    const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    return months[new Date().getMonth()];
}

function pickRealSubject() {
    if (!sessionStarted || isEvaluating) return;

    if (SUBJECTS_DB[currentTask].length === 0) initializeSubjectsDB();

    const allSubjects = SUBJECTS_DB[currentTask];
    if (!allSubjects || allSubjects.length === 0) {
        showToast("Aucun sujet réel disponible.");
        return;
    }

    const currentMonth = getCurrentMonthFR();
    
    // Tentative de priorité aux sujets du mois actuel
    const prioritySubjects = allSubjects.filter(s => {
        const text = typeof s === 'string' ? s : (s.doc1 + ' ' + s.doc2);
        return text.toLowerCase().includes(currentMonth);
    });

    let pool = allSubjects;
    // Si on trouve des sujets du mois en cours, on leur donne 80% de chance d'être choisis
    if (prioritySubjects.length > 0 && Math.random() < 0.8) {
        pool = prioritySubjects;
    }

    const randomIndex = Math.floor(Math.random() * pool.length);
    let subject = pool[randomIndex];

    // For Task 3, it's an object with doc1 and doc2
    if (currentTask === 3 && typeof subject === 'object') {
        const formatted = `### Document 1 :\n${subject.doc1}\n\n### Document 2 :\n${subject.doc2}`;
        currentScenario = formatted;
    } else {
        currentScenario = subject;
    }

    examScenarios[currentTask] = currentScenario;
    DOM.scenario.innerHTML = formatScenarioHTML(currentScenario, currentTask);
    
    ensureTimerIsRunning();

    const isPriority = prioritySubjects.includes(subject);
    showToast(isPriority ? `Sujet de ${currentMonth} sélectionné (Prioritaire) ✓` : "Sujet réel sélectionné ✓");
}

function buildGenerationPrompt(taskNum) {
    const prompts = {
        1: `Tu es un concepteur de sujets TCF Canada expert. Génère une consigne réaliste et originale pour la Tâche 1 d'Expression Écrite.

Le candidat doit rédiger un message personnel (courriel ou lettre) avec :
- Un destinataire précis (ami, collègue, famille, etc.) et une relation clairement définie
- Un objectif de communication spécifique (inviter, remercier, s'excuser, demander, proposer, etc.)
- Un contexte réaliste et détaillé

Structure attendue dans la réponse du candidat :
- En-tête : De (expéditeur), À (destinataire), Objet
- Salutations appropriées à la relation
- Objectif général du message
- Détails : Qui? Quoi? Quand? Où? Avec qui?
- Attentes et souhaits
- Formule de conclusion

Contrainte : entre 60 et 120 mots.
Commence DIRECTEMENT par la consigne. Varie les thèmes (vie quotidienne, travail, loisirs, événements).`,

        2: `Tu es un concepteur de sujets TCF Canada expert. Génère une consigne réaliste et originale pour la Tâche 2 d'Expression Écrite.

Le candidat doit rédiger un article ou récit argumenté pour plusieurs destinataires (blog, journal, lettre ouverte, rapport) en racontant une expérience avec une opinion intégrée.

Structure attendue dans la réponse du candidat :
- Titre accrocheur
- Introduction engageante avec contexte
- Expérience personnelle : anecdotes, défis, moments positifs
- Recommandations en lien avec l'objectif

Précise l'objectif communicatif : convaincre, séduire, attirer, réconcilier, etc.
Contrainte : entre 120 et 150 mots.
Commence DIRECTEMENT par la consigne. Varie les thèmes (voyage, travail, bénévolat, culture, sport, technologie).`,

        3: `Tu es un concepteur de sujets TCF Canada expert. Génère une consigne réaliste et originale pour la Tâche 3 d'Expression Écrite.

Tu dois :
1. Créer DEUX courts documents (~90 mots chacun) présentant des points de vue OPPOSÉS sur un sujet de société contemporain
2. Formuler la consigne demandant au candidat de :
   - Partie 1 (40-60 mots) : Résumer de manière neutre les deux points de vue
   - Partie 2 (80-120 mots) : Exprimer sa propre opinion argumentée

Structure attendue :
- Titre percutant
- Point de vue des deux documents (résumé neutre)
- Votre point de vue (opinion argumentée avec raisonnement logique)

Contrainte : entre 120 et 180 mots au total.
Commence DIRECTEMENT par la consigne avec les deux documents. Varie les thèmes (éducation, environnement, technologie, travail, santé, urbanisme).`
    };

    return prompts[taskNum];
}

function formatScenarioHTML(text, taskNum) {
    // Basic markdown-like formatting
    let html = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
        .replace(/^#### (.*?)$/gm, '<h4>$1</h4>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');

    // Wrap in paragraphs if not starting with a header
    if (!html.startsWith('<h')) {
        html = `<p>${html}</p>`;
    }

    return html;
}

// ==================== EVALUATION ====================
async function submitForEvaluation() {
    if (isEvaluating) return;

    // Save current response first
    if (sessionStarted) {
        examResponses[currentTask] = DOM.userInput.value;
        if (currentScenario) examScenarios[currentTask] = currentScenario;
    }

    const currentText = DOM.userInput.value.trim();
    
    // Check if there is something to evaluate
    let hasContent = false;
    if (sessionMode === 'complet') {
        hasContent = examResponses[1].trim() || examResponses[2].trim() || examResponses[3].trim();
        if (!hasContent) {
            showToast('Veuillez rédiger au moins une tâche avant de terminer l\'examen.');
            return;
        }
        if (!confirm('Voulez-vous terminer l\'examen et voir vos résultats ?')) return;
    } else {
        if (!currentText) {
            showToast('Veuillez saisir un texte avant de soumettre.');
            return;
        }
        hasContent = true;
    }

    if (!getApiKey()) {
        openSettings();
        return;
    }

    isEvaluating = true;

    // UI updates
    clearInterval(timerInterval);
    DOM.submitBtn.disabled = true;
    DOM.userInput.disabled = true;
    DOM.loadingPanel.style.display = 'block';
    DOM.evalResult.style.display = 'none';
    DOM.saveStatus.innerText = '🔍 Évaluation en cours...';

    DOM.loadingPanel.scrollIntoView({ behavior: 'smooth' });

    let systemPrompt, userMessage;

    if (sessionMode === 'complet') {
        systemPrompt = buildFullEvaluationSystemPrompt();
        userMessage = buildFullEvaluationUserMessage();
    } else {
        // Mode ENTRAINEMENT: évaluer uniquement la tâche en cours
        const wordCount = currentText.split(/\s+/).length;
        systemPrompt = buildEvaluationSystemPrompt();
        userMessage = buildEvaluationUserMessage(currentText, wordCount);
    }

    try {
        const response = await callAI(systemPrompt, userMessage);

        if (response) {
            displayEvaluation(response);
            DOM.saveStatus.innerText = '🏁 Évaluation terminée';
        } else {
            DOM.loadingPanel.style.display = 'none';
            showToast('Erreur lors de l\'évaluation. Vérifiez votre clé API.');
            DOM.saveStatus.innerText = '❌ Erreur d\'évaluation';
        }
    } catch (err) {
        console.error('Evaluation error:', err);
        DOM.loadingPanel.style.display = 'none';
        showToast(`Erreur: ${err.message}`);
        DOM.saveStatus.innerText = '❌ Erreur d\'évaluation';
    } finally {
        isEvaluating = false;
        // Fin automatique de la session après l'évaluation
        sessionStarted = false;
        DOM.submitBtn.disabled = true;
        DOM.userInput.disabled = true;
        DOM.saveStatus.innerText = '🏁 Session terminée';
        
        // Arrêter le timer si nécessaire
        clearInterval(timerInterval);
    }
}

function buildEvaluationSystemPrompt() {
    return `Tu es un examinateur expert du TCF Canada spécialisé dans l'évaluation de l'expression écrite. Tu évalues les productions écrites selon trois dimensions critériées rigoureuses.

## DIMENSIONS D'ÉVALUATION

1. **Critères linguistiques** :
   - Étendue du lexique et précision du vocabulaire
   - Correction grammaticale
   - Orthographe
   - Degré d'élaboration des phrases

2. **Critères pragmatiques** :
   - Cohérence et cohésion (connecteurs logiques, progression)
   - Développement thématique
   - Complétude de la réponse par rapport à la consigne

3. **Critères sociolinguistiques** :
   - Adéquation du registre à la situation de communication
   - Choix de mots reflétant la relation avec le destinataire
   - Pertinence culturelle et contextuelle

## BARÈME CECRL/NCLC
- 16-20 = C1 / C2 (NCLC 10 et plus)
- 14-15 = C1 (NCLC 9)
- 12-13 = B2 (NCLC 8)
- 10-11 = B2 (NCLC 7)
- 7-8-9 = B1 (NCLC 6)
- 6 = B1 (NCLC 5)
- 4-5 = A2 (NCLC 4)
- Moins de 4 = A1 (NCLC 3 ou inférieur)

## RÈGLES STRICTES
- Ne JAMAIS fournir de réponse modèle idéale
- TOUJOURS évaluer la réponse telle que soumise
- Maintenir l'objectivité et la rigueur
- Baser tout feedback sur les standards TCF Canada

## FORMAT DE RÉPONSE OBLIGATOIRE (respecter EXACTEMENT ces sections avec ces titres) :

[SCORE]
Score : XX/20 — CECRL : [A1-C2] — NCLC : [4-12]

[ERREURS]
Liste détaillée des erreurs par catégorie (grammaire, vocabulaire, orthographe, syntaxe) avec explications

[STRUCTURE]
Évaluation des éléments structurels requis et leur développement

[LINGUISTIQUE]
Analyse du vocabulaire, grammaire, orthographe et élaboration des phrases

[PRAGMATIQUE]
Analyse de la cohérence, cohésion, développement thématique et complétude

[SOCIOLINGUISTIQUE]
Analyse du registre, ton et adéquation contextuelle

[SPECIFIQUE]
Forces et faiblesses spécifiques à cette tâche

[COMMENTAIRES]
Évaluation globale et priorités d'amélioration`;
}

function buildEvaluationUserMessage(text, wordCount) {
    const cfg = TASK_CONFIG[currentTask];

    const structureExpected = {
        1: 'En-tête (De, À, Objet), Salutations, Objectif général, Détails (Qui? Quoi? Quand? Où?), Attentes et souhaits, Formule de conclusion',
        2: 'Titre accrocheur, Introduction engageante, Expérience personnelle, Recommandations',
        3: 'Titre, Résumé neutre des deux points de vue (Partie 1: 40-60 mots), Opinion argumentée personnelle (Partie 2: 80-120 mots)'
    };

    return `## TÂCHE ${currentTask} : ${cfg.title}

**Consigne donnée au candidat :**
${currentScenario || '(Consigne non disponible)'}

**Nombre de mots attendus :** ${cfg.wordMin}-${cfg.wordMax} mots
**Nombre de mots rédigés :** ${wordCount} mots
${wordCount < cfg.wordMin ? `⚠️ ATTENTION : Le texte est EN DESSOUS du minimum requis (${cfg.wordMin} mots)` : ''}
${wordCount > cfg.wordMax ? `⚠️ ATTENTION : Le texte DÉPASSE le maximum autorisé (${cfg.wordMax} mots)` : ''}

**Structure attendue :** ${structureExpected[currentTask]}

---

**RÉPONSE DU CANDIDAT :**

${text}

---

Évalue cette réponse rigoureusement en respectant le format de réponse obligatoire défini dans tes instructions.`;
}

function buildFullEvaluationSystemPrompt() {
    return `Tu es un examinateur expert du TCF Canada. Tu évalues une session d'EXAMEN COMPLET (3 tâches réalisées en 60 minutes).
    
Tu dois évaluer les trois productions du candidat et fournir un rapport global unique.

## BARÈME CECRL/NCLC
- 16-20 = C1 / C2 (NCLC 10 et plus)
- 14-15 = C1 (NCLC 9)
- 12-13 = B2 (NCLC 8)
- 10-11 = B2 (NCLC 7)
- 7-8-9 = B1 (NCLC 6)
- 6 = B1 (NCLC 5)
- 4-5 = A2 (NCLC 4)
- Moins de 4 = A1 (NCLC 3 ou inférieur)

## FORMAT DE RÉPONSE OBLIGATOIRE (respecter EXACTEMENT ces sections avec ces titres) :

[SCORE]
Note Globale : XX/20 — CECRL : [A1-C2] — NCLC : [4-12]

[ERREURS]
Analyse des erreurs pour les 3 tâches. Regroupe-les par tâche.
- Tâche 1 : ...
- Tâche 2 : ...
- Tâche 3 : ...

[STRUCTURE]
Évaluation de la structure pour chaque tâche.
- Tâche 1 : ...
- Tâche 2 : ...
- Tâche 3 : ...

[LINGUISTIQUE]
Analyse linguistique globale (vocabulaire, grammaire, orthographe). Précise si le niveau est constant sur les 3 tâches.

[PRAGMATIQUE]
Analyse de la cohérence et de la complétude pour les 3 tâches.

[SOCIOLINGUISTIQUE]
Analyse de l'adéquation au registre (notamment pour la Tâche 1).

[SPECIFIQUE]
Points forts et points faibles majeurs observés sur l'ensemble de l'examen.

[COMMENTAIRES]
Synthèse finale et conseils prioritaires pour progresser.`;
}

function buildFullEvaluationUserMessage() {
    let msg = `## SESSION D'EXAMEN COMPLET (TCF Canada)\n\n`;

    for (let i = 1; i <= 3; i++) {
        const text = examResponses[i].trim() || '(Aucune réponse fournie)';
        const scenario = examScenarios[i] || '(Sujet non disponible)';
        const count = text === '(Aucune réponse fournie)' ? 0 : text.split(/\s+/).length;
        const cfg = TASK_CONFIG[i];

        msg += `### TÂCHE ${i} : ${cfg.title}\n`;
        msg += `**Sujet :** ${scenario}\n`;
        msg += `**Attendu :** ${cfg.wordMin}-${cfg.wordMax} mots\n`;
        msg += `**Rédigé :** ${count} mots\n`;
        if (count > 0 && (count < cfg.wordMin || count > cfg.wordMax)) {
            msg += `⚠️ Alerte : Hors limite de mots (${count} mots)\n`;
        }
        msg += `\n**CONTENU :**\n${text}\n\n`;
        msg += `---\n\n`;
    }

    msg += `Évalue l'ensemble de cet examen. Propose une note globale basée sur la performance moyenne pondérée (la tâche 3 étant souvent considérée comme plus complexe).`;
    return msg;
}

function displayEvaluation(rawResponse) {
    DOM.loadingPanel.style.display = 'none';
    DOM.evalResult.style.display = 'block';

    // Show save button
    const saveBtn = document.querySelector('.eval-actions .btn-primary');
    if (saveBtn) saveBtn.style.display = 'inline-flex';

    if (sessionMode === 'complet') {
        $('evalTaskLabel').innerText = "Examen Complet (Tâches 1, 2 et 3)";
    } else {
        $('evalTaskLabel').innerText = TASK_CONFIG[currentTask].fullTitle;
    }

    // Parse sections
    const sections = parseEvalSections(rawResponse);

    $('finalScore').innerText = extractScore(sections.score || rawResponse);
    const scoreText = sections.score || rawResponse;
    $('cecrLevel').innerText = extractCECR(scoreText);
    $('nclcLevel').innerText = extractNCLC(scoreText);

    $('evalErrors').innerText = sections.erreurs || 'Aucune erreur identifiée.';
    $('evalStructure').innerText = sections.structure || '—';
    $('evalLing').innerText = sections.linguistique || '—';
    $('evalPrag').innerText = sections.pragmatique || '—';
    $('evalSocio').innerText = sections.sociolinguistique || '—';
    $('evalSpecific').innerText = sections.specifique || '—';
    $('evalComments').innerText = sections.commentaires || '—';

    DOM.evalResult.scrollIntoView({ behavior: 'smooth' });
}

function parseEvalSections(text) {
    const sections = {};
    const sectionMap = {
        'SCORE': 'score',
        'ERREURS': 'erreurs',
        'STRUCTURE': 'structure',
        'LINGUISTIQUE': 'linguistique',
        'PRAGMATIQUE': 'pragmatique',
        'SOCIOLINGUISTIQUE': 'sociolinguistique',
        'SPECIFIQUE': 'specifique',
        'COMMENTAIRES': 'commentaires'
    };

    for (const [tag, key] of Object.entries(sectionMap)) {
        const regex = new RegExp(`\\[${tag}\\]\\s*([\\s\\S]*?)(?=\\[(?:${Object.keys(sectionMap).join('|')})\\]|$)`, 'i');
        const match = text.match(regex);
        if (match) {
            sections[key] = match[1].trim();
        }
    }

    // Fallback: if no sections were parsed, put entire response in comments
    if (Object.keys(sections).length === 0) {
        sections.commentaires = text;
        // Try to extract score from raw text
        const scoreMatch = text.match(/(\d{1,2})\s*\/\s*20/);
        if (scoreMatch) sections.score = scoreMatch[0];
    }

    return sections;
}

function extractScore(text) {
    const match = text.match(/(\d{1,2})\s*\/\s*20/);
    return match ? match[1] : '--';
}

function extractCECR(text) {
    // 1. Try to extract from AI text
    const cecrMatch = text.match(/\b([ABC][12]([-/][ABC][12])?)\b/i);
    if (cecrMatch) return cecrMatch[1].toUpperCase();

    // 2. Fallback based on score if extraction fails
    const score = parseInt(extractScore(text));
    if (isNaN(score)) return '--';

    if (score >= 16) return "C1-C2";
    if (score >= 14) return "C1";
    if (score >= 10) return "B2";
    if (score >= 7) return "B1";
    if (score === 6) return "B1";
    if (score >= 4) return "A2";
    return "A1";
}

function extractNCLC(text) {
    // 1. Try to extract from AI text
    const nclcMatch = text.match(/NCLC\s*[:\s]*(\d{1,2})/i);
    if (nclcMatch) return nclcMatch[1];

    // 2. Fallback based on score if extraction fails
    const score = parseInt(extractScore(text));
    if (isNaN(score)) return '--';

    if (score >= 16) return "10+";
    if (score >= 14) return "9";
    if (score >= 12) return "8";
    if (score >= 10) return "7";
    if (score >= 7) return "6";
    if (score === 6) return "5";
    if (score >= 4) return "4";
    return "3";
}

// ==================== API CALL (Multi-Provider) ====================

/**
 * Call a specific provider's API
 */
async function callProvider(providerKey, systemPrompt, userMessage) {
    const provider = PROVIDERS[providerKey];
    const apiKey = getApiKey(providerKey);
    const model = getModel(providerKey);

    if (!apiKey) {
        throw new Error(`Clé API ${provider.name} non configurée`);
    }

    console.log(`[AI] Appel ${provider.name} — modèle: ${model}`);

    const response = await fetch(provider.endpoint, {
        method: 'POST',
        headers: provider.headers(apiKey),
        body: JSON.stringify({
            model: model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ],
            max_tokens: 1024,
            temperature: 0.7
        })
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData.error?.message || errData.message || response.statusText;
        throw new Error(`[${provider.name}] Erreur ${response.status}: ${errMsg}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
}

/**
 * Main AI call — uses primary provider, falls back to secondary if enabled
 */
async function callAI(systemPrompt, userMessage) {
    const primary = getProvider();
    const secondary = primary === 'github' ? 'nvidia' : 'github';

    try {
        const result = await callProvider(primary, systemPrompt, userMessage);
        if (result) return result;
        throw new Error('Réponse vide du modèle');
    } catch (primaryErr) {
        console.warn(`[AI] ${PROVIDERS[primary].name} a échoué:`, primaryErr.message);

        // Try fallback if enabled and secondary key exists
        if (getAutoFallback() && getApiKey(secondary)) {
            console.log(`[AI] Basculement automatique vers ${PROVIDERS[secondary].name}...`);
            showToast(`⚠️ ${PROVIDERS[primary].name} indisponible — basculement vers ${PROVIDERS[secondary].name}...`);

            try {
                const result = await callProvider(secondary, systemPrompt, userMessage);
                if (result) return result;
                throw new Error('Réponse vide du modèle secondaire');
            } catch (secondaryErr) {
                console.error(`[AI] ${PROVIDERS[secondary].name} a aussi échoué:`, secondaryErr.message);
                throw new Error(`Les deux fournisseurs ont échoué.\n• ${primaryErr.message}\n• ${secondaryErr.message}`);
            }
        }

        throw primaryErr;
    }
}

// ==================== HISTORY ====================
function getHistory() {
    try {
        return JSON.parse(localStorage.getItem('tcf_ecrit_history') || '[]');
    } catch { return []; }
}

function saveToHistory() {
    let text = '';
    let taskTitle = '';
    
    if (sessionMode === 'complet') {
        taskTitle = "Examen Complet (Tâches 1-3)";
        text = `Tâche 1:\n${examResponses[1]}\n\nTâche 2:\n${examResponses[2]}\n\nTâche 3:\n${examResponses[3]}`;
    } else {
        taskTitle = TASK_CONFIG[currentTask].fullTitle;
        text = examResponses[currentTask] || DOM.userInput.value.trim();
    }

    const score = $('finalScore').innerText;
    const cecr = $('cecrLevel').innerText;
    const nclc = $('nclcLevel').innerText;
    const level = `${cecr} • NCLC ${nclc}`;

    if (!text.trim() || score === '--') {
        showToast('Pas de données à sauvegarder.');
        return;
    }

    const entry = {
        id: Date.now(),
        date: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        task: sessionMode === 'complet' ? 0 : currentTask,
        taskTitle: taskTitle,
        mode: sessionMode,
        score: score,
        cecr: cecr,
        nclc: nclc,
        level: level,
        scenario: sessionMode === 'complet' ? "Session d'examen complète" : currentScenario,
        response: text,
        wordCount: text.split(/\s+/).length,
        evaluation: {
            errors: $('evalErrors').innerText,
            structure: $('evalStructure').innerText,
            linguistic: $('evalLing').innerText,
            pragmatic: $('evalPrag').innerText,
            sociolinguistic: $('evalSocio').innerText,
            specific: $('evalSpecific').innerText,
            comments: $('evalComments').innerText
        }
    };

    const history = getHistory();
    history.unshift(entry);
    // Keep max 50 entries
    if (history.length > 50) history.length = 50;
    localStorage.setItem('tcf_ecrit_history', JSON.stringify(history));
    showToast('Session sauvegardée dans l\'historique ✓');
}

function showHistory() {
    DOM.appView.style.display = 'none';
    DOM.historyView.style.display = 'block';
    renderHistory();
}

function closeHistory() {
    DOM.historyView.style.display = 'none';
    DOM.appView.style.display = 'block';
}

function renderHistory() {
    const history = getHistory();
    const list = $('historyList');

    if (history.length === 0) {
        list.innerHTML = '<p class="history-empty">Aucune session enregistrée pour le moment.</p>';
        return;
    }

    list.innerHTML = history.map(entry => `
        <div class="history-item" onclick="viewHistoryEntry(${entry.id})">
            <div class="history-item-info">
                <h4>${entry.taskTitle}</h4>
                <p>${entry.date} • ${entry.wordCount} mots • Mode ${entry.mode === 'complet' ? 'Examen' : 'Entraînement'}</p>
            </div>
            <div style="display:flex; align-items:center; gap:1rem;">
                <div>
                    <span class="history-item-score">${entry.score}/20</span>
                    <div style="font-size:0.7rem; color:var(--text-muted); text-align:center;">${entry.cecr || entry.level}</div>
                </div>
                <div class="history-item-actions">
                    <button class="btn-sm" onclick="event.stopPropagation(); deleteHistoryEntry(${entry.id})">🗑️</button>
                </div>
            </div>
        </div>
    `).join('');
}

function deleteHistoryEntry(id) {
    if (!confirm('Supprimer cette entrée ?')) return;
    let history = getHistory();
    history = history.filter(e => e.id !== id);
    localStorage.setItem('tcf_ecrit_history', JSON.stringify(history));
    renderHistory();
}

function viewHistoryEntry(id) {
    const history = getHistory();
    const entry = history.find(e => e.id === id);
    if (!entry) return;

    // Switch view
    closeHistory();
    
    // Fill evaluation data
    DOM.evalResult.style.display = 'block';
    DOM.loadingPanel.style.display = 'none';
    
    $('evalTaskLabel').innerText = entry.taskTitle;
    $('finalScore').innerText = entry.score;
    
    // Handle split levels
    const cecrBadge = $('cecrLevel');
    const nclcBadge = $('nclcLevel');
    
    if (entry.cecr) {
        cecrBadge.innerText = entry.cecr.replace('CECRL ', '');
        nclcBadge.innerText = entry.nclc ? entry.nclc.replace('NCLC ', '') : '--';
    } else {
        // Fallback for older entries
        cecrBadge.innerText = extractCECR(entry.level);
        nclcBadge.innerText = extractNCLC(entry.level);
    }

    $('evalErrors').innerText = entry.evaluation.errors;
    $('evalStructure').innerText = entry.evaluation.structure;
    $('evalLing').innerText = entry.evaluation.linguistic;
    $('evalPrag').innerText = entry.evaluation.pragmatic;
    $('evalSocio').innerText = entry.evaluation.sociolinguistic;
    $('evalSpecific').innerText = entry.evaluation.specific;
    $('evalComments').innerText = entry.evaluation.comments;

    // Scroll to results
    DOM.evalResult.scrollIntoView({ behavior: 'smooth' });
    
    // Hide "Save" button since it's already in history
    const saveBtn = document.querySelector('.eval-actions .btn-primary');
    if (saveBtn) saveBtn.style.display = 'none';
}

// ==================== TOAST ====================
function showToast(msg) {
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        toast.style.cssText = `
            position: fixed; bottom: 2rem; right: 2rem;
            background: var(--bg-elevated); color: var(--text-main);
            padding: 0.8rem 1.5rem; border-radius: var(--radius-sm);
            border: 1px solid var(--border-accent);
            font-size: 0.85rem; font-weight: 500;
            z-index: 999; opacity: 0;
            transition: opacity 0.3s, transform 0.3s;
            transform: translateY(10px);
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        `;
        document.body.appendChild(toast);
    }

    toast.innerText = msg;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
    }, 3000);
}

// ==================== INIT ====================
window.addEventListener('DOMContentLoaded', () => {
    // Migrate old OpenRouter key if it exists
    const oldKey = localStorage.getItem('tcf_api_key');
    if (oldKey) {
        // Old key was OpenRouter — remove it, user needs to configure new providers
        localStorage.removeItem('tcf_api_key');
        localStorage.removeItem('tcf_model');
    }

    changeSessionMode('complet');
    
    // Init Subjects database
    initializeSubjectsDB();

    // Show settings if no API key configured for the active provider
    if (!getApiKey()) {
        setTimeout(() => {
            openSettings();
            showToast('Configurez votre clé API GitHub ou Nvidia pour commencer');
        }, 500);
    }
});
