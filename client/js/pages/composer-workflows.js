import {
  checkCompatibility,
  createCaptionTemplate,
  createDestinationGroup,
  createDraft,
  createHashtagCollection,
  deleteCaptionTemplate,
  deleteDestinationGroup,
  deleteDraft,
  deleteHashtagCollection,
  getDraft,
  listCaptionTemplates,
  listDestinationGroups,
  listDrafts,
  listHashtagCollections,
  updateDraft
} from '../api/composer-workflows-api.js';
import { renderPlatformPreviews } from '../components/platform-preview.js';

const AUTOSAVE_DELAY_MS = 800;
const COMPATIBILITY_DELAY_MS = 350;

function option(value, label) {
  const node = document.createElement('option');
  node.value = value;
  node.textContent = label;
  return node;
}

function setFeedback(node, message, state = '') {
  if (!node) return;
  node.dataset.state = state;
  node.textContent = message;
}

function renderSelector(select, items, { placeholder, label }) {
  if (!select) return;
  const selected = select.value;
  select.replaceChildren(option('', placeholder));
  for (const item of items) select.append(option(item.id, label(item)));
  if (items.some((item) => item.id === selected)) select.value = selected;
}

function resourceById(items, id) {
  return items.find((item) => item.id === id) ?? null;
}

