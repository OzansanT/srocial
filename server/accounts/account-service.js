import { toSafeAccount } from './account-serializer.js';

export class AccountServiceError extends Error {
  constructor(code, statusCode = 400) {
    super(code);
    this.name = 'AccountServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export async function listSafeAccounts(repository) {
  const accounts = await repository.listAccounts();
  return accounts.map(toSafeAccount);
}

export async function disconnectAccount(repository, id) {
  const account = await repository.disconnectAccount(id);
  if (!account) throw new AccountServiceError('ACCOUNT_NOT_FOUND', 404);
  return toSafeAccount(account);
}
