import { createComposerWorkflowService } from '../services/composer-workflow-service.js';

function errorResponse(error) {
  if (error?.code === 'WORKFLOW_VALIDATION_ERROR') {
    return { statusCode: 400, payload: { error: 'workflow_validation_error' } };
  }
  if (error?.code === 'DRAFT_NOT_FOUND' || error?.code === 'WORKFLOW_RESOURCE_NOT_FOUND') {
    return { statusCode: 404, payload: { error: 'not_found' } };
  }
  if (error?.code === 'DRAFT_REVISION_CONFLICT') {
    return { statusCode: 409, payload: { error: 'draft_revision_conflict' } };
  }
  return null;
}

async function safe(action) {
  try {
    return await action();
  } catch (error) {
    return errorResponse(error) ?? Promise.reject(error);
  }
}

function service(repository) {
  return createComposerWorkflowService({ repository });
}

export function listDraftsPayload(repository) {
  return safe(async () => ({ statusCode: 200, payload: { drafts: await service(repository).listDrafts() } }));
}

export function createDraftPayload(repository, input, { now } = {}) {
  return safe(async () => ({ statusCode: 201, payload: { draft: await service(repository).createDraft(input, { now }) } }));
}

export function getDraftPayload(repository, id) {
  return safe(async () => ({ statusCode: 200, payload: { draft: await service(repository).getDraft(id) } }));
}

export function updateDraftPayload(repository, id, input, { now } = {}) {
  return safe(async () => ({ statusCode: 200, payload: { draft: await service(repository).updateDraft(id, input, { now }) } }));
}

export function deleteDraftPayload(repository, id) {
  return safe(async () => {
    await service(repository).deleteDraft(id);
    return { statusCode: 204, payload: null };
  });
}

export function listCaptionTemplatesPayload(repository) {
  return safe(async () => ({ statusCode: 200, payload: { templates: await service(repository).listCaptionTemplates() } }));
}

export function createCaptionTemplatePayload(repository, input, { now } = {}) {
  return safe(async () => ({ statusCode: 201, payload: { template: await service(repository).createCaptionTemplate(input, { now }) } }));
}

export function deleteCaptionTemplatePayload(repository, id) {
  return safe(async () => {
    await service(repository).deleteCaptionTemplate(id);
    return { statusCode: 204, payload: null };
  });
}

export function listHashtagCollectionsPayload(repository) {
  return safe(async () => ({ statusCode: 200, payload: { collections: await service(repository).listHashtagCollections() } }));
}

export function createHashtagCollectionPayload(repository, input, { now } = {}) {
  return safe(async () => ({ statusCode: 201, payload: { collection: await service(repository).createHashtagCollection(input, { now }) } }));
}

export function deleteHashtagCollectionPayload(repository, id) {
  return safe(async () => {
    await service(repository).deleteHashtagCollection(id);
    return { statusCode: 204, payload: null };
  });
}

export function listDestinationGroupsPayload(repository) {
  return safe(async () => ({ statusCode: 200, payload: { groups: await service(repository).listDestinationGroups() } }));
}

export function createDestinationGroupPayload(repository, input, { now } = {}) {
  return safe(async () => ({ statusCode: 201, payload: { group: await service(repository).createDestinationGroup(input, { now }) } }));
}

export function deleteDestinationGroupPayload(repository, id) {
  return safe(async () => {
    await service(repository).deleteDestinationGroup(id);
    return { statusCode: 204, payload: null };
  });
}

export function compatibilityPayload(repository, input, { now } = {}) {
  return safe(async () => ({ statusCode: 200, payload: await service(repository).compatibility(input, { now }) }));
}