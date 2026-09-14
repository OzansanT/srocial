function clone(value) {
  return structuredClone(value);
}

function revisionConflict() {
  const error = new Error('Draft revision conflict');
  error.code = 'DRAFT_REVISION_CONFLICT';
  return error;
}

export function createJsonComposer({ mutate, stableRead, enqueueMutation, getData }) {
  function remove(collection, id) {
    return enqueueMutation(() => {
      const data = getData();
      const index = data[collection].findIndex((item) => item.id === id);
      if (index < 0) return false;
      data[collection].splice(index, 1);
      return true;
    });
  }

  return {
    createDraft(record) { return mutate('composerDrafts', record); },
    getDraft(id) { return stableRead(() => getData().composerDrafts.find((item) => item.id === id) ?? null); },
    listDrafts() {
      return stableRead(() => [...getData().composerDrafts]
        .sort((a, b) => Date.parse(b.updatedAt ?? '') - Date.parse(a.updatedAt ?? '')));
    },
    updateDraft(id, patch, expectedRevision) {
      return enqueueMutation(() => {
        const item = getData().composerDrafts.find((candidate) => candidate.id === id);
        if (!item) return null;
        if (Number(item.revision ?? 1) !== Number(expectedRevision)) throw revisionConflict();
        Object.assign(item, clone(patch), { id: item.id, revision: Number(item.revision ?? 1) + 1 });
        return item;
      });
    },
    deleteDraft(id) { return remove('composerDrafts', id); },
    createCaptionTemplate(record) { return mutate('captionTemplates', record); },
    listCaptionTemplates() {
      return stableRead(() => [...getData().captionTemplates]
        .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''))));
    },
    deleteCaptionTemplate(id) { return remove('captionTemplates', id); },
    createHashtagCollection(record) { return mutate('hashtagCollections', record); },
    listHashtagCollections() {
      return stableRead(() => [...getData().hashtagCollections]
        .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''))));
    },
    deleteHashtagCollection(id) { return remove('hashtagCollections', id); },
    createDestinationGroup(record) { return mutate('destinationGroups', record); },
    listDestinationGroups() {
      return stableRead(() => [...getData().destinationGroups]
        .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''))));
    },
    deleteDestinationGroup(id) { return remove('destinationGroups', id); }
  };
}