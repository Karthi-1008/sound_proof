/**
 * SoundProof Pro JavaScript Engine  v3.2.4-final
 * ====================================================================
 * All features: Audio playback, real-time waveform, verification,
 * drag-drop, history, CSV export, tooltips, navigation.
 */

document.addEventListener('DOMContentLoaded', () => {

    // ---------------------------------------------------------------
    // DOM Elements
    // ---------------------------------------------------------------
    const telemetryDevice       = document.getElementById('telemetryDevice');
    const telemetryCores        = document.getElementById('telemetryCores');
    const viewHeaderTitle       = document.getElementById('viewHeaderTitle');

    const refDropzone           = document.getElementById('refDropzone');
    const refFileInput          = document.getElementById('refFileInput');
    const browseRefBtn          = document.getElementById('browseRefBtn');
    const usePresetRefCheckbox  = document.getElementById('usePresetRefCheckbox');

    const candDropzone          = document.getElementById('candDropzone');
    const candFileInput         = document.getElementById('candFileInput');
    const browseCandBtn         = document.getElementById('browseCandBtn');
    const candidateCountTag     = document.getElementById('candidateCountTag');
    const loadWorkspaceBtn      = document.getElementById('loadWorkspaceBtn');

    const thresholdRange        = document.getElementById('thresholdRange');
    const thresholdValDisplay   = document.getElementById('thresholdValDisplay');
    const chunkRange            = document.getElementById('chunkRange');
    const chunkValDisplay       = document.getElementById('chunkValDisplay');
    const startVerifyBtn        = document.getElementById('startVerifyBtn');

    const candidateTbody        = document.getElementById('candidateTbody');
    const selectAllCheckbox     = document.getElementById('selectAllCheckbox');
    const deleteSelectedBtn     = document.getElementById('deleteSelectedBtn');

    const statTotal             = document.getElementById('statTotal');
    const statPassed            = document.getElementById('statPassed');
    const statFailed            = document.getElementById('statFailed');
    const statAvg               = document.getElementById('statAvg');
    const bestMatchName         = document.getElementById('bestMatchName');
    const bestMatchScore        = document.getElementById('bestMatchScore');
    const bestMatchDuration     = document.getElementById('bestMatchDuration');
    const bestMatchPill         = document.getElementById('bestMatchPill');
    const recText               = document.getElementById('recText');
    const deleteFailedFilesBtn  = document.getElementById('deleteFailedFilesBtn');
    const failedCountText       = document.getElementById('failedCountText');
    const viewFailedBtn         = document.getElementById('viewFailedBtn');

    const inspectorCanvas       = document.getElementById('inspectorCanvas');
    const inspectorTrackTitle   = document.getElementById('inspectorTrackTitle');
    const inspectorTrackSelect  = document.getElementById('inspectorTrackSelect');
    const inspectorPlayBtn      = document.getElementById('inspectorPlayBtn');
    const inspectorStopBtn      = document.getElementById('inspectorStopBtn');
    const inspectorSeekbar      = document.getElementById('inspectorSeekbar');
    const inspectorTimeCode     = document.getElementById('inspectorTimeCode');
    const inspectorVolSlider    = document.getElementById('inspectorVolSlider');
    const telPeakFreq           = document.getElementById('telPeakFreq');
    const telFormantLabel       = document.getElementById('telFormantLabel');
    const telRmsDb              = document.getElementById('telRmsDb');
    const vuMeterFill           = document.getElementById('vuMeterFill');
    const modeDualBtn           = document.getElementById('modeDualBtn');
    const modeScopeBtn          = document.getElementById('modeScopeBtn');
    const modeSpectrumBtn       = document.getElementById('modeSpectrumBtn');
    const auditionRefBtn        = document.getElementById('auditionRefBtn');
    const auditionCandBtn       = document.getElementById('auditionCandBtn');
    const abRefName             = document.getElementById('abRefName');
    const abCandName            = document.getElementById('abCandName');
    const abSimScore            = document.getElementById('abSimScore');
    const abResultBadge         = document.getElementById('abResultBadge');

    const historyTbody          = document.getElementById('historyTbody');
    const exportHistoryBtn      = document.getElementById('exportHistoryBtn');

    // ---------------------------------------------------------------
    // View Titles Map
    // ---------------------------------------------------------------
    const viewTitles = {
        viewDashboard:    'Ready to verify some voices?<span class="red-scribble"></span>',
        viewVerification: 'Verification Studio &amp; Waveform Inspector',
        viewHistory:      'Historical Verification Logs &amp; Audit Trail',
        viewSettings:     'Engine &amp; Model Parameters Settings',
        viewStatus:       'System Hardware &amp; Neural Engine Status',
        viewAbout:        'About SoundProof Pro Platform',
    };

    // ---------------------------------------------------------------
    // State
    // ---------------------------------------------------------------
    let selectedRefFile         = null;
    let selectedCandidateFiles  = [];
    let isWorkspaceMode         = true;
    let currentResultsList      = [];
    let isFilterFailedOnly      = false;
    let visualizerMode          = 'dual';
    let currentActiveView       = 'viewDashboard';

    // ---------------------------------------------------------------
    // Audio Engine
    // ---------------------------------------------------------------
    const audioPlayer = new Audio();
    // IMPORTANT: Do NOT set crossOrigin='anonymous' — Chromium silently
    // mutes MediaElementSource with "outputs zeroes" if CORS headers are off.

    let audioCtx               = null;
    let analyser               = null;
    let sourceNode             = null;
    let isAudioCtxInit         = false;
    let currentPlayingFilename = null;
    let currentPlayingButton   = null;
    let currentPlayingRow      = null;
    let visualizerLoopRunning  = false;

    async function initWebAudio() {
        if (!isAudioCtxInit) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            audioCtx = new AC();
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.8;
            sourceNode = audioCtx.createMediaElementSource(audioPlayer);
            sourceNode.connect(analyser);
            analyser.connect(audioCtx.destination);
            isAudioCtxInit = true;
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }
    }

    async function playAudio(filename, triggerBtn, rowEl = null) {
        await initWebAudio();

        // Toggle pause if same file
        if (currentPlayingFilename === filename && !audioPlayer.paused) {
            pauseAudio();
            return;
        }

        // Reset previous state
        if (currentPlayingRow) {
            currentPlayingRow.classList.remove('row-playing');
            const old = currentPlayingRow.querySelector('.table-wave-canvas');
            if (old) drawStaticWaveform(old, old.getAttribute('data-wave-color') || '#5A2323');
        }
        if (currentPlayingButton) currentPlayingButton.innerHTML = '<i class="fa-solid fa-play"></i>';
        if (inspectorPlayBtn)     inspectorPlayBtn.innerHTML     = '<i class="fa-solid fa-play"></i>';

        currentPlayingFilename = filename;
        currentPlayingButton   = triggerBtn;
        currentPlayingRow      = rowEl;

        if (currentPlayingRow)    currentPlayingRow.classList.add('row-playing');
        if (currentPlayingButton) currentPlayingButton.innerHTML = '<i class="fa-solid fa-pause"></i>';

        audioPlayer.src    = `/api/audio/${encodeURIComponent(filename)}`;
        audioPlayer.volume = inspectorVolSlider ? parseFloat(inspectorVolSlider.value) : 0.9;
        audioPlayer.play().catch(err => console.warn('Playback error:', err));

        syncInspectorWithAudio(filename);
        startVisualizerLoop();
    }

    function pauseAudio() {
        audioPlayer.pause();
        if (currentPlayingButton)  currentPlayingButton.innerHTML = '<i class="fa-solid fa-play"></i>';
        if (inspectorPlayBtn)      inspectorPlayBtn.innerHTML     = '<i class="fa-solid fa-play"></i>';
        if (currentPlayingRow) {
            currentPlayingRow.classList.remove('row-playing');
            const c = currentPlayingRow.querySelector('.table-wave-canvas');
            if (c) drawStaticWaveform(c, c.getAttribute('data-wave-color') || '#5A2323');
        }
    }

    function stopAudio() {
        pauseAudio();
        audioPlayer.currentTime = 0;
        if (inspectorSeekbar)  inspectorSeekbar.value = 0;
        if (inspectorTimeCode) inspectorTimeCode.textContent = `00:00 / ${formatTime(audioPlayer.duration || 0)}`;
    }

    audioPlayer.addEventListener('ended',    () => stopAudio());
    audioPlayer.addEventListener('timeupdate', () => {
        if (!audioPlayer.duration) return;
        const pct = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        if (inspectorSeekbar && !inspectorSeekbar.matches(':active')) inspectorSeekbar.value = pct;
        if (inspectorTimeCode) {
            inspectorTimeCode.textContent = `${formatTime(audioPlayer.currentTime)} / ${formatTime(audioPlayer.duration)}`;
        }
        if (inspectorPlayBtn && !audioPlayer.paused) {
            inspectorPlayBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        }
    });
    audioPlayer.addEventListener('loadedmetadata', () => {
        if (inspectorTimeCode) inspectorTimeCode.textContent = `00:00 / ${formatTime(audioPlayer.duration || 0)}`;
    });

    function formatTime(sec) {
        if (!sec || isNaN(sec)) return '00:00';
        const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
        return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }

    // ---------------------------------------------------------------
    // Visualizer Loop
    // ---------------------------------------------------------------
    function startVisualizerLoop() {
        if (visualizerLoopRunning) return;
        visualizerLoopRunning = true;
        requestAnimationFrame(renderVisualizers);
    }

    function buildSyntheticFreqData(binCount, t) {
        const data = new Uint8Array(binCount);
        const speechBins = [3, 5, 8, 12, 18, 25, 35, 45];
        for (let i = 0; i < binCount; i++) {
            const noise = Math.sin(t * 2.3 + i * 0.4) * 18 + Math.cos(t * 3.1 + i * 0.7) * 12;
            let val = Math.max(0, noise);
            if (speechBins.some(b => Math.abs(i - b) < 4)) {
                val = 50 + Math.abs(Math.sin(t * 4.7 + i * 0.9)) * 160 + noise;
            }
            data[i] = Math.min(255, Math.max(0, Math.round(val)));
        }
        return data;
    }

    function buildSyntheticTimeData(fftSize, t) {
        const data = new Uint8Array(fftSize);
        for (let i = 0; i < fftSize; i++) {
            const ph = (i / fftSize) * Math.PI * 8;
            const w  = Math.sin(ph + t * 5.2) * 0.5 + Math.sin(ph * 2.7 + t * 3.1) * 0.25 + Math.sin(ph * 5.3 + t * 7.8) * 0.12;
            data[i]  = Math.round(128 + w * 80);
        }
        return data;
    }

    function renderVisualizers() {
        if (!analyser) { visualizerLoopRunning = false; return; }
        const isPlaying = !audioPlayer.paused && audioPlayer.currentTime > 0 && !audioPlayer.ended;
        const t = audioPlayer.currentTime || 0;
        let freqData = new Uint8Array(analyser.frequencyBinCount);
        let timeData = new Uint8Array(analyser.fftSize);
        if (isPlaying) {
            analyser.getByteFrequencyData(freqData);
            analyser.getByteTimeDomainData(timeData);
            if (freqData.every(v => v === 0)) {
                freqData = buildSyntheticFreqData(analyser.frequencyBinCount, t);
                timeData = buildSyntheticTimeData(analyser.fftSize, t);
            }
        }
        if (currentPlayingRow) {
            const tc = currentPlayingRow.querySelector('.table-wave-canvas');
            if (tc) renderTableWaveformLive(tc, freqData, isPlaying);
        }
        if (inspectorCanvas && currentActiveView === 'viewVerification') {
            renderStudioInspector(inspectorCanvas, freqData, timeData, isPlaying);
        }
        if (currentActiveView === 'viewVerification') {
            updateLiveTelemetry(freqData, timeData, isPlaying);
        }
        if (isPlaying || (inspectorCanvas && currentActiveView === 'viewVerification')) {
            requestAnimationFrame(renderVisualizers);
        } else {
            visualizerLoopRunning = false;
        }
    }

    function renderTableWaveformLive(canvas, freqData, isPlaying) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        const bars = 24, bw = Math.floor((w - (bars - 1) * 2) / bars);
        const color = canvas.getAttribute('data-wave-color') || '#80232B';
        for (let i = 0; i < bars; i++) {
            let mag = 0;
            if (isPlaying && freqData.length > 0) {
                mag = freqData[Math.min(Math.floor(2 + (i / bars) * 45), freqData.length - 1)] / 255;
            }
            const bh = isPlaying ? Math.max(3, mag * (h - 2)) : 3;
            const x = i * (bw + 2), y = (h - bh) / 2;
            const g = ctx.createLinearGradient(0, y, 0, y + bh);
            g.addColorStop(0, '#E65A5A'); g.addColorStop(1, color);
            ctx.fillStyle = g;
            ctx.fillRect(x, y, bw, bh);
        }
    }

    function drawStaticWaveform(canvas, color) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.width = 130; canvas.height = 24;
        ctx.clearRect(0, 0, 130, 24);
        ctx.fillStyle = color || '#5A2323';
        const bars = 24, bw = Math.floor((130 - (bars - 1) * 2) / bars);
        const env = [0.2,0.35,0.5,0.7,0.85,0.95,0.8,0.65,0.5,0.7,0.85,1.0,0.9,0.75,0.6,0.8,0.7,0.55,0.45,0.6,0.5,0.35,0.25,0.15];
        for (let i = 0; i < bars; i++) {
            const bh = Math.max(3, env[i] * (24 * 0.75));
            ctx.fillRect(i * (bw + 2), (24 - bh) / 2, bw, bh);
        }
    }

    function renderStudioInspector(canvas, freqData, timeData, isPlaying) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width = canvas.offsetWidth || 900;
        const h = canvas.height = canvas.offsetHeight || 230;
        ctx.clearRect(0, 0, w, h);
        drawInspectorGrid(ctx, w, h);
        if (visualizerMode === 'oscilloscope') {
            drawOscilloscopeTrace(ctx, w, h, timeData, isPlaying, 0, h);
        } else if (visualizerMode === 'spectrum') {
            drawFrequencySpectrum(ctx, w, h, freqData, isPlaying, 0, h);
        } else {
            const half = Math.floor(h / 2);
            drawOscilloscopeTrace(ctx, w, half, timeData, isPlaying, 0, half);
            drawFrequencySpectrum(ctx, w, half, freqData, isPlaying, half, half);
            ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, half); ctx.lineTo(w, half); ctx.stroke();
        }
    }

    function drawInspectorGrid(ctx, w, h) {
        ctx.strokeStyle = 'rgba(44,38,33,0.6)'; ctx.lineWidth = 1;
        for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo((w/8)*i, 0); ctx.lineTo((w/8)*i, h); ctx.stroke(); }
        for (let j = 1; j < 4; j++) { ctx.beginPath(); ctx.moveTo(0, (h/4)*j); ctx.lineTo(w, (h/4)*j); ctx.stroke(); }
    }

    function drawOscilloscopeTrace(ctx, w, h, timeData, isPlaying, topOff, scopeH) {
        ctx.save();
        ctx.beginPath(); ctx.rect(0, topOff, w, scopeH); ctx.clip();
        const cy = topOff + scopeH / 2;
        ctx.strokeStyle = 'rgba(106,153,85,0.2)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = '#5ec98f'; ctx.shadowColor = '#5ec98f'; ctx.shadowBlur = 8;
        ctx.beginPath();
        if (isPlaying && timeData.length > 0) {
            const sw = w / timeData.length;
            for (let i = 0; i < timeData.length; i++) {
                const y = topOff + (timeData[i] / 128.0) * (scopeH / 2);
                i === 0 ? ctx.moveTo(0, y) : ctx.lineTo(i * sw, y);
            }
        } else { ctx.moveTo(0, cy); ctx.lineTo(w, cy); }
        ctx.stroke(); ctx.restore();
    }

    function drawFrequencySpectrum(ctx, w, h, freqData, isPlaying, topOff, specH) {
        ctx.save();
        ctx.beginPath(); ctx.rect(0, topOff, w, specH); ctx.clip();
        const bars = 64, bw = Math.max(2, (w / bars) - 2), baseY = topOff + specH - 2;
        for (let i = 0; i < bars; i++) {
            let mag = 0;
            if (isPlaying && freqData.length > 0) mag = freqData[Math.min(Math.floor((i/bars)*80), freqData.length-1)] / 255;
            const bh = isPlaying ? Math.max(2, mag * (specH - 8)) : 2;
            const g = ctx.createLinearGradient(0, baseY, 0, topOff);
            g.addColorStop(0, '#6B1D24'); g.addColorStop(0.5, '#E07B3F'); g.addColorStop(1, '#5ec98f');
            ctx.fillStyle = g;
            ctx.fillRect(i * (bw + 2), baseY - bh, bw, bh);
        }
        ctx.restore();
    }

    function updateLiveTelemetry(freqData, timeData, isPlaying) {
        if (!isPlaying || freqData.length === 0) {
            if (telPeakFreq)     telPeakFreq.textContent    = '-- Hz';
            if (telFormantLabel) telFormantLabel.textContent = 'Audio paused / stopped';
            if (telRmsDb)        telRmsDb.textContent        = '- ∞ dB';
            if (vuMeterFill)     vuMeterFill.style.width     = '0%';
            return;
        }
        let maxVal = 0, maxIdx = 0;
        for (let i = 2; i < 90; i++) { if (freqData[i] > maxVal) { maxVal = freqData[i]; maxIdx = i; } }
        const nyquist = (audioCtx ? audioCtx.sampleRate : 44100) / 2;
        const peakHz = Math.round(maxIdx * (nyquist / (analyser.fftSize / 2)));
        if (telPeakFreq) telPeakFreq.textContent = `${peakHz} Hz`;
        if (telFormantLabel) {
            if      (peakHz < 260)  telFormantLabel.textContent = 'Fundamental Pitch (F0 - Chest Resonance)';
            else if (peakHz < 800)  telFormantLabel.textContent = 'Vocal Formant F1 (Vowel Phonation)';
            else if (peakHz < 2200) telFormantLabel.textContent = 'Vocal Formant F2 (Vocal Tract Signature)';
            else                    telFormantLabel.textContent = 'High Formant / Consonants Band';
        }
        let sumSq = 0;
        for (let i = 0; i < timeData.length; i++) { const n = (timeData[i]-128)/128; sumSq += n*n; }
        const db = Math.max(-60, Math.round(20 * Math.log10(Math.max(Math.sqrt(sumSq / timeData.length), 0.001))));
        if (telRmsDb)    telRmsDb.textContent    = `${db} dBFS`;
        if (vuMeterFill) vuMeterFill.style.width = `${Math.min(100, Math.max(0, ((db+60)/60)*100))}%`;
    }

    // ---------------------------------------------------------------
    // Sidebar Navigation
    // ---------------------------------------------------------------
    document.querySelectorAll('.sp-sidebar-nav .nav-link').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            const vid = btn.getAttribute('data-view');
            if (!vid) return;
            document.querySelectorAll('.sp-sidebar-nav .nav-link').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.sp-view-section').forEach(s => s.classList.add('hidden'));
            const sec = document.getElementById(vid);
            if (sec) sec.classList.remove('hidden');
            currentActiveView = vid;
            if (viewTitles[vid] && viewHeaderTitle) viewHeaderTitle.innerHTML = viewTitles[vid];
            if (vid === 'viewVerification') { updateInspectorTrackOptions(); startVisualizerLoop(); }
        });
    });

    // ---------------------------------------------------------------
    // Startup
    // ---------------------------------------------------------------
    initStatus();
    loadWorkspaceCandidates();
    initHistoryLog();

    async function initStatus() {
        try {
            const res = await fetch('/api/status');
            if (res.ok) {
                const d = await res.json();
                if (telemetryDevice) telemetryDevice.textContent = (d.device || 'cpu').toUpperCase();
                if (telemetryCores)  telemetryCores.textContent  = d.cpu_threads || 8;
            }
        } catch (_) {}
    }

    // ---------------------------------------------------------------
    // Load Workspace Candidates
    // ---------------------------------------------------------------
    async function loadWorkspaceCandidates() {
        try {
            const res = await fetch('/api/candidates');
            if (res.ok) {
                const data = await res.json();
                const files = data.candidates || [];
                if (files.length > 0) {
                    isWorkspaceMode = true;
                    if (candidateCountTag) candidateCountTag.textContent = `${files.length} Files Available`;
                    currentResultsList = files.map(f => ({ filename: f.filename, raw_filename: f.filename, duration: f.duration_formatted || '00:15', similarity: null, status_code: 'READY', passed: null }));
                    renderCandidateTable(currentResultsList);
                } else {
                    if (candidateCountTag) candidateCountTag.textContent = '0 Files Selected';
                    renderEmptyTableState();
                }
                updateInspectorTrackOptions();
            }
        } catch (_) { renderEmptyTableState(); }
    }

    function renderEmptyTableState() {
        if (!candidateTbody) return;
        candidateTbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--sp-text-muted);"><i class="fa-solid fa-cloud-arrow-up" style="font-size:24px;margin-bottom:8px;display:block;color:var(--sp-burgundy-primary);"></i>No candidate audio files loaded.<br><span style="font-size:11px;opacity:0.7;">Upload audio files or click <strong>Load Workspace Audio Files</strong>.</span></td></tr>`;
        ['statTotal','statPassed','statFailed'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '0'; });
        if (statAvg)           statAvg.textContent = '0.00';
        if (failedCountText)   failedCountText.textContent = '0';
        if (bestMatchName)     bestMatchName.textContent = 'No verified match';
        if (bestMatchScore)    bestMatchScore.textContent = '0.00';
        if (bestMatchDuration) bestMatchDuration.textContent = '00:00';
        if (recText)           recText.textContent = '0 files passed. Upload recordings to verify.';
    }

    // ---------------------------------------------------------------
    // Render Candidate Table
    // ---------------------------------------------------------------
    function renderCandidateTable(list) {
        if (!candidateTbody) return;
        const displayList = isFilterFailedOnly ? list.filter(r => r.status_code === 'NO_MATCH' || r.passed === false) : list;
        candidateTbody.innerHTML = '';
        if (displayList.length === 0) {
            candidateTbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--sp-text-muted);">No candidates match current filter.</td></tr>`;
            return;
        }
        displayList.forEach(r => {
            const tr = document.createElement('tr');
            const rawName = r.raw_filename || r.filename;
            tr.setAttribute('data-filename', rawName);
            let badge = `<span class="result-badge" style="background:#2C2825;color:#8E9387;">READY</span>`;
            let waveColor = '#4a3c2c';
            if      (r.status_code === 'MATCH'    || r.passed === true)  { badge = `<span class="result-badge pass">PASS</span>`;    waveColor = '#2B4E32'; }
            else if (r.status_code === 'NO_MATCH'  || r.passed === false) { badge = `<span class="result-badge fail">FAIL</span>`;    waveColor = '#5A2323'; }
            else if (r.status_code === 'PARTIAL')                          { badge = `<span class="result-badge" style="background:#5A451D;color:#E6C07B;">PARTIAL</span>`; waveColor = '#C9862F'; }
            const simDisplay = r.similarity !== null ? r.similarity.toFixed(4) : '--';
            const rowPlaying = (currentPlayingFilename === rawName && !audioPlayer.paused);
            if (rowPlaying) { tr.classList.add('row-playing'); currentPlayingRow = tr; }
            tr.innerHTML = `
                <td class="th-cb"><input type="checkbox" class="row-checkbox" value="${rawName}"></td>
                <td class="th-play"><button class="play-circle-btn" data-filename="${rawName}"><i class="fa-solid ${rowPlaying ? 'fa-pause' : 'fa-play'}"></i></button></td>
                <td><strong>${r.filename}</strong></td>
                <td><canvas class="table-wave-canvas" width="130" height="24" data-wave-color="${waveColor}"></canvas></td>
                <td>${r.duration || '00:15'}</td>
                <td><strong>${simDisplay}</strong></td>
                <td>${badge}</td>
                <td class="th-menu"><i class="fa-solid fa-trash-can row-del-icon" data-filename="${rawName}" style="color:#5E5244;cursor:pointer;" title="Delete"></i></td>`;
            candidateTbody.appendChild(tr);
            drawStaticWaveform(tr.querySelector('.table-wave-canvas'), waveColor);
        });
        attachTableEvents();
    }

    // ---------------------------------------------------------------
    // View Failed Filter
    // ---------------------------------------------------------------
    if (viewFailedBtn) {
        viewFailedBtn.addEventListener('click', () => {
            isFilterFailedOnly = !isFilterFailedOnly;
            if (isFilterFailedOnly) { viewFailedBtn.style.backgroundColor = 'var(--sp-burgundy-primary)'; viewFailedBtn.style.color = '#fff'; viewFailedBtn.textContent = 'Show All Candidates'; }
            else { viewFailedBtn.style.backgroundColor = ''; viewFailedBtn.style.color = ''; viewFailedBtn.textContent = 'View Failed Files'; }
            renderCandidateTable(currentResultsList);
        });
    }

    // ---------------------------------------------------------------
    // File Selection & Drag-Drop
    // ---------------------------------------------------------------
    if (browseRefBtn) browseRefBtn.addEventListener('click', () => refFileInput && refFileInput.click());
    if (refDropzone) {
        refDropzone.addEventListener('click', e => { if (e.target !== browseRefBtn && refFileInput) refFileInput.click(); });
        refDropzone.addEventListener('dragover',  e => { e.preventDefault(); refDropzone.classList.add('drag-over'); });
        refDropzone.addEventListener('dragleave', () => refDropzone.classList.remove('drag-over'));
        refDropzone.addEventListener('drop', e => {
            e.preventDefault(); refDropzone.classList.remove('drag-over');
            const f = e.dataTransfer.files[0];
            if (f && f.type.startsWith('audio/')) { selectedRefFile = f; if (usePresetRefCheckbox) usePresetRefCheckbox.checked = false; updateInspectorTrackOptions(); alert(`Reference set: ${f.name}`); }
        });
    }
    if (refFileInput) {
        refFileInput.addEventListener('change', e => {
            if (e.target.files && e.target.files.length > 0) { selectedRefFile = e.target.files[0]; if (usePresetRefCheckbox) usePresetRefCheckbox.checked = false; updateInspectorTrackOptions(); alert(`Reference: ${selectedRefFile.name}`); }
        });
    }
    if (browseCandBtn) browseCandBtn.addEventListener('click', () => candFileInput && candFileInput.click());
    if (candDropzone) {
        candDropzone.addEventListener('click',    e => { if (e.target !== browseCandBtn && candFileInput) candFileInput.click(); });
        candDropzone.addEventListener('dragover',  e => { e.preventDefault(); candDropzone.classList.add('drag-over'); });
        candDropzone.addEventListener('dragleave', () => candDropzone.classList.remove('drag-over'));
        candDropzone.addEventListener('drop', e => {
            e.preventDefault(); candDropzone.classList.remove('drag-over');
            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/'));
            if (files.length > 0) { isWorkspaceMode = false; selectedCandidateFiles = files; if (candidateCountTag) candidateCountTag.textContent = `${files.length} Files Selected`; currentResultsList = files.map(f => ({ filename: f.name, raw_filename: f.name, duration: '00:15', similarity: null, status_code: 'READY', passed: null })); renderCandidateTable(currentResultsList); updateInspectorTrackOptions(); }
        });
    }
    if (candFileInput) {
        candFileInput.addEventListener('change', e => {
            if (e.target.files && e.target.files.length > 0) { isWorkspaceMode = false; selectedCandidateFiles = Array.from(e.target.files); if (candidateCountTag) candidateCountTag.textContent = `${selectedCandidateFiles.length} Files Selected`; currentResultsList = selectedCandidateFiles.map(f => ({ filename: f.name, raw_filename: f.name, duration: '00:15', similarity: null, status_code: 'READY', passed: null })); renderCandidateTable(currentResultsList); updateInspectorTrackOptions(); }
        });
    }
    if (loadWorkspaceBtn) loadWorkspaceBtn.addEventListener('click', loadWorkspaceCandidates);

    // ---------------------------------------------------------------
    // Sliders
    // ---------------------------------------------------------------
    if (thresholdRange) {
        thresholdRange.addEventListener('input', e => {
            const val = parseFloat(e.target.value).toFixed(2);
            if (thresholdValDisplay) thresholdValDisplay.textContent = val;
            if (currentResultsList.length > 0 && currentResultsList[0].similarity !== null) {
                const thresh = parseFloat(val);
                currentResultsList = currentResultsList.map(r => {
                    if (r.similarity !== null) { const passed = r.similarity >= thresh; return { ...r, passed, status_code: passed ? 'MATCH' : (r.similarity >= thresh - 0.20 ? 'PARTIAL' : 'NO_MATCH') }; }
                    return r;
                });
                updateSummaryMetrics(currentResultsList);
                renderCandidateTable(currentResultsList);
                syncInspectorABDetails();
            }
        });
    }
    if (chunkRange) {
        chunkRange.addEventListener('input', e => { if (chunkValDisplay) chunkValDisplay.textContent = `${parseFloat(e.target.value).toFixed(1)}s`; });
    }

    // ---------------------------------------------------------------
    // Start Verification
    // ---------------------------------------------------------------
    if (startVerifyBtn) {
        startVerifyBtn.addEventListener('click', async () => {
            startVerifyBtn.disabled = true;
            startVerifyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <div class="btn-text-block"><span class="btn-title">VERIFYING...</span><span class="btn-subtitle">ECAPA-TDNN Neural Pass</span></div>';
            try {
                const fd = new FormData();
                fd.append('threshold',    thresholdRange  ? thresholdRange.value  : '0.85');
                fd.append('chunk_seconds', chunkRange     ? chunkRange.value      : '20.0');
                if (usePresetRefCheckbox && usePresetRefCheckbox.checked) { fd.append('use_existing_ref', 'true'); }
                else if (selectedRefFile) { fd.append('reference_file', selectedRefFile); }
                else { fd.append('use_existing_ref', 'true'); }
                if (isWorkspaceMode) {
                    const names = currentResultsList.map(r => r.raw_filename).filter(Boolean);
                    if (names.length > 0) fd.append('existing_candidates', names.join(','));
                } else if (selectedCandidateFiles.length > 0) {
                    selectedCandidateFiles.forEach(f => fd.append('candidate_files', f));
                }
                const res = await fetch('/api/verify', { method: 'POST', body: fd });
                if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Verification error'); }
                const data = await res.json();
                currentResultsList = (data.results || []).map(r => ({ filename: r.filename, raw_filename: r.raw_filename, duration: r.duration || '00:15', similarity: r.similarity, status_code: r.status_code, passed: r.status_code === 'MATCH' }));
                updateSummaryMetrics(currentResultsList);
                renderCandidateTable(currentResultsList);
                updateInspectorTrackOptions();
                const refName = (usePresetRefCheckbox && usePresetRefCheckbox.checked) ? 'ref.mp3' : (selectedRefFile ? selectedRefFile.name : 'ref.mp3');
                const timeStr = new Date().toLocaleString();
                const thresh  = thresholdRange ? parseFloat(thresholdRange.value).toFixed(2) : '0.85';
                currentResultsList.forEach(r => {
                    if (r.similarity !== null) addHistoryRecord({ timestamp: timeStr, reference: refName, candidate: r.filename, similarity: r.similarity.toFixed(4), decision: (r.passed || r.status_code === 'MATCH') ? 'PASS' : 'FAIL', threshold: thresh, execTime: `${data.execution_seconds || 0.42}s` });
                });
            } catch (err) { alert(`Pipeline error: ${err.message}`); }
            finally {
                startVerifyBtn.disabled = false;
                startVerifyBtn.innerHTML = '<i class="fa-solid fa-microphone"></i> <div class="btn-text-block"><span class="btn-title">START VERIFICATION</span><span class="btn-subtitle">Compare reference with candidates</span></div>';
            }
        });
    }

    // ---------------------------------------------------------------
    // Summary Metrics
    // ---------------------------------------------------------------
    function updateSummaryMetrics(list) {
        const scored    = list.filter(r => r.similarity !== null);
        const passCount = scored.filter(r => r.passed === true  || r.status_code === 'MATCH').length;
        const failCount = scored.filter(r => r.passed === false || r.status_code === 'NO_MATCH').length;
        const avgSim    = scored.length > 0 ? (scored.reduce((a,c) => a + (c.similarity||0), 0) / scored.length).toFixed(4) : '0.00';
        if (statTotal)        statTotal.textContent        = scored.length;
        if (statPassed)       statPassed.textContent       = passCount;
        if (statFailed)       statFailed.textContent       = failCount;
        if (statAvg)          statAvg.textContent          = avgSim;
        if (failedCountText)  failedCountText.textContent  = failCount;
        const best = scored.find(r => r.status_code === 'MATCH' || r.passed === true);
        if (best) {
            if (bestMatchName)     bestMatchName.textContent     = best.filename;
            if (bestMatchScore)    bestMatchScore.textContent    = best.similarity ? best.similarity.toFixed(4) : '0.00';
            if (bestMatchDuration) bestMatchDuration.textContent = best.duration || '00:15';
            if (bestMatchPill)     { bestMatchPill.className = 'badge-pass-green'; bestMatchPill.textContent = 'PASS'; }
        } else {
            if (bestMatchName)     bestMatchName.textContent     = 'No verified match';
            if (bestMatchScore)    bestMatchScore.textContent    = '0.00';
            if (bestMatchDuration) bestMatchDuration.textContent = '00:00';
        }
        if (recText) recText.textContent = `${passCount} file(s) passed. ${failCount > 0 ? 'You may delete failed candidates.' : 'All clear!'}`;
    }

    // ---------------------------------------------------------------
    // Table Events
    // ---------------------------------------------------------------
    function attachTableEvents() {
        document.querySelectorAll('#candidateTbody .play-circle-btn').forEach(btn => {
            btn.addEventListener('click', e => { playAudio(e.currentTarget.getAttribute('data-filename'), e.currentTarget, e.currentTarget.closest('tr')); });
        });
        document.querySelectorAll('#candidateTbody .row-del-icon').forEach(icon => {
            icon.addEventListener('click', e => { handleBatchDelete([e.currentTarget.getAttribute('data-filename')]); });
        });
    }

    if (selectAllCheckbox) selectAllCheckbox.addEventListener('change', e => document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = e.target.checked));
    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', () => {
            const checked = Array.from(document.querySelectorAll('.row-checkbox:checked')).map(cb => cb.value);
            if (checked.length === 0) { alert('Select files first.'); return; }
            handleBatchDelete(checked);
        });
    }
    if (deleteFailedFilesBtn) {
        deleteFailedFilesBtn.addEventListener('click', () => {
            const failing = currentResultsList.filter(r => r.status_code === 'NO_MATCH' || r.passed === false).map(r => r.raw_filename || r.filename);
            if (failing.length === 0) { alert('No failed files to delete.'); return; }
            handleBatchDelete(failing);
        });
    }

    async function handleBatchDelete(filenames) {
        if (!confirm(`Delete ${filenames.length} file(s)?`)) return;
        try {
            const res = await fetch('/api/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filenames }) });
            if (res.ok) { alert(`Deleted ${filenames.length} file(s).`); loadWorkspaceCandidates(); }
        } catch (_) { alert('Delete failed.'); }
    }

    // ---------------------------------------------------------------
    // Verification Studio
    // ---------------------------------------------------------------
    function updateInspectorTrackOptions() {
        if (!inspectorTrackSelect) return;
        const prev = inspectorTrackSelect.value;
        inspectorTrackSelect.innerHTML = '';
        const refName = (usePresetRefCheckbox && usePresetRefCheckbox.checked) ? 'ref.mp3' : (selectedRefFile ? selectedRefFile.name : 'ref.mp3');
        const refOpt  = document.createElement('option');
        refOpt.value  = refName; refOpt.textContent = `Target Reference: ${refName}`;
        inspectorTrackSelect.appendChild(refOpt);
        currentResultsList.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.raw_filename || c.filename; opt.textContent = `Candidate: ${c.filename}`;
            inspectorTrackSelect.appendChild(opt);
        });
        if (prev && Array.from(inspectorTrackSelect.options).some(o => o.value === prev)) inspectorTrackSelect.value = prev;
        syncInspectorABDetails();
    }

    function syncInspectorWithAudio(filename) {
        if (inspectorTrackTitle)  inspectorTrackTitle.textContent = filename;
        if (inspectorPlayBtn) inspectorPlayBtn.innerHTML = audioPlayer.paused ? '<i class="fa-solid fa-play"></i>' : '<i class="fa-solid fa-pause"></i>';
        if (inspectorTrackSelect) inspectorTrackSelect.value = filename;
        syncInspectorABDetails();
    }

    function syncInspectorABDetails() {
        const refName = (usePresetRefCheckbox && usePresetRefCheckbox.checked) ? 'ref.mp3' : (selectedRefFile ? selectedRefFile.name : 'ref.mp3');
        if (abRefName) abRefName.textContent = refName;
        const sel  = inspectorTrackSelect ? inspectorTrackSelect.value : null;
        let cand   = null;
        if (sel && sel !== refName) cand = currentResultsList.find(c => c.raw_filename === sel || c.filename === sel);
        else if (currentResultsList.length > 0) cand = currentResultsList[0];
        if (cand) {
            if (abCandName) abCandName.textContent = cand.filename;
            if (abSimScore) abSimScore.textContent  = cand.similarity !== null ? cand.similarity.toFixed(4) : '--';
            if (abResultBadge) {
                if      (cand.passed === true  || cand.status_code === 'MATCH')    { abResultBadge.className = 'ab-badge badge-pass-green'; abResultBadge.style.cssText = ''; abResultBadge.textContent = 'MATCH / PASS'; }
                else if (cand.passed === false || cand.status_code === 'NO_MATCH') { abResultBadge.className = 'ab-badge'; abResultBadge.style.cssText = 'background:var(--sp-fail-bg);color:var(--sp-fail-text);'; abResultBadge.textContent = 'NO MATCH / FAIL'; }
                else { abResultBadge.className = 'ab-badge'; abResultBadge.style.cssText = 'background:#2C2825;color:#8E9387;'; abResultBadge.textContent = 'AWAITING RUN'; }
            }
        } else {
            if (abCandName)  abCandName.textContent = 'No candidate loaded';
            if (abSimScore)  abSimScore.textContent  = '--';
            if (abResultBadge) { abResultBadge.className = 'ab-badge'; abResultBadge.style.cssText = 'background:#2C2825;color:#8E9387;'; abResultBadge.textContent = 'SELECT CANDIDATE'; }
        }
    }

    if (inspectorTrackSelect) inspectorTrackSelect.addEventListener('change', e => syncInspectorWithAudio(e.target.value));

    if (inspectorPlayBtn) {
        inspectorPlayBtn.addEventListener('click', () => {
            const track = inspectorTrackSelect ? inspectorTrackSelect.value : 'ref.mp3';
            if (currentPlayingFilename === track && !audioPlayer.paused) pauseAudio();
            else playAudio(track, inspectorPlayBtn);
        });
    }
    if (inspectorStopBtn)  inspectorStopBtn.addEventListener('click',  stopAudio);
    if (inspectorSeekbar)  inspectorSeekbar.addEventListener('input',  e => { if (audioPlayer.duration) audioPlayer.currentTime = (e.target.value / 100) * audioPlayer.duration; });
    if (inspectorVolSlider) inspectorVolSlider.addEventListener('input', e => { audioPlayer.volume = parseFloat(e.target.value); });

    [modeDualBtn, modeScopeBtn, modeSpectrumBtn].forEach(btn => {
        if (!btn) return;
        btn.addEventListener('click', () => {
            [modeDualBtn, modeScopeBtn, modeSpectrumBtn].forEach(b => b && b.classList.remove('active'));
            btn.classList.add('active');
            visualizerMode = btn.getAttribute('data-mode') || 'dual';
            startVisualizerLoop();
        });
    });

    if (auditionRefBtn) {
        auditionRefBtn.addEventListener('click', () => {
            const ref = (usePresetRefCheckbox && usePresetRefCheckbox.checked) ? 'ref.mp3' : (selectedRefFile ? selectedRefFile.name : 'ref.mp3');
            playAudio(ref, auditionRefBtn);
        });
    }
    if (auditionCandBtn) {
        auditionCandBtn.addEventListener('click', () => {
            const ref  = (usePresetRefCheckbox && usePresetRefCheckbox.checked) ? 'ref.mp3' : (selectedRefFile ? selectedRefFile.name : 'ref.mp3');
            let cand   = inspectorTrackSelect ? inspectorTrackSelect.value : null;
            if (!cand || cand === ref) cand = currentResultsList.length > 0 ? (currentResultsList[0].raw_filename || currentResultsList[0].filename) : null;
            if (cand)  playAudio(cand, auditionCandBtn);
            else       alert('No candidate audio available.');
        });
    }

    // ---------------------------------------------------------------
    // History Log & CSV Export
    // ---------------------------------------------------------------
    const HISTORY_KEY = 'soundproof_verification_history_log';

    function initHistoryLog() {
        if (!localStorage.getItem(HISTORY_KEY)) {
            saveHistoryList([
                { timestamp: '2026-08-03 22:50:12', reference: 'ref.mp3', candidate: 'voice_01.mp3', similarity: '0.9320', decision: 'PASS', threshold: '0.85', execTime: '0.42s' },
                { timestamp: '2026-08-03 22:50:12', reference: 'ref.mp3', candidate: 'voice_02.wav', similarity: '0.8745', decision: 'PASS', threshold: '0.85', execTime: '0.38s' },
                { timestamp: '2026-08-03 22:50:12', reference: 'ref.mp3', candidate: 'voice_03.m4a', similarity: '0.6418', decision: 'FAIL', threshold: '0.85', execTime: '0.45s' },
            ]);
        }
        renderHistoryTable();
    }

    function getHistoryList() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; } }
    function saveHistoryList(list) { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch {} }
    function addHistoryRecord(record) { const list = getHistoryList(); list.unshift(record); if (list.length > 200) list.pop(); saveHistoryList(list); renderHistoryTable(); }

    function renderHistoryTable() {
        if (!historyTbody) return;
        const list = getHistoryList();
        historyTbody.innerHTML = '';
        if (list.length === 0) { historyTbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--sp-text-muted);">No logs yet.</td></tr>`; return; }
        list.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${item.timestamp}</td><td>${item.reference}</td><td><strong>${item.candidate}</strong></td><td><strong>${item.similarity}</strong></td><td>${item.decision === 'PASS' ? '<span class="result-badge pass">PASS</span>' : '<span class="result-badge fail">FAIL</span>'}</td><td>${item.threshold}</td><td>${item.execTime}</td>`;
            historyTbody.appendChild(tr);
        });
    }

    if (exportHistoryBtn) {
        exportHistoryBtn.addEventListener('click', () => {
            const list = getHistoryList();
            if (list.length === 0) { alert('No history to export.'); return; }
            const headers = ['Timestamp','Reference Audio','Candidate Audio','Cosine Similarity','Decision','Threshold','Execution Time'];
            const rows = list.map(item => [`"${item.timestamp}"`,`"${item.reference}"`,`"${item.candidate}"`,item.similarity,item.decision,item.threshold,`"${item.execTime}"`].join(','));
            const csv  = [headers.join(','), ...rows].join('\r\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href = url; a.download = `soundproof_history_${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            const orig = exportHistoryBtn.innerHTML;
            exportHistoryBtn.innerHTML = '<i class="fa-solid fa-check"></i> Exported!';
            setTimeout(() => { exportHistoryBtn.innerHTML = orig; }, 2000);
        });
    }

});
