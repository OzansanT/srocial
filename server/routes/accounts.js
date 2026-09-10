import { disconnectAccount, listSafeAccounts } from '../services/account-service.js';

export async function listAccountsPayload(repository) {
  return { statusCode: 200, payload: { accounts: await listSafeAccounts(repository) } };
}

export async function disconnectAccountPayload(repository, id, { now = new Date() } = {}) {
  try {
    return { statusCode: 200, payload: { account: await disconnectAccount(repository, id, { now }) } };
  } catch (error) {
    if (error?.message === 'ACCOUNT_NOT_FOUND') return { statusCode: 404, payload: { error: 'account_not_found' } };
    throw error;
  }
}
