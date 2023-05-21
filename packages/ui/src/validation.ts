import { errorInfo, variableTypes } from '@stoked-cenv/cenv-lib';

export function filteredCount(options: string[], types: string[]) {
  const filtered = options.filter(el => {
    return types.indexOf(el) > -1;
  });
  return filtered;
}

export function validateCount(options: string[], types: string[], silent = false) {
  const filtered = filteredCount(options, types);
  const valid = filtered.length === 1;
  if (!valid && !silent) {
    if (filtered.length === 0) {
      console.log(errorInfo('The command did not include parameter type.'));
    } else {
      console.log(errorInfo('The command included more than one type - included: ' + filtered.join(', ')));
    }
  }
  return valid ? filtered[0] : false;
}

export function validateOneType(options: string[]) {
  return validateCount(options, variableTypes);
}

