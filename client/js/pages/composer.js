import { createPost } from '../api/posts-api.js';

function setDefaultSchedule(input) {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setSeconds(0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  input.value = local;
  input.min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function formatError(error) {
  const details = error?.payload?.details;
  if (Array.isArray(details) && details.length) return details.map((item) => item.message).join(' ');
  if (error?.payload?.error) return `Unable to schedule: ${error.payload.error}.`;
  return 'Unable to schedule this post.';
}

export function initializeComposer({ onScheduled } = {}) {
  const form = document.querySelector('#social-composer');
  const scheduleInput = document.querySelector('#scheduled-at');
  const feedback = document.querySelector('#composer-feedback');
  const focusButton = document.querySelector('#focus-composer');
  if (!form || !scheduleInput || !feedback) return;

  setDefaultSchedule(scheduleInput);
  focusButton?.addEventListener('click', () => document.querySelector('#post-caption')?.focus());

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    feedback.dataset.state = '';
    feedback.textContent = 'Scheduling…';
    const data = new FormData(form);
    const localDate = new Date(String(data.get('scheduledAt') ?? ''));
    const platforms = data.getAll('platform').map(String);

    try {
      await createPost({ caption: String(data.get('caption') ?? ''), platforms, scheduledAt: localDate.toISOString() });
      feedback.dataset.state = 'success';
      feedback.textContent = 'Post scheduled.';
      form.reset();
      setDefaultSchedule(scheduleInput);
      await onScheduled?.();
    } catch (error) {
      feedback.dataset.state = 'error';
      feedback.textContent = formatError(error);
    }
  });
}
