import { disconnectAccount, listSafeAccounts } from '../accounts/account-service.js';

export async function listAccountsPayload(repository) {
  return { statusCode: 200, payload: { accounts: await listSafeAccounts(repository) } };
}

export async function disconnectAccountPayload(repository, id) {
  try {
    return { statusCode: 200, payload: { account: await disconnectAccount(repository, id) } };
  } catch (error) {
    if (error?.code === 'ACCOUNT_NOT_FOUND') return { statusCode: 404, payload: { error: 'account_not_found' } };
    throw error;
  }
}
