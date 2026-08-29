import {PluginManager} from 'sn-plugin-lib';

const FILE_READ_PERMISSION = 'plugin.permission.FILE:READ';
const FILE_WRITE_PERMISSION = 'plugin.permission.FILE:WRITE';
const pendingRequests = new Map<string, Promise<boolean>>();

async function ensurePermission(permission: string, description: string): Promise<boolean> {
  const pending = pendingRequests.get(permission);
  if (pending) {return pending;}

  const request = (async () => {
    try {
      if (Number(await PluginManager.hasPermission(permission)) > 0) {return true;}
      return Number(await PluginManager.requestPermission(permission, description)) > 0;
    } catch {
      return false;
    }
  })();
  pendingRequests.set(permission, request);
  try {
    return await request;
  } finally {
    pendingRequests.delete(permission);
  }
}

export function ensureFileReadPermission(): Promise<boolean> {
  return ensurePermission(
    FILE_READ_PERMISSION,
    'Allow Restyle to read the selected note elements before changing their style.',
  );
}

export function ensureFileWritePermission(): Promise<boolean> {
  return ensurePermission(
    FILE_WRITE_PERMISSION,
    'Allow Restyle to save color and size changes to the selected note elements.',
  );
}
