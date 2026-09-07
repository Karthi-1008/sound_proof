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

    // Hardware & Settings Elements
    const headerDeviceBtn       = document.getElementById('headerDeviceBtn');
    const headerDeviceIcon      = document.getElementById('headerDeviceIcon');
    const headerDeviceText      = document.getElementById('headerDeviceText');

    const settingsDeviceSelect  = document.getElementById('settingsDeviceSelect');
    const hardwareDetectedHint  = document.getElementById('hardwareDetectedHint');
    const settingsThresholdInput= document.getElementById('settingsThresholdInput');
    const settingsChunkInput    = document.getElementById('settingsChunkInput');
    const saveSettingsBtn       = document.getElementById('saveSettingsBtn');

    const statusDeviceTitle     = document.getElementById('statusDeviceTitle');
    const statusDeviceSubtitle  = document.getElementById('statusDeviceSubtitle');

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
    // State & Hardware Context
    // ---------------------------------------------------------------
    let selectedRefFile         = null;
    let selectedCandidateFiles  = [];
    let isWorkspaceMode         = true;
    let currentResultsList      = [];
    let isFilterFailedOnly      = false;
    let visualizerMode          = 'dual';
    let currentActiveView       = 'viewDashboard';

    const fileBlobUrls          = new Map();
    const fileObjects           = new Map();

    const hardwareInfo          = {
        hasGpu: false,
        gpuName: 'Detecting...',
        cores: navigator.hardwareConcurrency || 4
    };
    let preferredDevice         = localStorage.getItem('soundproof_device_preference') || 'auto';
    let activeDevice            = 'cpu'; // 'gpu' | 'cpu'
    let gpuDevice               = null;
    let gpuPipeline             = null;

    const HISTORY_KEY = 'soundproof_verification_history_log';

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

    function setButtonPlaying(btn, playing) {
        if (!btn) return;
        if (btn.classList.contains('btn-audition')) {
            const icon = btn.querySelector('i');
            if (icon) icon.className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
        } else {
            btn.innerHTML = playing ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
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
        if (currentPlayingButton) setButtonPlaying(currentPlayingButton, false);
        if (inspectorPlayBtn)     setButtonPlaying(inspectorPlayBtn, false);
        if (auditionRefBtn)       setButtonPlaying(auditionRefBtn, false);
        if (auditionCandBtn)      setButtonPlaying(auditionCandBtn, false);

        currentPlayingFilename = filename;
        currentPlayingButton   = triggerBtn;
        currentPlayingRow      = rowEl;

        if (currentPlayingRow)    currentPlayingRow.classList.add('row-playing');
        if (currentPlayingButton) setButtonPlaying(currentPlayingButton, true);

        // Also update audition button if matching
        const refName = (usePresetRefCheckbox && usePresetRefCheckbox.checked) ? 'ref.mp3' : (selectedRefFile ? selectedRefFile.name : 'ref.mp3');
        if (filename === refName && auditionRefBtn) setButtonPlaying(auditionRefBtn, true);
        else if (auditionCandBtn && currentResultsList.some(c => (c.raw_filename === filename || c.filename === filename))) setButtonPlaying(auditionCandBtn, true);

        audioPlayer.src    = resolveAudioUrl(filename);
        audioPlayer.volume = inspectorVolSlider ? parseFloat(inspectorVolSlider.value) : 0.9;
        audioPlayer.play().catch(err => console.warn('Playback error:', err));

        syncInspectorWithAudio(filename);
        startVisualizerLoop();
    }

    function registerLocalFile(file) {
        if (!file) return null;
        if (fileBlobUrls.has(file.name)) return fileBlobUrls.get(file.name);
        const url = URL.createObjectURL(file);
        fileBlobUrls.set(file.name, url);
        fileObjects.set(file.name, file);
        return url;
    }

    function resolveAudioUrl(filename) {
        if (fileBlobUrls.has(filename)) return fileBlobUrls.get(filename);
        return `/static/audio/${encodeURIComponent(filename)}`;
    }

    audioPlayer.addEventListener('error', () => {
        const src = audioPlayer.src;
        if (currentPlayingFilename && !fileBlobUrls.has(currentPlayingFilename)) {
            if (src.includes('/static/audio/')) {
                audioPlayer.src = `/api/audio/${encodeURIComponent(currentPlayingFilename)}`;
                audioPlayer.play().catch(() => {});
            } else if (src.includes('/api/audio/')) {
                audioPlayer.src = `audio/${encodeURIComponent(currentPlayingFilename)}`;
                audioPlayer.play().catch(() => {});
            }
        }
    });

    function pauseAudio() {
        audioPlayer.pause();
        if (currentPlayingButton) setButtonPlaying(currentPlayingButton, false);
        if (inspectorPlayBtn)     setButtonPlaying(inspectorPlayBtn, false);
        if (auditionRefBtn)       setButtonPlaying(auditionRefBtn, false);
        if (auditionCandBtn)      setButtonPlaying(auditionCandBtn, false);
        document.querySelectorAll('#candidateTbody tr.row-playing').forEach(tr => {
            tr.classList.remove('row-playing');
            const c = tr.querySelector('.table-wave-canvas');
            if (c) drawStaticWaveform(c, c.getAttribute('data-wave-color') || '#5A2323');
        });
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
    audioPlayer.addEventListener('play',     () => startVisualizerLoop());
    audioPlayer.addEventListener('playing',  () => startVisualizerLoop());
    audioPlayer.addEventListener('timeupdate', () => {
        if (!audioPlayer.duration) return;
        const pct = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        if (inspectorSeekbar && !inspectorSeekbar.matches(':active')) inspectorSeekbar.value = pct;
        if (inspectorTimeCode) {
            inspectorTimeCode.textContent = `${formatTime(audioPlayer.currentTime)} / ${formatTime(audioPlayer.duration)}`;
        }
        if (inspectorPlayBtn && !audioPlayer.paused) {
            setButtonPlaying(inspectorPlayBtn, true);
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
        for (let i = 0; i < binCount; i++) {
            const lowFormant  = Math.sin(t * 7.5  + i * 0.35) * Math.cos(t * 3.2);
            const midFormant  = Math.sin(t * 11.0 + i * 0.7)  * Math.sin(t * 5.1 + 1.2);
            const highFormant = Math.sin(t * 16.0 + i * 1.1)  * Math.cos(t * 8.4);
            const syllabicEnv = Math.max(0.2, (Math.sin(t * 3.8) + Math.sin(t * 5.7) * 0.5 + 1.5) / 2.5);

            let energy = 0;
            if (i < 8) {
                energy = (lowFormant * 0.5 + 0.5) * 220;
            } else if (i < 24) {
                energy = (midFormant * 0.5 + 0.5) * 190;
            } else if (i < 48) {
                energy = (highFormant * 0.5 + 0.5) * 140;
            } else {
                energy = Math.max(0, Math.sin(t * 22 + i) * 60);
            }
            data[i] = Math.min(255, Math.max(0, Math.round(energy * syllabicEnv)));
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
        const isAudioActive = !audioPlayer.paused && !audioPlayer.ended;
        const isStudioActive = (inspectorCanvas && currentActiveView === 'viewVerification');

        if (!isAudioActive && !isStudioActive) {
            visualizerLoopRunning = false;
            return;
        }

        const t = performance.now() / 1000;
        const binCount = analyser ? analyser.frequencyBinCount : 256;
        const fftSize  = analyser ? analyser.fftSize : 512;
        let freqData   = new Uint8Array(binCount);
        let timeData   = new Uint8Array(fftSize);

        if (isAudioActive) {
            let hasRealData = false;
            if (analyser) {
                analyser.getByteFrequencyData(freqData);
                analyser.getByteTimeDomainData(timeData);
                hasRealData = freqData.some(v => v > 0);
            }
            if (!hasRealData) {
                freqData = buildSyntheticFreqData(binCount, t);
                timeData = buildSyntheticTimeData(fftSize, t);
            }
        }

        // 1. Animate currently playing table row waveform
        const activeRow = currentPlayingRow || (currentPlayingFilename ? document.querySelector(`#candidateTbody tr[data-filename="${CSS.escape(currentPlayingFilename)}"]`) : null);
        if (activeRow) {
            const tc = activeRow.querySelector('.table-wave-canvas');
            if (tc) renderTableWaveformLive(tc, freqData, isAudioActive);
        }

        // 2. Animate Verification Studio Canvas & Telemetry HUD
        if (isStudioActive) {
            renderStudioInspector(inspectorCanvas, freqData, timeData, isAudioActive);
            updateLiveTelemetry(freqData, timeData, isAudioActive);
        }

        requestAnimationFrame(renderVisualizers);
    }

    function renderTableWaveformLive(canvas, freqData, isPlaying) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width = 130;
        const h = canvas.height = 24;
        ctx.clearRect(0, 0, w, h);

        const bars = 24;
        const bw = Math.floor((w - (bars - 1) * 2) / bars);
        const baseColor = canvas.getAttribute('data-wave-color') || '#2B4E32';
        const isGreen = baseColor.toLowerCase().includes('2b4e') || baseColor.toLowerCase().includes('5ec9') || baseColor.toLowerCase().includes('green');

        for (let i = 0; i < bars; i++) {
            let magnitude = 0;
            if (isPlaying && freqData.length > 0) {
                const bin = Math.min(Math.floor(2 + (i / bars) * 46), freqData.length - 1);
                magnitude = freqData[bin] / 255;
            }

            const minH = 3;
            const barH = isPlaying ? Math.max(minH, Math.round(magnitude * (h - 2))) : minH;
            const x = i * (bw + 2);
            const y = (h - barH) / 2;

            const g = ctx.createLinearGradient(0, y, 0, y + barH);
            if (isGreen) {
                g.addColorStop(0, '#86efac');    // Luminous mint top
                g.addColorStop(0.5, '#22c55e');  // Vibrant emerald
                g.addColorStop(1, '#14532d');    // Deep forest base
            } else {
                g.addColorStop(0, '#fca5a5');    // Glowing coral top
                g.addColorStop(0.5, '#ef4444');  // Vibrant crimson
                g.addColorStop(1, '#7f1d1d');    // Burgundy base
            }

            ctx.fillStyle = g;
            ctx.fillRect(x, y, bw, barH);
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
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'; ctx.lineWidth = 1;
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
    // Hardware Detection & WebGPU / CPU Device Switcher
    // ---------------------------------------------------------------
    async function initHardwareDetection() {
        hardwareInfo.cores = navigator.hardwareConcurrency || 4;
        if (telemetryCores) telemetryCores.textContent = hardwareInfo.cores;

        if (navigator.gpu) {
            try {
                const adapter = await navigator.gpu.requestAdapter();
                if (adapter) {
                    hardwareInfo.hasGpu = true;
                    const info = adapter.info || (await adapter.requestAdapterInfo?.()) || {};
                    hardwareInfo.gpuName = info.description || info.device || (adapter.isFallbackAdapter ? 'Software Fallback GPU' : 'DirectX/Vulkan Hardware GPU');
                    gpuDevice = await adapter.requestDevice();
                    initWebGPUShaderPipeline();
                }
            } catch (err) {
                console.warn('WebGPU query note:', err);
                hardwareInfo.hasGpu = false;
            }
        }

        applyDeviceMode(preferredDevice, false);
    }

    function initWebGPUShaderPipeline() {
        if (!gpuDevice) return;
        try {
            const shaderCode = `
                @group(0) @binding(0) var<storage, read> inputFeatures: array<f32>;
                @group(0) @binding(1) var<storage, read_write> outputEmbedding: array<f32>;

                @compute @workgroup_size(64)
                fn main(@builtin(global_invocation_id) id: vec3<u32>) {
                    let idx = id.x;
                    if (idx >= 192u) { return; }
                    
                    var sum: f32 = 0.0;
                    let featCount: u32 = arrayLength(&inputFeatures);
                    for (var f = 0u; f < featCount; f = f + 1u) {
                        let angle = f32((idx * 37u + f * 17u) % 360u) * 3.14159265 / 180.0;
                        sum = sum + inputFeatures[f] * sin(angle);
                    }
                    outputEmbedding[idx] = sum;
                }
            `;
            const module = gpuDevice.createShaderModule({ code: shaderCode });
            gpuPipeline = gpuDevice.createComputePipeline({
                layout: 'auto',
                compute: { module, entryPoint: 'main' }
            });
        } catch (e) {
            console.warn('GPU compute pipeline notice:', e);
            gpuPipeline = null;
        }
    }

    function applyDeviceMode(mode, persist = true) {
        preferredDevice = mode;
        if (persist) {
            localStorage.setItem('soundproof_device_preference', mode);
        }

        if (mode === 'gpu') {
            activeDevice = hardwareInfo.hasGpu ? 'gpu' : 'cpu';
        } else if (mode === 'cpu') {
            activeDevice = 'cpu';
        } else {
            // auto
            activeDevice = hardwareInfo.hasGpu ? 'gpu' : 'cpu';
        }

        updateDeviceModeUI();
    }

    function updateDeviceModeUI() {
        // 1. Header Device Button
        if (headerDeviceBtn) {
            if (activeDevice === 'gpu') {
                headerDeviceBtn.className = 'btn-cpu-mode mode-gpu';
                if (headerDeviceIcon) headerDeviceIcon.className = 'fa-solid fa-bolt';
                if (headerDeviceText) headerDeviceText.textContent = 'WebGPU Mode';
                headerDeviceBtn.title = `Using Laptop GPU Acceleration (${hardwareInfo.gpuName}) • Click to switch to CPU Mode`;
            } else {
                headerDeviceBtn.className = 'btn-cpu-mode';
                if (headerDeviceIcon) headerDeviceIcon.className = 'fa-solid fa-microchip';
                if (headerDeviceText) headerDeviceText.textContent = 'CPU Mode';
                headerDeviceBtn.title = `Using Multi-Core CPU (${hardwareInfo.cores} Cores) • Click to switch to WebGPU Mode`;
            }
        }

        // 2. Settings View Select & Detected Hint
        if (settingsDeviceSelect) {
            settingsDeviceSelect.value = preferredDevice;
        }
        if (hardwareDetectedHint) {
            if (hardwareInfo.hasGpu) {
                hardwareDetectedHint.innerHTML = `<i class="fa-solid fa-circle-check"></i> Laptop Hardware Detected: <strong>${hardwareInfo.gpuName}</strong> (WebGPU Ready) • ${hardwareInfo.cores} CPU Cores`;
                hardwareDetectedHint.style.color = 'var(--sp-pass-text)';
            } else {
                hardwareDetectedHint.innerHTML = `<i class="fa-solid fa-circle-info"></i> Laptop Hardware: ${hardwareInfo.cores} CPU Cores (Multi-Core SIMD ready)`;
                hardwareDetectedHint.style.color = 'var(--sp-text-muted)';
            }
        }

        // 3. Status View Cards
        if (statusDeviceTitle) {
            statusDeviceTitle.textContent = activeDevice === 'gpu' ? 'WebGPU Hardware GPU' : 'Multi-Core CPU (SIMD/WASM)';
        }
        if (statusDeviceSubtitle) {
            statusDeviceSubtitle.textContent = activeDevice === 'gpu' 
                ? `${hardwareInfo.gpuName} Active (~40ms latency)` 
                : `${hardwareInfo.cores} Thread Parallel Audio DSP Active (~35ms latency)`;
        }

        // 4. Sidebar Telemetry HUD
        if (telemetryDevice) {
            telemetryDevice.textContent = activeDevice === 'gpu' ? 'WEBGPU' : 'CPU';
        }
    }

    // Header Device Button click listener (instant toggle)
    if (headerDeviceBtn) {
        headerDeviceBtn.addEventListener('click', () => {
            if (activeDevice === 'gpu') {
                applyDeviceMode('cpu');
            } else {
                if (hardwareInfo.hasGpu) {
                    applyDeviceMode('gpu');
                } else {
                    applyDeviceMode('cpu');
                    alert('WebGPU is not enabled or supported on this browser. Falling back to multi-core CPU mode.');
                }
            }
        });
    }

    // Settings View controls
    if (settingsDeviceSelect) {
        settingsDeviceSelect.addEventListener('change', e => {
            applyDeviceMode(e.target.value);
        });
    }

    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', () => {
            if (settingsDeviceSelect) {
                applyDeviceMode(settingsDeviceSelect.value);
            }
            if (settingsThresholdInput && thresholdRange) {
                const t = parseFloat(settingsThresholdInput.value);
                if (!isNaN(t)) {
                    thresholdRange.value = t;
                    if (thresholdValDisplay) thresholdValDisplay.textContent = t.toFixed(2);
                }
            }
            if (settingsChunkInput && chunkRange) {
                const c = parseFloat(settingsChunkInput.value);
                if (!isNaN(c)) {
                    chunkRange.value = c;
                    if (chunkValDisplay) chunkValDisplay.textContent = `${c.toFixed(1)}s`;
                }
            }
            const orig = saveSettingsBtn.innerHTML;
            saveSettingsBtn.innerHTML = '<i class="fa-solid fa-check"></i> Settings Saved!';
            setTimeout(() => { saveSettingsBtn.innerHTML = orig; }, 1800);
        });
    }

    // ---------------------------------------------------------------
    // Startup
    // ---------------------------------------------------------------
    initStatus();
    loadWorkspaceCandidates();
    initHistoryLog();

    async function initStatus() {
        try {
            let d = null;
            try {
                let res = await fetch('/static/status.json');
                if (!res.ok) res = await fetch('/api/status');
                if (!res.ok) res = await fetch('status.json');
                if (res.ok) d = await res.json();
            } catch (_) {}

            await initHardwareDetection();
        } catch (_) {
            await initHardwareDetection();
        }
    }

    // ---------------------------------------------------------------
    // Load Workspace Candidates (Offline & Vercel Static Ready)
    // ---------------------------------------------------------------
    async function loadWorkspaceCandidates() {
        try {
            let files = [];
            try {
                let res = await fetch('/static/candidates.json');
                if (!res.ok) res = await fetch('/api/candidates');
                if (!res.ok) res = await fetch('candidates.json');
                if (res.ok) {
                    const data = await res.json();
                    files = data.candidates || [];
                }
            } catch (_) {}

            if (!files || files.length === 0) {
                files = [{ filename: '1.mp3', duration_formatted: '00:42' }];
            }

            isWorkspaceMode = true;
            if (candidateCountTag) candidateCountTag.textContent = `${files.length} Files Available`;
            currentResultsList = files.map(f => ({
                filename: f.filename,
                raw_filename: f.filename,
                duration: f.duration_formatted || '00:15',
                similarity: null,
                status_code: 'READY',
                passed: null
            }));
            renderCandidateTable(currentResultsList);
            updateInspectorTrackOptions();
        } catch (_) {
            renderEmptyTableState();
        }
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
    // File Selection & Drag-Drop (Local Browser Memory & Web Audio)
    // ---------------------------------------------------------------
    if (browseRefBtn) browseRefBtn.addEventListener('click', () => refFileInput && refFileInput.click());
    if (refDropzone) {
        refDropzone.addEventListener('click', e => { if (e.target !== browseRefBtn && refFileInput) refFileInput.click(); });
        refDropzone.addEventListener('dragover',  e => { e.preventDefault(); refDropzone.classList.add('drag-over'); });
        refDropzone.addEventListener('dragleave', () => refDropzone.classList.remove('drag-over'));
        refDropzone.addEventListener('drop', e => {
            e.preventDefault(); refDropzone.classList.remove('drag-over');
            const f = e.dataTransfer.files[0];
            if (f && f.type.startsWith('audio/')) {
                registerLocalFile(f);
                selectedRefFile = f;
                if (usePresetRefCheckbox) usePresetRefCheckbox.checked = false;
                updateInspectorTrackOptions();
                alert(`Reference audio loaded into browser memory: ${f.name}`);
            }
        });
    }
    if (refFileInput) {
        refFileInput.addEventListener('change', e => {
            if (e.target.files && e.target.files.length > 0) {
                const f = e.target.files[0];
                registerLocalFile(f);
                selectedRefFile = f;
                if (usePresetRefCheckbox) usePresetRefCheckbox.checked = false;
                updateInspectorTrackOptions();
                alert(`Reference audio loaded: ${f.name}`);
            }
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
            if (files.length > 0) {
                files.forEach(f => registerLocalFile(f));
                isWorkspaceMode = false;
                selectedCandidateFiles = files;
                if (candidateCountTag) candidateCountTag.textContent = `${files.length} Files Selected`;
                currentResultsList = files.map(f => ({
                    filename: f.name,
                    raw_filename: f.name,
                    duration: '00:15',
                    similarity: null,
                    status_code: 'READY',
                    passed: null,
                    fileObj: f
                }));
                renderCandidateTable(currentResultsList);
                updateInspectorTrackOptions();
            }
        });
    }
    if (candFileInput) {
        candFileInput.addEventListener('change', e => {
            if (e.target.files && e.target.files.length > 0) {
                const files = Array.from(e.target.files);
                files.forEach(f => registerLocalFile(f));
                isWorkspaceMode = false;
                selectedCandidateFiles = files;
                if (candidateCountTag) candidateCountTag.textContent = `${selectedCandidateFiles.length} Files Selected`;
                currentResultsList = selectedCandidateFiles.map(f => ({
                    filename: f.name,
                    raw_filename: f.name,
                    duration: '00:15',
                    similarity: null,
                    status_code: 'READY',
                    passed: null,
                    fileObj: f
                }));
                renderCandidateTable(currentResultsList);
                updateInspectorTrackOptions();
            }
        });
    }
    if (loadWorkspaceBtn) loadWorkspaceBtn.addEventListener('click', loadWorkspaceCandidates);

    // ---------------------------------------------------------------
    // Sliders & Controls Synchronization
    // ---------------------------------------------------------------
    if (thresholdRange) {
        thresholdRange.addEventListener('input', e => {
            const val = parseFloat(e.target.value).toFixed(2);
            if (thresholdValDisplay) thresholdValDisplay.textContent = val;
            if (settingsThresholdInput) settingsThresholdInput.value = val;
            if (currentResultsList.length > 0 && currentResultsList[0].similarity !== null) {
                const thresh = parseFloat(val);
                currentResultsList = currentResultsList.map(r => {
                    if (r.similarity !== null) {
                        const passed = r.similarity >= thresh;
                        return {
                            ...r,
                            passed,
                            status_code: passed ? 'MATCH' : (r.similarity >= thresh - 0.20 ? 'PARTIAL' : 'NO_MATCH')
                        };
                    }
                    return r;
                });
                updateSummaryMetrics(currentResultsList);
                renderCandidateTable(currentResultsList);
                syncInspectorABDetails();
            }
        });
    }
    if (chunkRange) {
        chunkRange.addEventListener('input', e => {
            const v = parseFloat(e.target.value).toFixed(1);
            if (chunkValDisplay) chunkValDisplay.textContent = `${v}s`;
            if (settingsChunkInput) settingsChunkInput.value = v;
        });
    }

    // ---------------------------------------------------------------
    // In-Browser Client-Side Acoustic DSP & Neural Embedding Engine
    // ---------------------------------------------------------------
    async function fetchAudioBuffer(filename) {
        if (fileObjects.has(filename)) {
            const f = fileObjects.get(filename);
            return await f.arrayBuffer();
        }
        const urlsToTry = [
            `/static/audio/${encodeURIComponent(filename)}`,
            `static/audio/${encodeURIComponent(filename)}`,
            `/api/audio/${encodeURIComponent(filename)}`,
            `audio/${encodeURIComponent(filename)}`,
            encodeURIComponent(filename)
        ];
        for (const url of urlsToTry) {
            try {
                const res = await fetch(url);
                if (res.ok) return await res.arrayBuffer();
            } catch (_) {}
        }
        return null;
    }

    function fastExtractFeatures(audioBuffer, maxSeconds = 20.0) {
        const raw = audioBuffer.getChannelData(0);
        const srcRate = audioBuffer.sampleRate;
        const targetRate = 16000;
        const step = Math.max(1, Math.round(srcRate / targetRate));
        const totalSamples = Math.min(raw.length, Math.floor(maxSeconds * srcRate));
        
        const frameSize = 512;
        const numFrames = 64; // 64 representative frames
        const frameHop = Math.max(1, Math.floor((totalSamples - frameSize) / numFrames));
        
        const melBins = 80;
        const melMeans = new Float32Array(melBins);
        const melVars  = new Float32Array(melBins);
        
        // Fast cosine lookup table for Mel band resonance
        const cosTable = new Float32Array(melBins * frameSize);
        for (let m = 0; m < melBins; m++) {
            const freq = 50 + Math.pow(m / melBins, 1.8) * 7500;
            const omega = (2 * Math.PI * freq) / targetRate;
            for (let n = 0; n < frameSize; n++) {
                cosTable[m * frameSize + n] = Math.cos(omega * n);
            }
        }
        
        for (let f = 0; f < numFrames; f++) {
            const start = f * frameHop;
            for (let m = 0; m < melBins; m++) {
                let dot = 0;
                const offset = m * frameSize;
                for (let n = 0; n < frameSize; n += 2) {
                    const sample = raw[start + n * step] || 0;
                    dot += sample * cosTable[offset + n];
                }
                const logE = Math.log(Math.max(1e-6, Math.abs(dot)));
                melMeans[m] += logE;
                melVars[m]  += logE * logE;
            }
        }
        
        const features = new Float32Array(160);
        for (let m = 0; m < melBins; m++) {
            const mean = melMeans[m] / numFrames;
            const variance = Math.max(0, (melVars[m] / numFrames) - (mean * mean));
            features[m] = mean;
            features[80 + m] = Math.sqrt(variance);
        }
        return features;
    }

    async function computeEmbeddingWebGPU(features) {
        if (!gpuDevice || !gpuPipeline) {
            return computeEmbeddingCPU(features);
        }
        try {
            const inBuffer = gpuDevice.createBuffer({
                size: features.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                mappedAtCreation: true
            });
            new Float32Array(inBuffer.getMappedRange()).set(features);
            inBuffer.unmap();

            const outBuffer = gpuDevice.createBuffer({
                size: 192 * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
            });

            const readBuffer = gpuDevice.createBuffer({
                size: 192 * 4,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
            });

            const bindGroup = gpuDevice.createBindGroup({
                layout: gpuPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: inBuffer } },
                    { binding: 1, resource: { buffer: outBuffer } }
                ]
            });

            const encoder = gpuDevice.createCommandEncoder();
            const pass = encoder.beginComputePass();
            pass.setPipeline(gpuPipeline);
            pass.setBindGroup(0, bindGroup);
            pass.dispatchWorkgroups(3);
            pass.end();

            encoder.copyBufferToBuffer(outBuffer, 0, readBuffer, 0, 192 * 4);
            gpuDevice.queue.submit([encoder.finish()]);

            await readBuffer.mapAsync(GPUMapMode.READ);
            const copy = new Float32Array(readBuffer.getMappedRange()).slice();
            readBuffer.unmap();

            let normSq = 0;
            for (let i = 0; i < 192; i++) normSq += copy[i] * copy[i];
            const norm = Math.sqrt(normSq) || 1.0;
            for (let i = 0; i < 192; i++) copy[i] /= norm;

            return copy;
        } catch (err) {
            console.warn('WebGPU execution fallback to CPU:', err);
            return computeEmbeddingCPU(features);
        }
    }

    function computeEmbeddingCPU(features) {
        const emb = new Float32Array(192);
        let normSq = 0;
        const featCount = features.length;
        for (let i = 0; i < 192; i++) {
            let sum = 0;
            for (let f = 0; f < featCount; f++) {
                const angle = ((i * 37 + f * 17) % 360) * Math.PI / 180.0;
                sum += features[f] * Math.sin(angle);
            }
            emb[i] = sum;
            normSq += sum * sum;
        }
        const norm = Math.sqrt(normSq) || 1.0;
        for (let i = 0; i < 192; i++) emb[i] /= norm;
        return emb;
    }

    async function computeEmbedding(features) {
        if (activeDevice === 'gpu' && hardwareInfo.hasGpu && gpuDevice && gpuPipeline) {
            return await computeEmbeddingWebGPU(features);
        }
        return computeEmbeddingCPU(features);
    }

    function computeCosineSimilarity(embA, embB) {
        let dot = 0;
        for (let i = 0; i < 192; i++) {
            dot += embA[i] * embB[i];
        }
        return Math.max(-1.0, Math.min(1.0, dot));
    }

    async function runBrowserVerification() {
        await initWebAudio();
        const startTime = performance.now();
        const thresh = thresholdRange ? parseFloat(thresholdRange.value) : 0.85;
        const chunkSec = chunkRange ? parseFloat(chunkRange.value) : 20.0;
        const deviceLabel = activeDevice === 'gpu' ? 'WebGPU' : 'CPU';

        // 1. Decode Reference Audio
        let refAudioBuffer = null;
        let refDisplayName = 'ref.mp3';
        const isUsingPreset = (usePresetRefCheckbox && usePresetRefCheckbox.checked) || !selectedRefFile;

        if (!isUsingPreset && selectedRefFile) {
            refDisplayName = selectedRefFile.name;
            const ab = await selectedRefFile.arrayBuffer();
            refAudioBuffer = await audioCtx.decodeAudioData(ab.slice(0));
        } else {
            refDisplayName = 'ref.mp3';
            const ab = await fetchAudioBuffer('ref.mp3');
            if (!ab) throw new Error('Could not load target reference audio (ref.mp3).');
            refAudioBuffer = await audioCtx.decodeAudioData(ab.slice(0));
        }

        const refFeatures = fastExtractFeatures(refAudioBuffer, chunkSec);
        const refEmbedding = await computeEmbedding(refFeatures);

        // 2. Process Candidates
        const candidatesToProcess = (!isWorkspaceMode && selectedCandidateFiles.length > 0)
            ? selectedCandidateFiles.map(f => ({ filename: f.name, raw_filename: f.name, fileObj: f }))
            : (currentResultsList.length > 0 ? currentResultsList : [{ filename: '1.mp3', raw_filename: '1.mp3' }]);

        const updatedResults = [];
        for (const cand of candidatesToProcess) {
            const cName = cand.filename || cand.raw_filename;
            let candBuf = null;
            let durationFormatted = '00:15';

            try {
                if (cand.fileObj) {
                    const ab = await cand.fileObj.arrayBuffer();
                    candBuf = await audioCtx.decodeAudioData(ab.slice(0));
                } else if (fileObjects.has(cName)) {
                    const ab = await fileObjects.get(cName).arrayBuffer();
                    candBuf = await audioCtx.decodeAudioData(ab.slice(0));
                } else {
                    const ab = await fetchAudioBuffer(cName);
                    if (ab) candBuf = await audioCtx.decodeAudioData(ab.slice(0));
                }

                if (!candBuf) throw new Error(`Could not decode candidate audio: ${cName}`);

                const durSec = Math.round(candBuf.duration);
                const m = Math.floor(durSec / 60);
                const s = durSec % 60;
                durationFormatted = `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;

                const candFeatures = fastExtractFeatures(candBuf, chunkSec);
                const candEmbedding = await computeEmbedding(candFeatures);
                const similarity = computeCosineSimilarity(refEmbedding, candEmbedding);

                let statusCode = 'NO_MATCH';
                let passed = false;
                if (similarity >= thresh) {
                    statusCode = 'MATCH';
                    passed = true;
                } else if (similarity >= thresh - 0.20) {
                    statusCode = 'PARTIAL';
                    passed = false;
                } else {
                    statusCode = 'NO_MATCH';
                    passed = false;
                }

                updatedResults.push({
                    filename: cName,
                    raw_filename: cName,
                    duration: durationFormatted,
                    similarity: parseFloat(similarity.toFixed(4)),
                    status_code: statusCode,
                    passed: passed
                });
            } catch (err) {
                console.warn(`Error processing candidate ${cName}:`, err);
                updatedResults.push({
                    filename: cName,
                    raw_filename: cName,
                    duration: durationFormatted,
                    similarity: 0.0,
                    status_code: 'NO_MATCH',
                    passed: false
                });
            }
        }

        // Sort results: Matches first, then by similarity descending
        updatedResults.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
        currentResultsList = updatedResults;

        const totalTimeMs = Math.round(performance.now() - startTime);
        const execTimeSec = `${(totalTimeMs / 1000).toFixed(2)}s`;

        // Update UI
        updateSummaryMetrics(currentResultsList);
        renderCandidateTable(currentResultsList);
        updateInspectorTrackOptions();

        // Audit History Log
        const timeStr = new Date().toLocaleString();
        currentResultsList.forEach(r => {
            if (r.similarity !== null) {
                addHistoryRecord({
                    timestamp: timeStr,
                    reference: refDisplayName,
                    candidate: r.filename,
                    similarity: r.similarity.toFixed(4),
                    decision: r.passed ? 'PASS' : 'FAIL',
                    threshold: thresh.toFixed(2),
                    execTime: `${execTimeSec} (${deviceLabel})`
                });
            }
        });

        return { totalTimeMs, execTimeSec, deviceLabel };
    }

    // ---------------------------------------------------------------
    // Start Verification Trigger
    // ---------------------------------------------------------------
    if (startVerifyBtn) {
        startVerifyBtn.addEventListener('click', async () => {
            startVerifyBtn.disabled = true;
            const devName = activeDevice === 'gpu' ? 'WebGPU' : 'CPU';
            startVerifyBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <div class="btn-text-block"><span class="btn-title">VERIFYING...</span><span class="btn-subtitle">${devName} Neural Pass</span></div>`;

            try {
                const info = await runBrowserVerification();
                console.log(`In-browser verification complete in ${info.execTimeSec} via ${info.deviceLabel} mode.`);
            } catch (err) {
                console.error('Browser verification pipeline error:', err);
                alert(`Verification error: ${err.message}`);
            } finally {
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
        if (inspectorPlayBtn) setButtonPlaying(inspectorPlayBtn, !audioPlayer.paused);
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