function uniqueHashtags(text) {
  const seen = new Set();
  const result = [];
  for (const match of String(text ?? '').match(/#[\p{L}\p{N}_]+/gu) ?? []) {
    const key = match.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(match);
  }
  return result;
}

function appendHashtags(caption, tags) {
  const existing = new Set(uniqueHashtags(caption).map((tag) => tag.toLowerCase()));
  const additions = tags.filter((tag) => !existing.has(String(tag).toLowerCase()));
  if (!additions.length) return String(caption ?? '');
  const base = String(caption ?? '').trimEnd();
  return `${base}${base ? '\n\n' : ''}${additions.join(' ')}`;
}

export function initializeComposerWorkflows({ composer, onChanged } = {}) {
  const form = document.querySelector('#social-composer');
  const draftSelector = document.querySelector('#draft-selector');
  const draftName = document.querySelector('#draft-name');
  const draftStatus = document.querySelector('#draft-status');
  const saveDraftButton = document.querySelector('#save-draft-now');
  const deleteDraftButton = document.querySelector('#delete-draft');
  const templateSelector = document.querySelector('#caption-template-selector');
  const hashtagSelector = document.querySelector('#hashtag-collection-selector');
  const groupSelector = document.querySelector('#destination-group-selector');
  const compatibilityReport = document.querySelector('#compatibility-report');
  const previews = document.querySelector('#platform-previews');

  if (!form || !composer?.getState || !composer?.applyState) {
    return { refresh: async () => {}, markScheduled: () => {}, activeDraftId: () => null };
  }

  let drafts = [];
  let templates = [];
  let hashtagCollections = [];
  let destinationGroups = [];
  let activeDraft = null;
  let autosaveTimer = null;
  let compatibilityTimer = null;
  let saving = false;
  let dirty = false;
  let applying = false;
  let autosaveBlocked = false;
  let compatibilityRequest = 0;

  function currentPayload() {
    const state = composer.getState() ?? {};
    return {
      name: String(draftName?.value ?? '').trim() || 'Untitled draft',
      caption: state.caption ?? '',
      scheduledAt: state.scheduledAt ?? null,
      media: state.media ?? [],
      destinations: state.destinations ?? [],
      platformOverrides: state.platformOverrides ?? {}
    };
  }

  function renderDrafts() {
    renderSelector(draftSelector, drafts, {
      placeholder: 'New / unsaved draft',
      label: (item) => `${item.name || 'Untitled draft'} · r${item.revision}`
    });
    if (draftSelector && activeDraft) draftSelector.value = activeDraft.id;
    if (deleteDraftButton) deleteDraftButton.disabled = !activeDraft;
  }

  function renderResources() {
    renderSelector(templateSelector, templates, { placeholder: 'Select caption template', label: (item) => item.name });
    renderSelector(hashtagSelector, hashtagCollections, { placeholder: 'Select hashtag collection', label: (item) => item.name });
    renderSelector(groupSelector, destinationGroups, { placeholder: 'Select destination group', label: (item) => item.name });
  }

  async function refresh() {
    const [draftResult, templateResult, hashtagResult, groupResult] = await Promise.all([
      listDrafts(), listCaptionTemplates(), listHashtagCollections(), listDestinationGroups()
    ]);
    drafts = draftResult?.drafts ?? [];
    templates = templateResult?.templates ?? [];
    hashtagCollections = hashtagResult?.collections ?? [];
    destinationGroups = groupResult?.groups ?? [];
    if (activeDraft) activeDraft = drafts.find((item) => item.id === activeDraft.id) ?? activeDraft;
    renderDrafts();
    renderResources();
  }

  async function runCompatibility() {
    const requestId = ++compatibilityRequest;
    try {
      const payload = currentPayload();
      const result = await checkCompatibility(payload);
      if (requestId !== compatibilityRequest) return;
      renderPlatformPreviews({ container: previews, compatibility: result, payload });
      const total = result?.destinations?.length ?? 0;
      const ready = (result?.destinations ?? []).filter((item) => item.compatible).length;
      setFeedback(
        compatibilityReport,
        total ? `${ready}/${total} destinations compatible with the current composer state.` : 'Select at least one destination for compatibility checks.',
        total && ready === total ? 'success' : total ? 'warning' : ''
      );
    } catch (error) {
      if (requestId !== compatibilityRequest) return;
      setFeedback(compatibilityReport, 'Unable to refresh compatibility report.', 'error');
    }
  }

  function scheduleCompatibility() {
    clearTimeout(compatibilityTimer);
    compatibilityTimer = setTimeout(runCompatibility, COMPATIBILITY_DELAY_MS);
  }

  async function saveDraftNow({ force = false } = {}) {
    clearTimeout(autosaveTimer);
    if (autosaveBlocked && !force) return;
    if (saving) {
      dirty = true;
      return;
    }
    saving = true;
    dirty = false;
    setFeedback(draftStatus, activeDraft ? 'Saving draft…' : 'Creating draft…');
    try {
      const payload = currentPayload();
      const result = activeDraft
        ? await updateDraft(activeDraft.id, { ...payload, revision: activeDraft.revision })
        : await createDraft(payload);
      activeDraft = result?.draft ?? null;
      autosaveBlocked = false;
      if (draftName && activeDraft) draftName.value = activeDraft.name;
      setFeedback(draftStatus, activeDraft ? `Saved revision ${activeDraft.revision}.` : 'Draft saved.', 'success');
      await refresh();
    } catch (error) {
      if (error?.payload?.error === 'draft_revision_conflict') {
        autosaveBlocked = true;
        setFeedback(draftStatus, 'Draft changed in another tab. Reload the saved draft before editing again.', 'error');
      } else {
        setFeedback(draftStatus, 'Draft autosave failed. Your current browser values are unchanged.', 'error');
      }
    } finally {
      saving = false;
      if (dirty && !autosaveBlocked) scheduleAutosave();
    }
  }

  function scheduleAutosave() {
    if (applying || autosaveBlocked) return;
    dirty = true;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => saveDraftNow(), AUTOSAVE_DELAY_MS);
  }

  async function loadDraft(id) {
    if (!id) {
      activeDraft = null;
      autosaveBlocked = false;
      if (draftName) draftName.value = '';
      renderDrafts();
      setFeedback(draftStatus, 'Editing a new unsaved draft.');
      return;
    }
    setFeedback(draftStatus, 'Loading draft…');
    try {
      const result = await getDraft(id);
      const draft = result?.draft;
      if (!draft) throw new Error('DRAFT_NOT_FOUND');
      applying = true;
      activeDraft = draft;
      autosaveBlocked = false;
      if (draftName) draftName.value = draft.name ?? '';
      await composer.applyState(draft);
      renderDrafts();
      setFeedback(draftStatus, `Loaded revision ${draft.revision}.`, 'success');
      await runCompatibility();
    } catch (error) {
      setFeedback(draftStatus, 'Unable to load this draft.', 'error');
    } finally {
      applying = false;
    }
  }

  async function removeActiveDraft() {
    if (!activeDraft) return;
    try {
      await deleteDraft(activeDraft.id);
      activeDraft = null;
      autosaveBlocked = false;
      if (draftName) draftName.value = '';
      setFeedback(draftStatus, 'Draft deleted.', 'success');
      await refresh();
    } catch (error) {
      setFeedback(draftStatus, 'Unable to delete this draft.', 'error');
    }
  }

  function setCaption(value) {
    const caption = document.querySelector('#post-caption');
    if (!caption) return;
    caption.value = value;
    caption.dispatchEvent(new Event('input', { bubbles: true }));
  }

  document.querySelector('#apply-caption-template')?.addEventListener('click', () => {
    const selected = resourceById(templates, templateSelector?.value);
    if (selected) setCaption(selected.caption ?? '');
  });

  document.querySelector('#save-caption-template')?.addEventListener('click', async () => {
    const name = String(document.querySelector('#caption-template-name')?.value ?? '').trim();
    const caption = String(document.querySelector('#post-caption')?.value ?? '');
    if (!name) return setFeedback(draftStatus, 'Enter a caption template name.', 'error');
    await createCaptionTemplate({ name, caption });
    await refresh();
    setFeedback(draftStatus, 'Caption template saved.', 'success');
  });

  document.querySelector('#delete-caption-template')?.addEventListener('click', async () => {
    const id = templateSelector?.value;
    if (!id) return;
    await deleteCaptionTemplate(id);
    await refresh();
  });

  document.querySelector('#apply-hashtag-collection')?.addEventListener('click', () => {
    const selected = resourceById(hashtagCollections, hashtagSelector?.value);
    if (!selected) return;
    const caption = document.querySelector('#post-caption');
    setCaption(appendHashtags(caption?.value ?? '', selected.tags ?? []));
  });

  document.querySelector('#save-hashtag-collection')?.addEventListener('click', async () => {
    const name = String(document.querySelector('#hashtag-collection-name')?.value ?? '').trim();
    const rawTags = String(document.querySelector('#hashtag-collection-tags')?.value ?? '');
    if (!name) return setFeedback(draftStatus, 'Enter a hashtag collection name.', 'error');
    const tags = rawTags.split(/[\s,]+/).filter(Boolean);
    await createHashtagCollection({ name, tags });
    await refresh();
    setFeedback(draftStatus, 'Hashtag collection saved.', 'success');
  });

  document.querySelector('#delete-hashtag-collection')?.addEventListener('click', async () => {
    const id = hashtagSelector?.value;
    if (!id) return;
    await deleteHashtagCollection(id);
    await refresh();
  });

  document.querySelector('#apply-destination-group')?.addEventListener('click', async () => {
    const selected = resourceById(destinationGroups, groupSelector?.value);
    if (!selected) return;
    const current = composer.getState();
    const existing = new Map((current.destinations ?? []).map((item) => [`${item.platform}:${item.accountId}`, item]));
    applying = true;
    try {
      await composer.applyState({
        ...current,
        destinations: (selected.destinations ?? []).map((item) => ({
          ...item,
          ...(existing.get(`${item.platform}:${item.accountId}`) ?? {})
        }))
      });
    } finally {
      applying = false;
    }
    scheduleAutosave();
    scheduleCompatibility();
  });

  document.querySelector('#save-destination-group')?.addEventListener('click', async () => {
    const name = String(document.querySelector('#destination-group-name')?.value ?? '').trim();
    if (!name) return setFeedback(draftStatus, 'Enter a destination group name.', 'error');
    const destinations = (composer.getState()?.destinations ?? [])
      .filter((item) => item.platform && item.accountId)
      .map(({ platform, accountId }) => ({ platform, accountId }));
    await createDestinationGroup({ name, destinations });
    await refresh();
    setFeedback(draftStatus, 'Destination group saved.', 'success');
  });

  document.querySelector('#delete-destination-group')?.addEventListener('click', async () => {
    const id = groupSelector?.value;
    if (!id) return;
    await deleteDestinationGroup(id);
    await refresh();
  });

  draftSelector?.addEventListener('change', () => loadDraft(draftSelector.value));
  saveDraftButton?.addEventListener('click', () => saveDraftNow({ force: true }));
  deleteDraftButton?.addEventListener('click', removeActiveDraft);

  for (const eventName of ['input', 'change']) {
    form.addEventListener(eventName, () => {
      if (applying) return;
      scheduleAutosave();
      scheduleCompatibility();
    });
  }
  draftName?.addEventListener('input', scheduleAutosave);

  refresh().then(runCompatibility).catch((error) => {
    console.error('Composer workflow initialization failed', { status: error?.status ?? null });
    setFeedback(draftStatus, 'Unable to load saved composer workflows.', 'error');
  });

  return {
    refresh,
    activeDraftId: () => activeDraft?.id ?? null,
    markScheduled() {
      if (activeDraft) setFeedback(draftStatus, `Post scheduled from “${activeDraft.name}”. Draft kept for reuse.`, 'success');
      onChanged?.();
    }
  };
}