/**
 * SCORM API Wrapper (Lightweight / Cross-Version Support)
 * Source: Based on common SCORM patterns and simplified API wrappers (like those by SCORM.com or Pipwerks).
 *
 * This file provides the necessary functions (doLMSInitialize, doLMSSetValue, etc.)
 * that your sketch.js calls, regardless of whether it's SCORM 1.2 or SCORM 2004.
 */

var scorm = {};

// --- Configuration ---
scorm.version = null; // '1.2' or '2004'
scorm.debug = true;
scorm.isInitialized = false;
scorm.mockMode = false; // 新增：模擬模式旗標

// --- API Discovery (Internal) ---
scorm.findAPITries = 0;
scorm.maxAPITries = 500;
scorm.API = null;

/**
 * 模擬模式下的 SCORM 數據儲存 (僅用於本地測試)
 */
scorm.mockData = {
    'cmi.core.lesson_status': 'not attempted',
    'cmi.completion_status': 'not attempted',
    'cmi.success_status': 'unknown',
    'cmi.score.raw': '0',
    'cmi.score.max': '100',
    'cmi.score.min': '0',
    'cmi.exit': ''
};

/**
 * 創建一個假的 SCORM API 物件 (用於模擬模式)
 */
scorm.createMockAPI = function() {
    scorm.log("Creating SCORM Mock API for local testing.");
    scorm.mockMode = true;
    scorm.version = '2004'; // 模擬 2004 規範

    // 模擬 SCORM 2004 接口
    return {
        Initialize: function() { return 'true'; },
        Terminate: function() { return 'true'; },
        GetValue: function(element) {
            var value = scorm.mockData[element] || "";
            scorm.log("[MOCK] GetValue: " + element + " = " + value);
            return value;
        },
        SetValue: function(element, value) {
            scorm.mockData[element] = value.toString();
            scorm.log("[MOCK] SetValue: " + element + " = " + value);
            return 'true';
        },
        Commit: function() {
            scorm.log("[MOCK] Commit successful.");
            return 'true';
        },
        GetLastError: function() { return '0'; },
        GetErrorString: function() { return 'No error'; },
        // 兼容 SCORM 1.2 的模擬方法
        LMSInitialize: function() { return this.Initialize(); },
        LMSFinish: function() { return this.Terminate(); },
        LMSGetValue: function(element) { return this.GetValue(element); },
        LMSSetValue: function(element, value) { return this.SetValue(element, value); },
        LMSCommit: function() { return this.Commit(); },
        LMSGetLastError: function() { return this.GetLastError(); },
        LMSGetErrorString: function() { return this.GetErrorString(); }
    };
};


scorm.getAPI = function() {
    var win = window;

    // 1. 檢查是否已找到 API
    if (scorm.API) {
        return scorm.API;
    }

    // 2. 搜尋真正的 LMS API
    var findAPI = function(targetWindow) {
        var api = null;
        while ((targetWindow.parent != null) && (targetWindow.parent != targetWindow)) {
            if (targetWindow.parent.API_1484_11) {
                api = targetWindow.parent.API_1484_11;
                scorm.version = '2004';
                break;
            }
            if (targetWindow.parent.API) {
                api = targetWindow.parent.API;
                scorm.version = '1.2';
                break;
            }
            targetWindow = targetWindow.parent;
        }
        return api;
    };

    scorm.API = findAPI(win);

    if (scorm.API) {
         scorm.log("Found real LMS API. Version: " + scorm.version);
    } else if (scorm.findAPITries < scorm.maxAPITries) {
        // 仍在嘗試搜尋
        scorm.findAPITries++;
        setTimeout(scorm.getAPI, 10);
    } else {
        // 3. 找不到 API，切換到模擬模式
        scorm.API = scorm.createMockAPI();
        scorm.log("LMS API not found after max tries. Switched to Mock Mode.");
    }
    
    return scorm.API;
};

// --- Debugging/Logging ---
scorm.log = function(msg) {
    if (scorm.debug) {
        if (window.console && window.console.log) {
            console.log("SCORM: " + msg);
        }
    }
};

// --- Public SCORM API Abstractions ---

/**
 * Initializes communication with the LMS.
 * @return {string} 'true' or 'false'
 */
window.doLMSInitialize = function() {
    scorm.API = scorm.getAPI();
    if (!scorm.API) {
        // 這應該不會發生，因為 getAPI 最後會返回 Mock API
        scorm.log("Error: LMS API not found (Fatal).");
        return 'false';
    }

    var result = 'false';
    var initializeFunc;

    if (scorm.version === '1.2') {
        initializeFunc = scorm.API.LMSInitialize;
    } else if (scorm.version === '2004') {
        initializeFunc = scorm.API.Initialize;
    }
    
    if (typeof initializeFunc === 'function') {
        result = initializeFunc("");
    } else {
        scorm.log("Error: Initialize function not available for version " + scorm.version);
    }


    if (result === 'true' || result === true) {
        scorm.isInitialized = true;
        if (scorm.mockMode) {
             document.getElementById('scorm-status').innerText = 'SCORM 狀態: 模擬模式 (成功)';
        } else {
            document.getElementById('scorm-status').innerText = 'SCORM 狀態: 已連線';
        }
        scorm.log("LMS Connection established. Mode: " + (scorm.mockMode ? "MOCK" : "REAL") + ", Version: " + scorm.version);
    } else {
        document.getElementById('scorm-status').innerText = 'SCORM 狀態: 連線失敗';
        scorm.log("LMS Initialize failed. Result: " + result);
    }

    return result;
};

