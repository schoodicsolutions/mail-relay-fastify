import { FormMode, FormModes } from "../types/form";
import { FormModeDefinition } from "../types/form-mode-definition";

export const loadModeDefinition = (mode?: FormMode): FormModeDefinition => {
    mode = mode && FormModes.includes(mode) ? mode : 'generic';
    let modeDefinition = require(`./modes/${mode}`) as FormModeDefinition;

    if (!modeDefinition) {
        throw new Error(`Mode definition for ${mode} not found, please check your configuration.`);
    }
    return modeDefinition;
}