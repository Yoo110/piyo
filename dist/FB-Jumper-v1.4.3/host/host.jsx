// ExtendScript では Array.prototype.indexOf がサポートされていない環境があるため、ポリフィルを用意
if (typeof Array.prototype.indexOf !== "function") {
    Array.prototype.indexOf = function(searchElement, fromIndex) {
        var len = this.length >>> 0;
        var from = Number(fromIndex) || 0;
        if (from < 0) {
            from = Math.max(len + from, 0);
        }
        for (var i = from; i < len; i++) {
            if (this[i] === searchElement) {
                return i;
            }
        }
        return -1;
    };
}

// ExtendScript では Array.prototype.indexOf がサポートされていないため、ヘルパー関数を使用
function fbjumper_arrayContains(arr, value) {
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] === value) {
            return true;
        }
    }
    return false;
}

function fbjumper_result(ok, message) {
    if (ok) {
        return "OK" + (message ? (": " + message) : "");
    }
    var detail = (typeof message === "string" && message.length) ? message : "Unknown error.";
    return "ERR: " + detail;
}

function fbjumper_enableQE() {
    try {
        if (typeof qe === "undefined") {
            app.enableQE();
        }
        if (typeof qe === "undefined") {
            return fbjumper_result(false, "QE unavailable.");
        }
        return fbjumper_result(true);
    } catch (e) {
        return fbjumper_result(false, e.toString());
    }
}

function fbjumper_getActiveSequence() {
    if (!app.project || !app.project.activeSequence) {
        return null;
    }
    return app.project.activeSequence;
}

function fbjumper_activatePremiere() {
    // macOS: Premiere Pro をアクティブにしてタイムラインにフォーカスを移す
    if ($.os && $.os.toLowerCase().indexOf("mac") !== -1) {
        try {
            var appNames = [
                "Adobe Premiere Pro 2025",
                "Adobe Premiere Pro (Beta)",
                "Premiere Pro (Beta)",
                "Adobe Premiere Pro 2024",
                "Adobe Premiere Pro",
                "Premiere Pro"
            ];
            for (var i = 0; i < appNames.length; i++) {
                try {
                    var cmd = 'osascript -e \'tell application "' + appNames[i] + '" to activate\'';
                    app.system.callSystem(cmd);
                    return true;
                } catch (e) {
                    // try next
                }
            }
        } catch (e) {
            // ignore
        }
    }
    // Windows: PowerShell を使ってPremiere Pro をアクティブに
    if ($.os && $.os.toLowerCase().indexOf("windows") !== -1) {
        try {
            var psCmd = 'powershell.exe -NoProfile -NonInteractive -Command "(Get-Process | Where-Object {$_.MainWindowTitle -like \'*Premiere Pro*\'} | Select-Object -First 1).MainWindowHandle | ForEach-Object { Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.Interaction]::AppActivate($_) }"';
            app.system.callSystem(psCmd);
            return true;
        } catch (e) {
            // ignore
        }
    }
    return false;
}

function fbjumper_jumpTo(ticks) {
    try {
        var activeSeq = fbjumper_getActiveSequence();
        if (!activeSeq) {
            return fbjumper_result(false, "No active sequence.");
        }
        var jumped = false;
        try {
            activeSeq.setPlayerPosition(ticks.toString());
            jumped = true;
        } catch (e1) {
            var qeStatus = fbjumper_enableQE();
            if (qeStatus.indexOf("ERR:") === 0) {
                return fbjumper_result(false, "Standard API failed: " + e1.toString() + ". QE unavailable.");
            }
            try {
                var qeProject = qe.project;
                var qeSequence = qeProject.getActiveSequence();
                if (qeSequence && qeSequence.player) {
                    qeSequence.player.position = ticks;
                    jumped = true;
                }
            } catch (e2) {
                return fbjumper_result(false, "All methods failed. Standard: " + e1.toString() + ", QE: " + e2.toString());
            }
        }
        
        if (jumped) {
            // ジャンプ成功後、Premiere Pro をアクティブにしてタイムラインにフォーカスを移す
            fbjumper_activatePremiere();
            return fbjumper_result(true, "OK");
        }
        return fbjumper_result(false, "No jump method succeeded");
    } catch (e) {
        return fbjumper_result(false, e.toString());
    }
}

