function clone(value) {
  return structuredClone(value);
}

export function resolvePublicationContent({ post, publication, baseMedia = [] } = {}) {
  const sourcePost = post && typeof post === 'object' ? post : {};
  const sourcePublication = publication && typeof publication === 'object' ? publication : {};
  const hasCaptionOverride = sourcePublication.captionOverride !== null
    && sourcePublication.captionOverride !== undefined;
  const hasMediaOverride = sourcePublication.mediaOverride !== null
    && sourcePublication.mediaOverride !== undefined;

  return {
    post: {
      ...clone(sourcePost),
      caption: hasCaptionOverride ? String(sourcePublication.captionOverride) : sourcePost.caption
    },
    media: hasMediaOverride ? clone(sourcePublication.mediaOverride) : clone(baseMedia ?? [])
  };
}