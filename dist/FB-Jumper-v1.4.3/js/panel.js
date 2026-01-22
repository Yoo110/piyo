(function () {
    const TICKS_PER_SECOND = 254016000000;
    const timePattern = /(\b\d{1,2}:\d{2}(?::\d{2})?\b)/;
    const cs = new CSInterface();
    const cep = window.__adobe_cep__;
    const isMac = navigator.platform ? /mac/i.test(navigator.platform) : false;
    const STORAGE_KEYS = {
        anchors: 'fbj-anchors-v1'
    };

    const fbInput = document.getElementById('fb');
    const parseBtn = document.getElementById('parse');
    const clearBtn = document.getElementById('clear');
    const listEl = document.getElementById('list');
    const anchorOriginalInput = document.getElementById('anchor-original');
    const addAnchorBtn = document.getElementById('add-anchor-from-playhead');
    const addAnchorFromLastJumpBtn = document.getElementById('add-anchor-from-last-jump');
    const clearAnchorsBtn = document.getElementById('clear-anchors');
    const undoAnchorsBtn = document.getElementById('undo-anchors');
    const anchorListEl = document.getElementById('anchor-list');
    const focusStatusEl = document.getElementById('focus-status');
    const diagnosticStatusEl = document.getElementById('diagnostic-status');
    const focusNowBtn = document.getElementById('focus-now');
    const focusCmdInput = document.getElementById('focus-cmd');
    const applyFocusCmdBtn = document.getElementById('apply-focus-cmd');
    const resetFocusCmdBtn = document.getElementById('reset-focus-cmd');
    const detectFocusCmdBtn = document.getElementById('detect-focus-cmd');
    const clearChecksBtn = document.getElementById('clear-checks');
    const clearChecksInlineBtn = document.getElementById('clear-checks-inline');
    const CHECK_KEY_PREFIX = 'fb-check-';
    const focusHotkey = {
        shift: true,
        code: 'Digit3',
        key: '3',
        keyCode: 51
    };
    const anchorHotkey = {
        shift: true,
        code: 'Digit4',
        key: '4',
        keyCode: 52
    };
    const DEFAULT_FOCUS_CMD_IDS = '235,234,231'; // タイムラインフォーカス用の汎用候補（Shift+3系）

    let currentEntries = [];
    let anchors = [];
    let undoStack = [];
    let lastJumpSourceSeconds = null;

    const BUILD_LABEL = 'build: 2024-12-13-2140'; // 確実に更新を確認するためのタグ
    const diagnostics = {};

    function setFocusStatus(text) {
        if (focusStatusEl) {
            focusStatusEl.textContent = text + ' / ' + BUILD_LABEL;
        }
    }

    function renderDiagnostics() {
        if (!diagnosticStatusEl) {
            return;
        }
        const messages = Object.keys(diagnostics)
            .map((key) => diagnostics[key])
            .filter(Boolean);
        if (!messages.length) {
            diagnosticStatusEl.textContent = '';
            diagnosticStatusEl.classList.add('hidden');
            return;
        }
        diagnosticStatusEl.textContent = messages.join('\n');
        diagnosticStatusEl.classList.remove('hidden');
    }

    function setDiagnostic(key, message) {
        if (!key) {
            return;
        }
        if (message) {
            diagnostics[key] = '- ' + message;
        } else {
            delete diagnostics[key];
        }
        renderDiagnostics();
    }

    function clearDiagnostic(key) {
        if (!key || !diagnostics[key]) {
            return;
        }
        delete diagnostics[key];
        renderDiagnostics();
    }

    function focusTimeline(ticks) {
        const focusCmdOverride = (focusCmdInput && focusCmdInput.value) ? focusCmdInput.value.trim() : '';
        const focusArg = focusCmdOverride ? (',' + JSON.stringify(focusCmdOverride)) : '';
        const hasTicks = typeof ticks === 'number' && !Number.isNaN(ticks);
        const ticksArg = hasTicks ? ticks : 'null';
        cs.evalScript('fbjumper_focusTimeline(' + ticksArg + focusArg + ')', function(focusResult) {
            console.log('[FB Jumper] Focus timeline result:', focusResult);
            setFocusStatus('タイムラインフォーカス: ' + (focusResult || '結果なし'));
            if (typeof focusResult === 'string' && focusResult.indexOf('ERR:') === 0) {
                setDiagnostic('focus', 'タイムライン自動フォーカスに失敗しました。Premiereが前面か、macOSならアクセシビリティ許可を確認してください。');
            } else {
                clearDiagnostic('focus');
            }
        });
    }

    function jsxString(value) {
        const safe = String(value || '')
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'");
        return "'" + safe + "'";
    }

    function secondsFromTimecode(code) {
        if (!code) {
            return null;
        }
        const parts = code.split(':').map(Number);
        if (parts.length === 3) {
            const [hours, minutes, seconds] = parts;
            return hours * 3600 + minutes * 60 + seconds;
        }
        if (parts.length === 2) {
            const [minutes, seconds] = parts;
            return minutes * 60 + seconds;
        }
        return null;
    }

    function secondsToTimecode(totalSeconds) {
        const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
        const totalMs = Math.round(safeSeconds * 1000);
        const seconds = Math.floor(totalMs / 1000);
        const ms = totalMs % 1000;
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        const base = (h > 0)
            ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
            : `${m}:${String(s).padStart(2, '0')}`;
        if (ms) {
            return `${base}.${String(Math.floor(ms / 10)).padStart(2, '0')}`;
        }
        return base;
    }

    function truncatedTimecode(totalSeconds) {
        const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
        const h = Math.floor(safeSeconds / 3600);
        const m = Math.floor((safeSeconds % 3600) / 60);
        const s = safeSeconds % 60;
        return (h > 0)
            ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
            : `${m}:${String(s).padStart(2, '0')}`;
    }

    function formatOffset(offsetSeconds) {
        const sign = offsetSeconds >= 0 ? '+' : '-';
        return sign + truncatedTimecode(Math.abs(offsetSeconds)).replace(/^0:/, '');
    }

    function handleResult(result) {
        console.log('[FB Jumper] handleResult called with:', result);
        if (typeof result === 'string') {
            if (result.indexOf('ERR:') === 0) {
                window.alert('FB Jumper エラー\n\n' + result);
            } else if (result === 'OK') {
                // シンプルなOKは何も表示しない
                console.log('[FB Jumper] Success:', result);
            } else if (result.indexOf('Jumped') >= 0) {
                // ジャンプ成功の詳細情報を表示（デバッグ用）
                console.log('[FB Jumper] Jump details:', result);
                // 必要に応じてアラート表示（デバッグ時のみ）
                // window.alert('ジャンプ成功\n\n' + result);
            } else if (result.indexOf('Failed') >= 0) {
                // ジャンプ失敗の詳細を表示
                window.alert('ジャンプ失敗\n\n' + result);
            } else {
                // その他のメッセージ
                console.log('[FB Jumper] Info:', result);
            }
        }
    }

    function extractEntries(text) {
        const lines = text.split(/\r?\n/);
        const entries = [];

        for (let i = 0; i < lines.length; i += 1) {
            const line = lines[i];
            const match = line.match(timePattern);
            if (!match) {
                continue;
            }
            const timestamp = match[1];
            const seconds = secondsFromTimecode(timestamp);
            if (Number.isNaN(seconds) || seconds === null) {
                continue;
            }

            const matchIndex = match.index || 0;
            let remainder = line.slice(matchIndex + timestamp.length).trim();
            const noteParts = [];
            if (remainder) {
                noteParts.push(remainder);
            }

            let j = i + 1;
            while (j < lines.length) {
                const nextLine = lines[j];
                const trimmed = nextLine.trim();
                if (!trimmed) {
                    j += 1;
                    break;
                }
                const nextMatch = trimmed.match(timePattern);
                if (nextMatch && (nextMatch.index || 0) === 0) {
                    break;
                }
                noteParts.push(trimmed);
                j += 1;
            }

            if (j > i + 1) {
                i = j - 1;
            }

            entries.push({
                timestamp,
                seconds,
                note: noteParts.join(' ')
            });
        }

        return entries.sort((a, b) => a.seconds - b.seconds);
    }

    function cloneAnchors(list) {
        return list.map((a) => ({
            sourceSeconds: a.sourceSeconds,
            targetSeconds: a.targetSeconds,
            offsetSeconds: a.offsetSeconds
        }));
    }

    function pushUndoSnapshot() {
        undoStack.push(cloneAnchors(anchors));
        // keep reasonable length
        if (undoStack.length > 50) {
            undoStack.shift();
        }
        updateUndoButton();
    }

    function updateUndoButton() {
        if (undoAnchorsBtn) {
            undoAnchorsBtn.disabled = undoStack.length === 0;
        }
    }

    function applyAnchorsToEntries(entries) {
        if (!anchors.length) {
            return entries.map((entry) => ({
                ...entry,
                adjustedSeconds: entry.seconds,
                offsetSeconds: 0
            }));
        }

        return entries.map((entry) => {
            let applicable = null;
            for (let i = 0; i < anchors.length; i += 1) {
                const anchor = anchors[i];
                if (anchor.sourceSeconds <= entry.seconds) {
                    applicable = anchor;
                } else {
                    break;
                }
            }
            const offsetSeconds = applicable ? applicable.offsetSeconds : 0;
            const adjustedSeconds = Math.max(0, entry.seconds + offsetSeconds);
            return {
                ...entry,
                adjustedSeconds,
                offsetSeconds
            };
        });
    }

    function renderList(entries) {
        listEl.innerHTML = '';
        if (!entries.length) {
            const empty = document.createElement('div');
            empty.className = 'result-row';
            empty.textContent = '解析結果はありません';
            listEl.appendChild(empty);
            return;
        }

        entries.forEach((entry) => {
            const adjustedSeconds = typeof entry.adjustedSeconds === 'number'
                ? entry.adjustedSeconds
                : entry.seconds;
            const offsetSeconds = typeof entry.offsetSeconds === 'number'
                ? entry.offsetSeconds
                : 0;
            const displayTime = truncatedTimecode(adjustedSeconds);

            const row = document.createElement('div');
            row.className = 'result-row';

            const timeBtn = document.createElement('button');
            timeBtn.className = 'time-button';
            timeBtn.textContent = displayTime;
            timeBtn.addEventListener('click', () => {
                // 直前ジャンプ用に記録（補正後の実時間を基準にする）
                lastJumpSourceSeconds = adjustedSeconds;

                const ticks = Math.round(adjustedSeconds * TICKS_PER_SECOND);
                console.log('[FB Jumper] Jumping to:', entry.timestamp, 'adjusted:', displayTime, 'ticks:', ticks);

                // ボタンの状態を「処理中」に
                const originalText = timeBtn.textContent;
                timeBtn.textContent = '...';
                timeBtn.disabled = true;
                
                cs.evalScript('fbjumper_jumpTo(' + ticks + ')', function(result) {
                    console.log('[FB Jumper] Jump result:', result);
                    
                    // ボタンの状態を元に戻す
                    timeBtn.textContent = originalText;
                    timeBtn.disabled = false;
                    // ボタンのフォーカスを外してパネルへのフォーカス戻りを防ぐ
                    try { timeBtn.blur(); } catch (eBlur) {}
                    
                    // 結果に応じて視覚的フィードバック
                    if (result && (result === 'OK' || result.indexOf('Jumped') >= 0)) {
                        // 成功：緑色に一瞬光らせる
                        timeBtn.style.backgroundColor = '#10b981';
                        setTimeout(() => {
                            timeBtn.style.backgroundColor = '';
                        }, 500);
                    } else if (result && result.indexOf('ERR:') === 0) {
                        // エラー：赤色に一瞬光らせる
                        timeBtn.style.backgroundColor = '#ef4444';
                        setTimeout(() => {
                            timeBtn.style.backgroundColor = '';
                        }, 500);
                    }
                    
                    handleResult(result);

                    // タイムラインフォーカスを試行（2段階で再送）
                    focusTimeline(ticks);
                    setTimeout(function() {
                        focusTimeline(ticks);
                        try { document.activeElement && document.activeElement.blur(); } catch (eAct) {}
                    }, 120);
                });
            });

            const note = document.createElement('div');
            note.className = 'note';
            const noteText = document.createElement('div');
            noteText.textContent = entry.note || '';
            note.appendChild(noteText);

            if (offsetSeconds !== 0) {
                const meta = document.createElement('div');
                meta.className = 'note-meta';
                meta.textContent = `元 ${entry.timestamp} / 補正 ${formatOffset(offsetSeconds)}`;
                note.appendChild(meta);
            }

            const checkBtn = document.createElement('button');
            checkBtn.className = 'check-button';
            checkBtn.innerHTML = ''; // 初期状態は空
            checkBtn.title = '対応済みにする';
            
            // ローカルストレージから状態を復元
            const storageKey = CHECK_KEY_PREFIX + entry.timestamp + '-' + entry.note;
            const isChecked = localStorage.getItem(storageKey) === 'true';
            if (isChecked) {
                checkBtn.classList.add('checked');
                checkBtn.innerHTML = '✓';
            }
            
            checkBtn.addEventListener('click', () => {
                // チェック状態をトグル
                if (checkBtn.classList.contains('checked')) {
                    // チェックを外す
                    checkBtn.classList.remove('checked');
                    checkBtn.innerHTML = '';
                    localStorage.removeItem(storageKey);
                } else {
                    // チェックを入れる
                    checkBtn.classList.add('checked');
                    checkBtn.innerHTML = '✓';
                    localStorage.setItem(storageKey, 'true');
                }
            });

            row.appendChild(timeBtn);
            row.appendChild(note);
            row.appendChild(checkBtn);
            listEl.appendChild(row);
        });
    }

    function clearAllChecks() {
        try {
            const keys = [];
            for (let i = 0; i < localStorage.length; i += 1) {
                const k = localStorage.key(i);
                if (k && k.indexOf(CHECK_KEY_PREFIX) === 0) {
                    keys.push(k);
                }
            }
            keys.forEach((k) => localStorage.removeItem(k));
        } catch (e) {
            console.log('[FB Jumper] clear checks failed', e);
        }
        try {
            document.querySelectorAll('.check-button').forEach((btn) => {
                btn.classList.remove('checked');
                btn.innerHTML = '';
            });
        } catch (e2) {
            console.log('[FB Jumper] clear checks UI update failed', e2);
        }
    }

    parseBtn.addEventListener('click', () => {
        const text = fbInput.value || '';
        currentEntries = extractEntries(text);
        renderList(applyAnchorsToEntries(currentEntries));
    });

    // ペーストイベントハンドラー（シンプル版）
    function handlePaste(event) {
        console.log('[FB Jumper] Paste event triggered');
        
        // event.clipboardDataから取得を試みる（最も確実な方法）
        const clipboard = event.clipboardData || window.clipboardData;
        if (clipboard) {
            const text = clipboard.getData('text/plain') || clipboard.getData('text') || clipboard.getData('Text');
            console.log('[FB Jumper] clipboardData result:', text);
            
            if (text && text.length) {
                // デフォルトのペースト動作を防止して、手動で挿入
                event.preventDefault();
                
                const start = fbInput.selectionStart;
                const end = fbInput.selectionEnd;
                const before = fbInput.value.slice(0, start);
                const after = fbInput.value.slice(end);
                
                fbInput.value = before + text + after;
                const newPosition = start + text.length;
                fbInput.setSelectionRange(newPosition, newPosition);
                fbInput.focus();
                
                console.log('[FB Jumper] Paste successful!');
                return;
            }
        }
        
        // clipboardDataが取得できない場合は、デフォルトのペースト動作を許可
        console.log('[FB Jumper] Using default paste behavior');
    }

    // Cmd+V / Ctrl+V のキーボードショートカット
    function handleKeyDown(event) {
        const modifier = isMac ? event.metaKey : event.ctrlKey;
        const isVKey = event.key === 'v' || event.key === 'V' || event.keyCode === 86;
        const isShift = !!event.shiftKey;
        
        if (modifier && isVKey) {
            console.log('[FB Jumper] Cmd+V / Ctrl+V detected in keydown');
            // pasteイベントを待つ
            // フォーカスを確保
            fbInput.focus();
            return;
        }

        // Shift+4 で直前ジャンプを補正点にする
        if (isShift && isAnchorHotkey(event)) {
            console.log('[FB Jumper] Shift+4 detected in keydown');
            event.preventDefault();
            event.stopPropagation();
            addAnchorFromLastJump();
            return;
        }
    }

    function isTimelineFocusShortcut(event) {
        if (!event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) {
            return false;
        }
        if (event.code) {
            return event.code === focusHotkey.code;
        }
        if (event.key && (event.key === focusHotkey.key || event.key === '#')) {
            return true;
        }
        if (typeof event.keyCode === 'number') {
            return event.keyCode === focusHotkey.keyCode;
        }
        return false;
    }

    function isAnchorHotkey(event) {
        if (!event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) {
            return false;
        }
        if (event.code) {
            return event.code === anchorHotkey.code;
        }
        if (event.key && (event.key === anchorHotkey.key || event.key === '$')) {
            return true;
        }
        if (typeof event.keyCode === 'number') {
            return event.keyCode === anchorHotkey.keyCode;
        }
        return false;
    }

    function focusTimelineFromCurrentPlayhead() {
        cs.evalScript('fbjumper_getPlayheadTicks()', function(result) {
            const parsed = parsePlayheadResult(result);
            if (parsed.ok && typeof parsed.ticks === 'number') {
                focusTimeline(parsed.ticks);
                return;
            }
            focusTimeline(null);
        });
    }

    // CEPグローバルキーイベント（パネルがキーを受け取れない場合の保険）
    function registerGlobalHotkeys() {
        const keyDefs = [
            { keyCode: focusHotkey.keyCode, shiftKey: true }, // Digit3
            { keyCode: 20, shiftKey: true } // US配列の3のkeyCode
        ];
        let registered = false;

        function tryRegister(def) {
            try {
                cs.registerKeyEventsInterest(def);
                registered = true;
                console.log('[FB Jumper] Global hotkeys registered via CSXS with', def);
            } catch (e) {
                console.log('[FB Jumper] registerKeyEventsInterest failed with', def, e);
            }
        }

        // 試行1: 配列そのまま
        tryRegister(keyDefs);
        // 試行2: 文字列化（ホストによっては文字列を要求）
        if (!registered) {
            tryRegister(JSON.stringify(keyDefs));
        }
        if (!registered) {
            setDiagnostic('hotkeys', 'Shift+3のグローバル取得に失敗しました。パネル内のShift+3か「手動フォーカス」を使ってください。');
        } else {
            clearDiagnostic('hotkeys');
        }

        cs.addEventListener('com.adobe.csxs.events.keyDown', function(event) {
            try {
                const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                if (!payload) { return; }
                const kc = payload.keyCode;
                const isShift = !!payload.shiftKey;
                const isCtrl = !!payload.ctrlKey;
                const isAlt = !!payload.altKey;
                const isMeta = !!payload.metaKey;
                if (!isShift || isCtrl || isAlt || isMeta) { return; }
                if (kc === focusHotkey.keyCode || kc === 20) {
                    console.log('[FB Jumper] Global key event Shift+3 captured via CSXS');
                    setFocusStatus('タイムラインフォーカス: Shift+3 (CSXS) を受信 → 実行中...');
                    focusTimelineFromCurrentPlayhead();
                }
            } catch (eKey) {
                console.log('[FB Jumper] Global key handler error', eKey);
            }
        });
    }

    // document全体でCmd+Vを捕捉（Premiereがキーを取る前に）
    document.addEventListener('keydown', function(event) {
        const modifier = isMac ? event.metaKey : event.ctrlKey;
        const isVKey = event.key === 'v' || event.key === 'V' || event.keyCode === 86;
        
        if (modifier && isVKey) {
            console.log('[FB Jumper] Cmd+V detected on document level');
            // textareaにフォーカスを当てる
            fbInput.focus();
            // pasteイベントが発火するのを待つ
            return;
        }

        // Shift+3 がPremiereに届かない問題の回避: パネル上で押されたときは自前でタイムラインをアクティブ化
        if (isTimelineFocusShortcut(event)) {
            console.log('[FB Jumper] Shift+3 detected in panel, focusing timeline');
            event.preventDefault();
            event.stopPropagation();
            setFocusStatus('タイムラインフォーカス: Shift+3を受信 → 実行中...');
            focusTimelineFromCurrentPlayhead();
            return;
        }

        // Shift+4 で直前ジャンプを補正点にする
        if (isAnchorHotkey(event)) {
            console.log('[FB Jumper] Shift+4 detected on document level, adding anchor from last jump');
            event.preventDefault();
            event.stopPropagation();
            addAnchorFromLastJump();
        }
    }, true); // キャプチャフェーズで捕捉

    // イベントリスナーを登録
    fbInput.addEventListener('paste', handlePaste);
    fbInput.addEventListener('keydown', handleKeyDown);
    
    // textareaにフォーカスを当てて、確実にイベントを受け取れるようにする
    fbInput.addEventListener('focus', function() {
        console.log('[FB Jumper] Textarea focused');
    });
    
    // textareaをクリックしたときに確実にフォーカスを当てる
    fbInput.addEventListener('click', function() {
        fbInput.focus();
        console.log('[FB Jumper] Textarea clicked and focused');
    });

    // パネルがアクティブになったときにフォーカスを戻す
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
            setTimeout(function() {
                fbInput.focus();
                console.log('[FB Jumper] Panel became visible, focus restored');
            }, 100);
        }
    });

    clearBtn.addEventListener('click', () => {
        fbInput.value = '';
        listEl.innerHTML = '';
        currentEntries = [];
    });

    // 初期化時にtextareaにフォーカスを当てる
    setTimeout(function() {
        fbInput.focus();
        console.log('[FB Jumper] Initial focus set to textarea');
    }, 300);

    function persistAnchors() {
        try {
            localStorage.setItem(STORAGE_KEYS.anchors, JSON.stringify(anchors));
        } catch (e) {
            console.log('[FB Jumper] anchor persist failed', e);
        }
    }

    function loadAnchors() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.anchors);
            if (!raw) {
                anchors = [];
                return;
            }
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                anchors = parsed
                    .filter((a) => typeof a.sourceSeconds === 'number' && typeof a.targetSeconds === 'number')
                    .map((a) => ({
                        ...a,
                        offsetSeconds: a.targetSeconds - a.sourceSeconds
                    }))
                    .sort((a, b) => a.sourceSeconds - b.sourceSeconds);
            }
        } catch (e) {
            anchors = [];
            console.log('[FB Jumper] anchor load failed', e);
        }
    }

    function renderAnchors() {
        anchorListEl.innerHTML = '';
        if (!anchors.length) {
            const empty = document.createElement('div');
            empty.className = 'anchor-pill';
            empty.textContent = '補正点はまだありません';
            anchorListEl.appendChild(empty);
            return;
        }
        anchors.forEach((anchor) => {
            const pill = document.createElement('div');
            pill.className = 'anchor-pill';

            const label = document.createElement('div');
            label.innerHTML = `<strong>${truncatedTimecode(anchor.sourceSeconds)}</strong> → ${truncatedTimecode(anchor.targetSeconds)}`;

            const offset = document.createElement('div');
            offset.className = 'anchor-offset ' + (anchor.offsetSeconds >= 0 ? 'positive' : 'negative');
            offset.textContent = `補正 ${formatOffset(anchor.offsetSeconds)}`;

            pill.appendChild(label);
            pill.appendChild(offset);
            anchorListEl.appendChild(pill);
        });
    }

    function refreshList() {
        renderList(applyAnchorsToEntries(currentEntries));
    }

    // フォーカス用コマンドIDの永続化
    const STORAGE_FOCUS_CMD = 'fbj-focus-cmd';
    function loadFocusCmd() {
        try {
            const v = localStorage.getItem(STORAGE_FOCUS_CMD) || '';
            if (focusCmdInput) {
                focusCmdInput.value = v;
            }
        } catch (e) {
            console.log('[FB Jumper] focus cmd load failed', e);
        }
    }
    function saveFocusCmd(v) {
        try {
            localStorage.setItem(STORAGE_FOCUS_CMD, v || '');
        } catch (e) {
            console.log('[FB Jumper] focus cmd save failed', e);
        }
    }
    if (applyFocusCmdBtn) {
        applyFocusCmdBtn.addEventListener('click', () => {
            const v = focusCmdInput ? focusCmdInput.value.trim() : '';
            saveFocusCmd(v);
            setFocusStatus('タイムラインフォーカス: コマンドIDを設定しました (' + (v || '未設定') + ')');
        });
    }
    if (resetFocusCmdBtn) {
        resetFocusCmdBtn.addEventListener('click', () => {
            if (focusCmdInput) {
                focusCmdInput.value = '';
            }
            saveFocusCmd('');
            setFocusStatus('タイムラインフォーカス: コマンドIDをリセットしました');
        });
    }
    if (detectFocusCmdBtn) {
        detectFocusCmdBtn.addEventListener('click', () => {
            cs.evalScript('fbjumper_guessTimelineCmdId()', function(result) {
                let id = '';
                let fallback = false;

                if (!result || (typeof result === 'string' && result.indexOf('ERR:') === 0)) {
                    id = DEFAULT_FOCUS_CMD_IDS;
                    fallback = true;
                } else {
                    id = String(result).replace(/^OK:?/, '').trim() || DEFAULT_FOCUS_CMD_IDS;
                }

                if (focusCmdInput) {
                    focusCmdInput.value = id;
                }
                saveFocusCmd(id);
                setFocusStatus('タイムラインフォーカス: 検出したIDを設定しました (' + id + (fallback ? ' / fallback' : '') + ')');
            });
        });
    }

    if (clearChecksBtn) {
        clearChecksBtn.addEventListener('click', () => {
            clearAllChecks();
        });
    }
    if (clearChecksInlineBtn) {
        clearChecksInlineBtn.addEventListener('click', () => {
            clearAllChecks();
        });
    }

    if (focusNowBtn) {
        focusNowBtn.addEventListener('click', () => {
            setFocusStatus('タイムラインフォーカス: 手動実行中...');
            focusTimelineFromCurrentPlayhead();
        });
    }

    function parsePlayheadResult(result) {
        if (!result) {
            return { ok: false, error: '再生位置を取得できませんでした' };
        }
        if (typeof result === 'string' && result.indexOf('ERR:') === 0) {
            return { ok: false, error: result.replace(/^ERR:\s*/, '') };
        }
        const cleaned = String(result).replace(/^OK[:\s]*/, '');
        const ticks = Number(cleaned);
        if (Number.isNaN(ticks)) {
            return { ok: false, error: '再生位置の値が不明です' };
        }
        const seconds = ticks / TICKS_PER_SECOND;
        return { ok: true, ticks, seconds };
    }

    function updateSequenceDiagnosticFromPlayhead(parsed, raw) {
        if (!parsed || !parsed.ok) {
            const err = String(parsed && parsed.error ? parsed.error : raw || '').toLowerCase();
            if (err.indexOf('no active sequence') >= 0 || err.indexOf('no project') >= 0) {
                setDiagnostic('sequence', 'シーケンスがアクティブではありません。解析や補正の前にシーケンスを選択してください。');
            } else {
                setDiagnostic('sequence', 'Premiereとの通信に失敗しました。デバッグモードやCEPキャッシュを確認してください。');
            }
            return;
        }
        clearDiagnostic('sequence');
    }

    function runStartupDiagnostics() {
        if (!window.__adobe_cep__) {
            setDiagnostic('cep', 'CEP環境が検出できません。Premiere Pro内で開いてください。');
        } else {
            clearDiagnostic('cep');
        }
        cs.evalScript('fbjumper_getPlayheadTicks()', function(result) {
            const parsed = parsePlayheadResult(result);
            updateSequenceDiagnosticFromPlayhead(parsed, result);
        });
    }

    function addAnchor(sourceSeconds, targetSeconds) {
        anchors.push({
            sourceSeconds,
            targetSeconds,
            offsetSeconds: targetSeconds - sourceSeconds
        });
        anchors.sort((a, b) => a.sourceSeconds - b.sourceSeconds);
        persistAnchors();
        renderAnchors();
        refreshList();
        updateUndoButton();
    }

    function requestPlayheadSeconds(callback) {
        cs.evalScript('fbjumper_getPlayheadTicks()', function(result) {
            const parsed = parsePlayheadResult(result);
            updateSequenceDiagnosticFromPlayhead(parsed, result);
            if (!parsed.ok) {
                window.alert('再生位置の取得に失敗しました。\nPremiereのシーケンスをアクティブにしてください。\n\n詳細: ' + (parsed.error || result));
                return;
            }
            callback(parsed.seconds);
        });
    }

    addAnchorBtn.addEventListener('click', () => {
        const sourceSeconds = secondsFromTimecode(anchorOriginalInput.value.trim());
        if (sourceSeconds === null || Number.isNaN(sourceSeconds)) {
            window.alert('元のフィードバック時刻を入力してください（例: 5:48 / 1:02:03）');
            anchorOriginalInput.focus();
            return;
        }
        pushUndoSnapshot();
        requestPlayheadSeconds((targetSeconds) => {
            addAnchor(sourceSeconds, targetSeconds);
            anchorOriginalInput.value = '';
        });
    });

    function addAnchorFromLastJump() {
        if (lastJumpSourceSeconds === null || Number.isNaN(lastJumpSourceSeconds)) {
            window.alert('直前にジャンプしたタイムスタンプがありません。先にタイムスタンプボタンをクリックしてください。');
            return;
        }
        pushUndoSnapshot();
        requestPlayheadSeconds((targetSeconds) => {
            addAnchor(lastJumpSourceSeconds, targetSeconds);
            setFocusStatus('補正点を追加しました: ' + truncatedTimecode(lastJumpSourceSeconds) + ' → ' + truncatedTimecode(targetSeconds));
        });
    }

    if (addAnchorFromLastJumpBtn) {
        addAnchorFromLastJumpBtn.addEventListener('click', addAnchorFromLastJump);
    }

    clearAnchorsBtn.addEventListener('click', () => {
        if (!anchors.length) {
            return;
        }
        pushUndoSnapshot();
        anchors = [];
        persistAnchors();
        renderAnchors();
        refreshList();
        updateUndoButton();
    });

    undoAnchorsBtn.addEventListener('click', () => {
        if (!undoStack.length) {
            return;
        }
        const prev = undoStack.pop();
        if (Array.isArray(prev)) {
            anchors = prev
                .filter((a) => typeof a.sourceSeconds === 'number' && typeof a.targetSeconds === 'number')
                .map((a) => ({
                    ...a,
                    offsetSeconds: a.targetSeconds - a.sourceSeconds
                }))
                .sort((a, b) => a.sourceSeconds - b.sourceSeconds);
            persistAnchors();
            renderAnchors();
            refreshList();
        }
        updateUndoButton();
    });

    // Boot: ensure QE is enabled before first action
    cs.evalScript('fbjumper_enableQE()', function(result) {
        console.log('[FB Jumper] QE Enable result:', result);
        handleResult(result);
        if (typeof result === 'string' && result.indexOf('ERR:') === 0) {
            setDiagnostic('qe', 'QE APIが有効化できませんでした。再生位置の取得やジャンプの補助が失敗する場合があります。');
        } else {
            clearDiagnostic('qe');
        }
    });

    // Boot: register global hotkeys so Shift+3 is delivered even if DOM keydown is skipped
    registerGlobalHotkeys();

    // Boot: load anchors and render
    loadAnchors();
    renderAnchors();
    loadFocusCmd();
    runStartupDiagnostics();
})();