function fbjumper_addMarker(ticks, name, comment) {
    try {
        var activeSeq = fbjumper_getActiveSequence();
        if (!activeSeq) {
            return fbjumper_result(false, "No active sequence.");
        }
        var marker = activeSeq.markers.createMarker(ticks);
        if (!marker) {
            return fbjumper_result(false, "Failed to create marker.");
        }
        marker.name = name || "";
        marker.comments = comment || "";
        return fbjumper_result(true);
    } catch (e) {
        return fbjumper_result(false, e.toString());
    }
}

function fbjumper_getClipboard() {
    try {
        var command;
        if ($.os && $.os.toLowerCase().indexOf("windows") !== -1) {
            command = 'powershell.exe -NoProfile -NonInteractive -Command "[Console]::OutEncoding=[System.Text.Encoding]::UTF8; Get-Clipboard -Raw"';
        } else {
            command = "pbpaste";
        }
        if (typeof app.system !== "undefined") {
            var result = app.system.callSystem(command);
            if (typeof result === "string" && result.length > 0) {
                return result;
            }
        }
        var tmpFile = new File(Folder.temp + "/fb_jumper_clipboard.txt");
        var cmd;
        if ($.os && $.os.toLowerCase().indexOf("windows") !== -1) {
            cmd = 'cmd.exe /c powershell.exe -NoProfile -NonInteractive -Command "Get-Clipboard | Out-File -Encoding UTF8 \'' + tmpFile.fsName.replace(/\\/g, '\\\\') + '\'"';
        } else {
            cmd = 'pbpaste > "' + tmpFile.fsName + '"';
        }
        tmpFile.execute();
        app.system.callSystem(cmd);
        if (tmpFile.exists) {
            tmpFile.encoding = "UTF-8";
            tmpFile.open("r");
            var content = tmpFile.read();
            tmpFile.close();
            tmpFile.remove();
            if (typeof content === "string" && content.length > 0) {
                return content;
            }
        }
        return "ERR: クリップボードにアクセスできません。CEP clipboard APIを使用してください。";
    } catch (e) {
        return "ERR: " + e.toString();
    }
}

function fbjumper_getPlayheadTicks() {
    try {
        var activeSeq = fbjumper_getActiveSequence();
        if (!activeSeq) {
            return fbjumper_result(false, "No active sequence.");
        }
        if (typeof activeSeq.getPlayerPosition === "function") {
            var pos = activeSeq.getPlayerPosition();
            if (pos && typeof pos.ticks !== "undefined") {
                return "OK:" + pos.ticks;
            }
            if (typeof pos === "string" || typeof pos === "number") {
                return "OK:" + pos;
            }
        }
        var qeStatus = fbjumper_enableQE();
        if (qeStatus.indexOf("ERR:") === 0) {
            return fbjumper_result(false, "QE unavailable.");
        }
        if (typeof qe !== "undefined" && qe.project && qe.project.getActiveSequence) {
            var qeSeq = qe.project.getActiveSequence();
            if (qeSeq && qeSeq.player && typeof qeSeq.player.position !== "undefined") {
                return "OK:" + qeSeq.player.position;
            }
        }
        return fbjumper_result(false, "No playhead position available.");
    } catch (e) {
        return fbjumper_result(false, e.toString());
    }
}

