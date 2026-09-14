function clone(value) {
  return structuredClone(value);
}

export function buildJsonPostOperations(data) {
  const posts = Array.isArray(data?.posts) ? data.posts : [];
  const media = Array.isArray(data?.media) ? data.media : [];
  const publications = Array.isArray(data?.publications) ? data.publications : [];
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];

  return [...posts]
    .sort((a, b) => Date.parse(a.scheduledAt ?? '') - Date.parse(b.scheduledAt ?? ''))
    .map((post) => ({
      ...clone(post),
      media: media
        .filter((item) => item.postId === post.id)
        .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
        .map(clone),
      publications: publications
        .filter((item) => item.postId === post.id)
        .map((publication) => ({
          ...clone(publication),
          jobs: jobs
            .filter((job) => job.publicationId === publication.id)
            .sort((a, b) => Date.parse(a.scheduledAt ?? '') - Date.parse(b.scheduledAt ?? ''))
            .map(clone)
        }))
    }));
}

function applyPatch(collection, id, patch) {
  const item = collection.find((candidate) => candidate.id === id);
  if (!item) throw new Error('LIFECYCLE_RECORD_NOT_FOUND');
  Object.assign(item, clone(patch ?? {}), { id: item.id });
}

export function applyJsonPostLifecycleMutations(data, mutations = []) {
  for (const mutation of mutations) {
    const post = data.posts.find((candidate) => candidate.id === mutation.postId);
    if (!post) throw new Error('LIFECYCLE_POST_NOT_FOUND');
    applyPatch(data.posts, mutation.postId, mutation.postPatch ?? {});

    for (const item of mutation.publicationPatches ?? []) {
      const publication = data.publications.find((candidate) => candidate.id === item.id);
      if (!publication || publication.postId !== mutation.postId) throw new Error('LIFECYCLE_PUBLICATION_NOT_FOUND');
      applyPatch(data.publications, item.id, item.patch ?? {});
    }

    for (const item of mutation.jobPatches ?? []) {
      const job = data.jobs.find((candidate) => candidate.id === item.id);
      const publication = job?.publicationId
        ? data.publications.find((candidate) => candidate.id === job.publicationId)
        : null;
      if (!job || !publication || publication.postId !== mutation.postId) throw new Error('LIFECYCLE_JOB_NOT_FOUND');
      applyPatch(data.jobs, item.id, item.patch ?? {});
    }
  }

  const operations = buildJsonPostOperations(data);
  return mutations.map((mutation) => {
    const post = operations.find((item) => item.id === mutation.postId);
    if (!post) throw new Error('LIFECYCLE_POST_NOT_FOUND');
    return post;
  });
}
