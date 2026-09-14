import { readJsonBody } from '../http/read-json-body.js';
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

export async function routeComposerWorkflowRequest({ request, pathname, repository, now = new Date() } = {}) {
  if (!pathname.startsWith('/api/composer/')) return null;
  if (!repository) return { statusCode: 503, payload: { error: 'repository_unavailable' } };

  if (pathname === '/api/composer/drafts') {
    if (request.method === 'GET') return listDraftsPayload(repository);
    if (request.method === 'POST') return createDraftPayload(repository, await readJsonBody(request), { now });
    return { statusCode: 405, payload: { error: 'method_not_allowed' } };
  }

  const draftMatch = pathname.match(/^\/api\/composer\/drafts\/([^/]+)$/);
  if (draftMatch) {
    const id = decodeURIComponent(draftMatch[1]);
    if (request.method === 'GET') return getDraftPayload(repository, id);
    if (request.method === 'PATCH') return updateDraftPayload(repository, id, await readJsonBody(request), { now });
    if (request.method === 'DELETE') return deleteDraftPayload(repository, id);
    return { statusCode: 405, payload: { error: 'method_not_allowed' } };
  }

  const resources = [
    {
      path: '/api/composer/caption-templates',
      pattern: /^\/api\/composer\/caption-templates\/([^/]+)$/,
      list: listCaptionTemplatesPayload,
      create: createCaptionTemplatePayload,
      remove: deleteCaptionTemplatePayload
    },
    {
      path: '/api/composer/hashtag-collections',
      pattern: /^\/api\/composer\/hashtag-collections\/([^/]+)$/,
      list: listHashtagCollectionsPayload,
      create: createHashtagCollectionPayload,
      remove: deleteHashtagCollectionPayload
    },
    {
      path: '/api/composer/destination-groups',
      pattern: /^\/api\/composer\/destination-groups\/([^/]+)$/,
      list: listDestinationGroupsPayload,
      create: createDestinationGroupPayload,
      remove: deleteDestinationGroupPayload
    }
  ];

  for (const resource of resources) {
    if (pathname === resource.path) {
      if (request.method === 'GET') return resource.list(repository);
      if (request.method === 'POST') return resource.create(repository, await readJsonBody(request), { now });
      return { statusCode: 405, payload: { error: 'method_not_allowed' } };
    }
    const match = pathname.match(resource.pattern);
    if (match) {
      if (request.method === 'DELETE') return resource.remove(repository, decodeURIComponent(match[1]));
      return { statusCode: 405, payload: { error: 'method_not_allowed' } };
    }
  }

  if (pathname === '/api/composer/compatibility') {
    if (request.method !== 'POST') return { statusCode: 405, payload: { error: 'method_not_allowed' } };
    return compatibilityPayload(repository, await readJsonBody(request), { now });
  }

  return { statusCode: 404, payload: { error: 'not_found' } };
}