function fbjumper_focusTimeline(ticks, cmdIdOverride) {
    var activeSeq = fbjumper_getActiveSequence();
    if (!activeSeq) {
        return fbjumper_result(false, "No active sequence.");
    }

    var success = false;
    var logs = [];

    function mark(ok, msg) {
        logs.push((ok ? "OK:" : "NG:") + msg);
        if (ok) {
            success = true;
        }
        return ok;
    }

    function logError(desc, err) {
        try {
            logs.push("EX:" + desc + ":" + err);
        } catch (eLog) {
            // ignore
        }
    }

    function safe(desc, fn) {
        try {
            return fn();
        } catch (eSafe) {
            logError(desc, eSafe);
            return null;
        }
    }

    // Bring Premiere to foreground before issuing commands
    safe("activatePremiere", function() {
        fbjumper_activatePremiere();
    });

    // openSequence API (最小限だけ残す)
    safe("openSequence", function() {
        if (typeof app.project.openSequence === "function" && typeof activeSeq.sequenceID !== "undefined") {
            app.project.openSequence(activeSeq.sequenceID);
            mark(true, "openSequence");
        } else {
            mark(false, "openSequence missing");
        }
    });

    // クリップを選択してタイムラインを強制アクティブ化
    safe("selectClip", function() {
        var targetTicks = null;
        if (ticks !== null && ticks !== undefined && ticks !== "") {
            var num = Number(ticks);
            if (!isNaN(num)) { targetTicks = num; }
        }
        function selectClip(trackList) {
            if (!trackList || !trackList.numTracks) { return false; }
            for (var ti = 0; ti < trackList.numTracks; ti += 1) {
                try {
                    var track = trackList[ti];
                    if (!track || !track.clips || !track.clips.numItems) { continue; }
                    for (var ci = 0; ci < track.clips.numItems; ci += 1) {
                        var clip = track.clips[ci];
                        if (!clip || !clip.start || clip.start.ticks === undefined) { continue; }
                        var start = Number(clip.start.ticks);
                        var end = clip.end && clip.end.ticks !== undefined ? Number(clip.end.ticks) : start + Number(clip.duration && clip.duration.ticks ? clip.duration.ticks : 0);
                        if (targetTicks === null || (targetTicks >= start && targetTicks <= end)) {
                            clip.setSelected(true, true);
                            return true;
                        }
                    }
                } catch (eClip) {}
            }
            return false;
        }
        if (selectClip(activeSeq.videoTracks) || selectClip(activeSeq.audioTracks)) {
            mark(true, "selectedClip");
        } else {
            mark(false, "selectClip");
        }
    });

    // 最小限の commandId を試す（Shift+3系）
    safe("commandIds", function() {
        var ids = [];

        function pushId(raw) {
            var n = Number(raw);
            if (!isNaN(n) && n > 0 && ids.indexOf(n) === -1) {
                ids.push(n);
            }
        }

        function parseIds(source) {
            try {
                if (source === null || source === undefined) { return; }

                // 文字列化を安全に行う（Array/String オブジェクト対策）
                var txtRaw;
                if (typeof source === "string") {
                    txtRaw = source;
                } else if (source && typeof source.join === "function") {
                    txtRaw = source.join(",");
                } else {
                    txtRaw = String(source);
                }

                // OK: のプレフィクスを除去
                var txt = (txtRaw || "");
                // replace/trimが存在しないケースに備えて段階的に処理
                if (typeof txt.replace === "function") {
                    txt = txt.replace(/^OK[:\s]*/, "");
                }
                if (typeof txt.trim === "function") {
                    txt = txt.trim();
                } else {
                    // trimが無い場合は手動で前後の空白を除去
                    txt = txt.replace(/^\s+/, "").replace(/\s+$/, "");
                }

                if (!txt.length) { return; }

                var parts = txt.split(/[^0-9]+/);
                for (var pi = 0; pi < parts.length; pi += 1) {
                    if (parts[pi].length) {
                        pushId(parts[pi]);
                    }
                }
            } catch (eParse) {
                logError("parseIds", eParse);
            }
        }

        // 1. パネルから渡されたコマンドIDを最優先で利用
        parseIds(cmdIdOverride);

        // 2. 環境に応じてメニュー名からIDを推測（日本語/英語両対応）
        try {
            var guessed = fbjumper_guessTimelineCmdId();
            parseIds(guessed);
        } catch (eGuess) {
            logError("guessCmdId", eGuess);
        }

        // 3. 汎用的なデフォルトID（Shift+3 系）
        var fallbackIds = [235, 234, 231];
        for (var fi = 0; fi < fallbackIds.length; fi += 1) {
            pushId(fallbackIds[fi]);
        }

        // app/executeCommand が使えない環境ではスキップ
        if (typeof app === "undefined") { return; }
        if (typeof app.executeCommand !== "function") { return; }

        for (var ii = 0; ii < ids.length; ii += 1) {
            try {
                if (app.executeCommand(ids[ii])) {
                    mark(true, "cmdId:" + ids[ii]);
                    // 成功しても break せず全候補を送ってフォーカスを強制
                }
            } catch (eId) {
                logError("cmdId:" + ids[ii], eId);
            }
        }
    });

    // macOS: Shift+3 キー送信（Premiereをアクティブ化してから送信）
    // アクセシビリティ許可が必要になる場合があります。
    safe("osascript shift+3", function() {
        if ($.os && $.os.toLowerCase().indexOf("mac") !== -1) {
            // プロセス指定で確実にキーストロークを送る（前面化→短い待ち→Shift+3）
            var osaCommands = [
                'osascript -e \'tell application "Adobe Premiere Pro 2025" to activate\' -e \'delay 0.05\' -e \'tell application "System Events" to tell process "Adobe Premiere Pro 2025" to keystroke "3" using {shift down}\'',
                'osascript -e \'tell application "Adobe Premiere Pro (Beta)" to activate\' -e \'delay 0.05\' -e \'tell application "System Events" to tell process "Adobe Premiere Pro (Beta)" to keystroke "3" using {shift down}\'',
                'osascript -e \'tell application "Premiere Pro (Beta)" to activate\' -e \'delay 0.05\' -e \'tell application "System Events" to tell process "Premiere Pro (Beta)" to keystroke "3" using {shift down}\'',
                'osascript -e \'tell application "Adobe Premiere Pro 2024" to activate\' -e \'delay 0.05\' -e \'tell application "System Events" to tell process "Adobe Premiere Pro 2024" to keystroke "3" using {shift down}\'',
                'osascript -e \'tell application "Adobe Premiere Pro" to activate\' -e \'delay 0.05\' -e \'tell application "System Events" to tell process "Adobe Premiere Pro" to keystroke "3" using {shift down}\'',
                'osascript -e \'tell application "Premiere Pro" to activate\' -e \'delay 0.05\' -e \'tell application "System Events" to tell process "Premiere Pro" to keystroke "3" using {shift down}\'',
                'osascript -e \'tell application "Adobe Premiere Pro 2025" to activate\' -e \'delay 0.05\' -e \'tell application "System Events" to tell process "Adobe Premiere Pro 2025" to key code 20 using {shift down}\'',
                'osascript -e \'tell application "Adobe Premiere Pro (Beta)" to activate\' -e \'delay 0.05\' -e \'tell application "System Events" to tell process "Adobe Premiere Pro (Beta)" to key code 20 using {shift down}\'',
                'osascript -e \'tell application "Premiere Pro (Beta)" to activate\' -e \'delay 0.05\' -e \'tell application "System Events" to tell process "Premiere Pro (Beta)" to key code 20 using {shift down}\'',
                'osascript -e \'tell application "Adobe Premiere Pro 2024" to activate\' -e \'delay 0.05\' -e \'tell application "System Events" to tell process "Adobe Premiere Pro 2024" to key code 20 using {shift down}\'',
                'osascript -e \'tell application "Adobe Premiere Pro" to activate\' -e \'delay 0.05\' -e \'tell application "System Events" to tell process "Adobe Premiere Pro" to key code 20 using {shift down}\'',
                'osascript -e \'tell application "Premiere Pro" to activate\' -e \'delay 0.05\' -e \'tell application "System Events" to tell process "Premiere Pro" to key code 20 using {shift down}\''
            ];
            var osaOk = false;
            for (var oi = 0; oi < osaCommands.length; oi += 1) {
                try {
                    var res = app.system.callSystem(osaCommands[oi]);
                    osaOk = true;
                    mark(true, "osascript shift+3 (" + oi + "):" + res);
                    break;
                } catch (eOs) {
                    // keep trying next (失敗してもNGにしない)
                }
            }
            // 失敗してもNGにしない（他手段に任せる）
        }
    });

    // QE で bringToFront を試す（成功しても失敗してもログだけ）
    safe("qe.bringToFront", function() {
        if (typeof qe !== "undefined" && qe.project && qe.project.getActiveSequence) {
            var qes = qe.project.getActiveSequence();
            if (qes && typeof qes.bringToFront === "function") {
                try { qes.bringToFront(); mark(true, "qe.bringToFront"); } catch (eB) { logError("qe.bringToFront", eB); }
            }
        }
    });

    // 最小限の commandId を試す（Shift+3系）
    safe("commandIds", function() {
        var ids = [];

        function pushId(raw) {
            var n = Number(raw);
            if (!isNaN(n) && n > 0 && ids.indexOf(n) === -1) {
                ids.push(n);
            }
        }

        function parseIds(source) {
            try {
                if (source === null || source === undefined) { return; }

                // 文字列化を安全に行う（Array/String オブジェクト対策）
                var txtRaw;
                if (typeof source === "string") {
                    txtRaw = source;
                } else if (source && typeof source.join === "function") {
                    txtRaw = source.join(",");
                } else {
                    txtRaw = String(source);
                }

                var txt = (txtRaw || "");
                if (typeof txt.replace === "function") {
                    txt = txt.replace(/^OK[:\s]*/, "");
                }
                if (typeof txt.trim === "function") {
                    txt = txt.trim();
                } else {
                    txt = txt.replace(/^\s+/, "").replace(/\s+$/, "");
                }

                if (!txt.length) { return; }

                var parts = txt.split(/[^0-9]+/);
                for (var pi = 0; pi < parts.length; pi += 1) {
                    if (parts[pi].length) {
                        pushId(parts[pi]);
                    }
                }
            } catch (eParse) {
                logError("parseIds", eParse);
            }
        }

        // 1. パネルから渡されたコマンドIDを最優先で利用
        parseIds(cmdIdOverride);

        // 2. 環境に応じてメニュー名からIDを推測（日本語/英語両対応）
        try {
            var guessed = fbjumper_guessTimelineCmdId();
            parseIds(guessed);
        } catch (eGuess) {
            logError("guessCmdId", eGuess);
        }

        // 3. 汎用的なデフォルトID（Shift+3 系）
        var fallbackIds = [235, 234, 231];
        for (var fi = 0; fi < fallbackIds.length; fi += 1) {
            pushId(fallbackIds[fi]);
        }

        var executed = false;

        // app/executeCommand が使えない環境ではスキップ
        if (typeof app === "undefined") { return; }
        if (typeof app.executeCommand !== "function") { return; }

        for (var ii = 0; ii < ids.length; ii += 1) {
            try {
                if (app.executeCommand(ids[ii])) {
                    mark(true, "cmdId:" + ids[ii]);
                    executed = true;
                    break;
                }
            } catch (eId) {
                logError("cmdId:" + ids[ii], eId);
            }
        }
    });

    if (success) {
        return fbjumper_result(true, logs.join(" / "));
    }
    return fbjumper_result(false, logs.join(" / "));
}

// タイムライン/シーケンス系コマンドID推測（パネル側から呼び出し）
function fbjumper_guessTimelineCmdId() {
    try {
        var names = [
            "タイムライン (T)", "タイムライン(T)", "タイムライン　(T)", "タイムライン",
            "タイムライン（T）", "タイムライン　（T）", "タイムラインパネル", "タイムラインパネル (T)", "タイムラインパネル（T）",
            "Timeline (T)", "Timeline(T)", "Timeline", "Timeline Panel", "Timeline Panel (T)",
            "シーケンス", "シーケンス (T)", "シーケンス(T)", "シーケンスパネル", "シーケンスパネル (T)",
            "Sequence", "Sequence (T)", "Sequence(T)", "Sequence Panel", "Sequence Panel (T)"
        ];
        for (var i = 0; i < names.length; i += 1) {
            try {
                var cmd = app.findMenuCommandId(names[i]);
                if (cmd && cmd !== 0) {
                    return "OK:" + cmd;
                }
            } catch (e) {
                // continue
            }
        }

        // 見つからなくてもデフォルト候補（Shift+3系）を返す
        return "OK:235,234,231";
    } catch (e) {
        // 失敗してもデフォルト候補を返す
        return "OK:235,234,231";
    }
}
