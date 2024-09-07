"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadModeDefinition = void 0;
const form_1 = require("../types/form");
const loadModeDefinition = (mode) => {
    mode = mode && form_1.FormModes.includes(mode) ? mode : 'generic';
    let modeDefinition = require(`./modes/${mode}`);
    if (!modeDefinition) {
        throw new Error(`Mode definition for ${mode} not found, please check your configuration.`);
    }
    return modeDefinition;
};
exports.loadModeDefinition = loadModeDefinition;
