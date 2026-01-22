/*
Copyright 2020 Adobe
Distributed under the MIT License.
Minimal CSInterface.js implementation for CEP panels.
*/

(function () {
    'use strict';

    if (typeof window === 'undefined') {
        return;
    }

    var cepHost = window.__adobe_cep__;

    function CSEvent(type, scope, appId, extensionId) {
        this.type = type;
        this.scope = scope || 'GLOBAL';
        this.appId = appId || '';
        this.extensionId = extensionId || '';
        this.data = '';
    }

    function SystemPath() {}
    SystemPath.USER_DATA = 'userData';
    SystemPath.COMMON_FILES = 'commonFiles';
    SystemPath.MY_DOCUMENTS = 'myDocuments';
    SystemPath.APPLICATION = 'application';
    SystemPath.EXTENSION = 'extension';
    SystemPath.HOST_APPLICATION = 'hostApplication';

    function ColorType() {}
    ColorType.RGB = 'rgb';
    ColorType.GRADIENT = 'gradient';
    ColorType.NONE = 'none';

    function RGBColor() {
        this.red = 0;
        this.green = 0;
        this.blue = 0;
    }

    function Direction() {}
    Direction.HORIZONTAL = 'horizontal';
    Direction.VERTICAL = 'vertical';

    function GradientStop(offset, rgb) {
        this.offset = offset;
        this.rgb = rgb || new RGBColor();
    }

    function GradientColor() {
        this.type = ColorType.GRADIENT;
        this.direction = Direction.VERTICAL;
        this.numStops = 0;
        this.arrGradientStop = [];
    }

    function CSInterface() {}

    CSInterface.prototype.getApplicationID = function () {
        return (cepHost && cepHost.getApplicationID && cepHost.getApplicationID()) || '';
    };

    CSInterface.prototype.getHostEnvironment = function () {
        if (!cepHost || !cepHost.getHostEnvironment) {
            return {};
        }
        return JSON.parse(cepHost.getHostEnvironment());
    };

    CSInterface.prototype.evalScript = function (script, callback) {
        if (!cepHost || !cepHost.evalScript) {
            if (typeof console !== 'undefined') {
                console.warn('CSInterface#evalScript unavailable. Script:', script);
            }
            if (typeof callback === 'function') {
                callback('');
            }
            return;
        }
        cepHost.evalScript(script, callback);
    };

    CSInterface.prototype.dispatchEvent = function (event) {
        if (!event || !event.type) {
            throw new Error('CSEvent type is required.');
        }
        if (!cepHost || !cepHost.dispatchEvent) {
            return;
        }
        cepHost.dispatchEvent(JSON.stringify(event));
    };

    CSInterface.prototype.addEventListener = function (type, listener) {
        if (!cepHost || !cepHost.addEventListener) {
            return;
        }
        cepHost.addEventListener(type, listener);
    };

    CSInterface.prototype.removeEventListener = function (type, listener) {
        if (!cepHost || !cepHost.removeEventListener) {
            return;
        }
        cepHost.removeEventListener(type, listener);
    };

    CSInterface.prototype.requestOpenExtension = function (extensionId, params) {
        if (!cepHost || !cepHost.requestOpenExtension) {
            return;
        }
        cepHost.requestOpenExtension(extensionId, params);
    };

    CSInterface.prototype.getSystemPath = function (pathType) {
        if (!cepHost || !cepHost.getSystemPath) {
            return '';
        }
        return cepHost.getSystemPath(pathType);
    };

    CSInterface.prototype.registerKeyEventsInterest = function (keyEvents) {
        if (!cepHost || !cepHost.registerKeyEventsInterest) {
            return;
        }
        var payload = keyEvents;
        if (Array.isArray(payload)) {
            payload = JSON.stringify(payload);
        } else if (typeof payload !== 'string') {
            payload = JSON.stringify([payload]);
        }
        cepHost.registerKeyEventsInterest(payload);
    };

    CSInterface.prototype.openURLInDefaultBrowser = function (url) {
        if (!cepHost || !cepHost.openURLInDefaultBrowser) {
            return;
        }
        cepHost.openURLInDefaultBrowser(url);
    };

    window.CSInterface = CSInterface;
    window.CSEvent = CSEvent;
    window.SystemPath = SystemPath;
    window.ColorType = ColorType;
    window.GradientColor = GradientColor;
    window.GradientStop = GradientStop;
    window.RGBColor = RGBColor;
    window.Direction = Direction;
})();
