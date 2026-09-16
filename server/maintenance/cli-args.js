import { maintenanceError } from './errors.js';

function valueAfter(args, index) {
  const value = args[index + 1];
  if (value === undefined || String(value).startsWith('--') || !String(value).trim()) throw maintenanceError('MAINTENANCE_ARGUMENT_INVALID');
  return String(value);
}

export function parseBackupArgs(args = []) {
  let output = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = String(args[index]);
    if (token !== '--output' || output !== null) throw maintenanceError('MAINTENANCE_ARGUMENT_INVALID');
    output = valueAfter(args, index);
    index += 1;
  }
  if (!output) throw maintenanceError('BACKUP_OUTPUT_REQUIRED');
  return { output };
}

export function parseRestoreArgs(args = []) {
  let input = null;
  let force = false;
  for (let index = 0; index < args.length; index += 1) {
    const token = String(args[index]);
    if (token === '--input') {
      if (input !== null) throw maintenanceError('MAINTENANCE_ARGUMENT_INVALID');
      input = valueAfter(args, index);
      index += 1;
      continue;
    }
    if (token === '--force') {
      if (force) throw maintenanceError('MAINTENANCE_ARGUMENT_INVALID');
      force = true;
      continue;
    }
    throw maintenanceError('MAINTENANCE_ARGUMENT_INVALID');
  }
  if (!input) throw maintenanceError('BACKUP_INPUT_REQUIRED');
  return { input, force };
}
