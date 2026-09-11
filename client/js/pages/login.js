import { login } from '../api/auth-api.js';

const form = document.querySelector('#admin-login-form');
const usernameInput = document.querySelector('#admin-username');
const passwordInput = document.querySelector('#admin-password');
const submitButton = document.querySelector('#login-submit');
const feedback = document.querySelector('#login-feedback');

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!usernameInput || !passwordInput || !submitButton || !feedback) return;

  feedback.textContent = '';
  submitButton.disabled = true;

  try {
    await login(usernameInput.value, passwordInput.value);
    passwordInput.value = '';
    window.location.replace('/');
  } catch (error) {
    passwordInput.value = '';
    if (error?.status === 401) {
      feedback.textContent = 'Invalid username or password.';
    } else if (error?.status === 429) {
      feedback.textContent = 'Too many sign-in attempts. Try again later.';
    } else if (error?.status === 503) {
      feedback.textContent = 'Administrator sign-in is not enabled on this server.';
    } else {
      feedback.textContent = 'Sign-in failed. Try again.';
    }
    passwordInput.focus();
  } finally {
    submitButton.disabled = false;
  }
});
