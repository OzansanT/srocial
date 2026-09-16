export function maintenanceError(code) {
  const error = new Error(code);
  error.name = 'MaintenanceError';
  error.code = code;
  return error;
}
