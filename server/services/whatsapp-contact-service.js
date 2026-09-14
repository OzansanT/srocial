import { ValidationError } from './post-service.js';

const CONSENT_STATES = new Set(['UNKNOWN', 'OPTED_IN', 'OPTED_OUT']);
const E164 = /^\+[1-9]\d{7,14}$/;

function validation(details) {
  throw new ValidationError(details);
}

export async function createWhatsAppContact({ repository, input, now = new Date() } = {}) {
  const phoneNumber = String(input?.phoneNumber ?? '').trim();
  const displayName = String(input?.displayName ?? '').trim() || null;
  const consentStatus = String(input?.consentStatus ?? 'UNKNOWN').trim().toUpperCase();
  const consentSource = String(input?.consentSource ?? '').trim() || null;
  const details = [];
  if (!E164.test(phoneNumber)) details.push({ field: 'phoneNumber', message: 'Phone number must use E.164 format.' });
  if (!CONSENT_STATES.has(consentStatus)) details.push({ field: 'consentStatus', message: 'Consent state is invalid.' });
  if (consentStatus === 'OPTED_IN' && !consentSource) details.push({ field: 'consentSource', message: 'Opt-in requires a consent source.' });
  if (details.length) validation(details);
  const timestamp = now.toISOString();
  return repository.createContact({
    userId: null,
    phoneNumber,
    displayName,
    consentStatus,
    consentSource,
    consentAt: consentStatus === 'UNKNOWN' ? null : timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

export async function setWhatsAppConsent({ repository, contactId, input, now = new Date() } = {}) {
  const id = String(contactId ?? '').trim();
  const contact = id ? await repository.getContact(id) : null;
  if (!contact) validation([{ field: 'contactId', message: 'Contact was not found.' }]);
  const consentStatus = String(input?.consentStatus ?? '').trim().toUpperCase();
  const consentSource = String(input?.consentSource ?? '').trim() || null;
  const details = [];
  if (!new Set(['OPTED_IN', 'OPTED_OUT']).has(consentStatus)) details.push({ field: 'consentStatus', message: 'Consent must be OPTED_IN or OPTED_OUT.' });
  if (consentStatus === 'OPTED_IN' && !consentSource) details.push({ field: 'consentSource', message: 'Opt-in requires a consent source.' });
  if (details.length) validation(details);
  const timestamp = now.toISOString();
  return repository.updateContact(contact.id, {
    consentStatus,
    consentSource,
    consentAt: timestamp,
    updatedAt: timestamp
  });
}