/**
 * Terminates communication with the LMS.
 * @return {string} 'true' or 'false'
 */
window.doLMSTerminate = function() {
    if (!scorm.isInitialized) return 'true';

    var result = 'false';
    var terminateFunc;

    if (scorm.version === '1.2') {
        terminateFunc = scorm.API.LMSFinish;
    } else if (scorm.version === '2004') {
        terminateFunc = scorm.API.Terminate;
    }
    
    if (typeof terminateFunc === 'function') {
        result = terminateFunc("");
    }


    if (result === 'true' || result === true) {
        scorm.isInitialized = false;
        scorm.log("LMS Connection terminated.");
    } else {
        scorm.log("LMS Terminate failed. Result: " + result);
    }

    return result;
};

/**
 * Commits data to the LMS.
 * @return {string} 'true' or 'false'
 */
window.doLMSCommit = function() {
    if (!scorm.isInitialized) return 'false';

    var commitFunc;
    if (scorm.version === '1.2') {
        commitFunc = scorm.API.LMSCommit;
    } else if (scorm.version === '2004') {
        commitFunc = scorm.API.Commit;
    }
    
    var result = 'false';
    if (typeof commitFunc === 'function') {
        result = commitFunc("");
    }
    
    scorm.log("LMS Commit result: " + result);
    return result;
};

/**
 * Sets a SCORM data element value.
 * @param {string} element The CMI data model element (e.g., 'cmi.score.raw')
 * @param {string} value The value to set
 * @return {string} 'true' or 'false'
 */
window.doLMSSetValue = function(element, value) {
    if (!scorm.isInitialized) return 'false';

    var result = 'false';
    var stringValue = value.toString();
    var setValueFunc;

    if (scorm.version === '1.2') {
        setValueFunc = scorm.API.LMSSetValue;
    } else if (scorm.version === '2004') {
        setValueFunc = scorm.API.SetValue;
    }
    
    if (typeof setValueFunc === 'function') {
         result = setValueFunc(element, stringValue);
    }

    if (result !== 'true' && result !== true) {
        var error = window.doLMSGetLastError();
        scorm.log("SetValue failed for " + element + "='" + stringValue + "'. Error Code: " + error);
    } else {
        scorm.log("SetValue: " + element + " = " + stringValue);
    }
    return result;
};

/**
 * Gets a SCORM data element value.
 * @param {string} element The CMI data model element (e.g., 'cmi.learner_id')
 * @return {string} The value returned by the LMS
 */
window.doLMSGetValue = function(element) {
    if (!scorm.isInitialized) return "";

    var result = "";
    var getValueFunc;
    
    if (scorm.version === '1.2') {
        getValueFunc = scorm.API.LMSGetValue;
    } else if (scorm.version === '2004') {
        getValueFunc = scorm.API.GetValue;
    }

    if (typeof getValueFunc === 'function') {
         result = getValueFunc(element);
    }


    if (result === "") {
        var error = window.doLMSGetLastError();
        // Ignore "no error" (0) and "not initialized" (301) errors for GetValue
        if (error !== "0" && error !== "301") {
            scorm.log("GetValue failed for " + element + ". Error Code: " + error);
        }
    } else {
        scorm.log("GetValue: " + element + " = " + result);
    }
    return result;
};

/**
 * Retrieves the last error code from the LMS.
 * @return {string} The error code
 */
window.doLMSGetLastError = function() {
    if (!scorm.API) return "301"; // Default to "not initialized" if API not found

    var getErrorFunc;
    if (scorm.version === '1.2') {
        getErrorFunc = scorm.API.LMSGetLastError;
    } else if (scorm.version === '2004') {
        getErrorFunc = scorm.API.GetLastError;
    }
    
    if (typeof getErrorFunc === 'function') {
        return getErrorFunc();
    }
    return "0";
};

// --- Handle Window Unload ---
window.onbeforeunload = function() {
    // Attempt to commit and terminate when the window is closed/reloaded,
    // only if the game is initialized but not yet finished.
    if (scorm.isInitialized && window.gameState !== 'FINISHED') {
        // 設定 exit=suspend 讓 LMS 知道下次課程應該從上次離開的地方繼續
        window.doLMSSetValue('cmi.exit', 'suspend'); 
        window.doLMSCommit();
        window.doLMSTerminate();
    } else if (scorm.isInitialized && window.gameState === 'FINISHED') {
        // Game is finished, final commit and terminate is done in scormTerminate()
        // 這裡只需要確保終止連線
        window.doLMSTerminate();
    }
};

scorm.log("SCORM API Wrapper loaded.");