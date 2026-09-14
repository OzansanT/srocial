function clone(value) {
  return structuredClone(value);
}

function revisionConflict() {
  const error = new Error('Draft revision conflict');
  error.code = 'DRAFT_REVISION_CONFLICT';
  return error;
}

export function createJsonComposer({ mutate, stableRead, enqueueMutation, getData }) {
  function ensure(collection) {
    const data = getData();
    if (!Array.isArray(data[collection])) data[collection] = [];
    return data[collection];
  }

  function create(collection, record) {
    ensure(collection);
    return mutate(collection, record);
  }

  function remove(collection, id) {
    return enqueueMutation(() => {
      const items = ensure(collection);
      const index = items.findIndex((item) => item.id === id);
      if (index < 0) return false;
      items.splice(index, 1);
      return true;
    });
  }

  return {
    createDraft(record) { return create('composerDrafts', record); },
    getDraft(id) { return stableRead(() => ensure('composerDrafts').find((item) => item.id === id) ?? null); },
    listDrafts() {
      return stableRead(() => [...ensure('composerDrafts')]
        .sort((a, b) => Date.parse(b.updatedAt ?? '') - Date.parse(a.updatedAt ?? '')));
    },
    updateDraft(id, patch, expectedRevision) {
      return enqueueMutation(() => {
        const item = ensure('composerDrafts').find((candidate) => candidate.id === id);
        if (!item) return null;
        if (Number(item.revision ?? 1) !== Number(expectedRevision)) throw revisionConflict();
        Object.assign(item, clone(patch), { id: item.id, revision: Number(item.revision ?? 1) + 1 });
        return item;
      });
    },
    deleteDraft(id) { return remove('composerDrafts', id); },
    createCaptionTemplate(record) { return create('captionTemplates', record); },
    listCaptionTemplates() {
      return stableRead(() => [...ensure('captionTemplates')]
        .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''))));
    },
    deleteCaptionTemplate(id) { return remove('captionTemplates', id); },
    createHashtagCollection(record) { return create('hashtagCollections', record); },
    listHashtagCollections() {
      return stableRead(() => [...ensure('hashtagCollections')]
        .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''))));
    },
    deleteHashtagCollection(id) { return remove('hashtagCollections', id); },
    createDestinationGroup(record) { return create('destinationGroups', record); },
    listDestinationGroups() {
      return stableRead(() => [...ensure('destinationGroups')]
        .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''))));
    },
    deleteDestinationGroup(id) { return remove('destinationGroups', id); }
  };
}