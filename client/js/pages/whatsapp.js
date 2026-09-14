import {
  createWhatsAppCampaign,
  createWhatsAppContact,
  listWhatsAppCampaigns,
  listWhatsAppContacts,
  listWhatsAppTemplates,
  setWhatsAppConsent,
  syncWhatsAppTemplates
} from '../api/whatsapp-api.js';

function clear(node) {
  if (!node) return;
  while (node.firstChild) node.removeChild(node.firstChild);
}

function text(tag, value, className = '') {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
}

function button(label, action) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'button button--secondary';
  node.textContent = label;
  node.addEventListener('click', action);
  return node;
}

function errorText(error) {
  const details = error?.payload?.details;
  if (Array.isArray(details) && details[0]?.message) return details[0].message;
  if (error?.status === 503) return 'WhatsApp provider configuration is unavailable.';
  return 'WhatsApp request failed.';
}

export function initializeWhatsApp() {
  const contactsList = document.querySelector('#whatsapp-contact-list');
  const templatesList = document.querySelector('#whatsapp-template-list');
  const campaignList = document.querySelector('#whatsapp-campaign-list');
  const contactForm = document.querySelector('#whatsapp-contact-form');
  const campaignForm = document.querySelector('#whatsapp-campaign-form');
  const templateSelect = document.querySelector('#whatsapp-campaign-template');
  const feedback = document.querySelector('#whatsapp-feedback');
  const syncButton = document.querySelector('#sync-whatsapp-templates');
  if (!contactsList || !templatesList || !campaignList || !contactForm || !campaignForm || !templateSelect) return;

  let contacts = [];
  let templates = [];

  function setFeedback(message = '') {
    if (feedback) feedback.textContent = message;
  }

  function renderContacts() {
    clear(contactsList);
    if (!contacts.length) {
      contactsList.append(text('p', 'No WhatsApp contacts yet.', 'whatsapp-empty'));
      return;
    }
    for (const contact of contacts) {
      const row = document.createElement('article');
      row.className = 'whatsapp-row';
      const info = document.createElement('div');
      info.append(text('strong', contact.displayName || contact.phoneNumber));
      info.append(text('span', `${contact.phoneNumber} · ${contact.consentStatus}`, 'whatsapp-row__meta'));
      row.append(info);
      if (contact.consentStatus === 'OPTED_IN') {
        const label = document.createElement('label');
        label.className = 'whatsapp-recipient-choice';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.name = 'whatsapp-recipient';
        input.value = contact.id;
        label.append(input, document.createTextNode(' Campaign recipient'));
        row.append(label);
        row.append(button('Opt out', async () => {
          try {
            await setWhatsAppConsent(contact.id, { consentStatus: 'OPTED_OUT', consentSource: 'dashboard' });
            await refresh();
          } catch (error) { setFeedback(errorText(error)); }
        }));
      }
      contactsList.append(row);
    }
  }

  function renderTemplates() {
    clear(templatesList);
    clear(templateSelect);
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select approved template';
    templateSelect.append(placeholder);
    for (const template of templates) {
      const row = document.createElement('article');
      row.className = 'whatsapp-row';
      row.append(text('strong', `${template.name} · ${template.language}`));
      row.append(text('span', `${template.category || 'Uncategorized'} · ${template.status}`, 'whatsapp-row__meta'));
      templatesList.append(row);
      if (template.status === 'APPROVED') {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = `${template.name} (${template.language})`;
        templateSelect.append(option);
      }
    }
    if (!templates.length) templatesList.append(text('p', 'No synchronized templates.', 'whatsapp-empty'));
  }

  function renderCampaigns(campaigns) {
    clear(campaignList);
    if (!campaigns.length) {
      campaignList.append(text('p', 'No WhatsApp campaigns yet.', 'whatsapp-empty'));
      return;
    }
    for (const campaign of campaigns) {
      const row = document.createElement('article');
      row.className = 'whatsapp-row';
      row.append(text('strong', campaign.name));
      row.append(text('span', `${campaign.state} · ${campaign.recipientSummary?.total ?? 0} recipients · ${campaign.scheduledAt}`, 'whatsapp-row__meta'));
      campaignList.append(row);
    }
  }

  async function refresh() {
    try {
      const [contactPayload, templatePayload, campaignPayload] = await Promise.all([
        listWhatsAppContacts(), listWhatsAppTemplates(), listWhatsAppCampaigns()
      ]);
      contacts = contactPayload.contacts ?? [];
      templates = templatePayload.templates ?? [];
      renderContacts();
      renderTemplates();
      renderCampaigns(campaignPayload.campaigns ?? []);
      setFeedback('');
    } catch (error) {
      setFeedback(errorText(error));
    }
  }

  contactForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(contactForm);
    try {
      await createWhatsAppContact({
        phoneNumber: form.get('phoneNumber'),
        displayName: form.get('displayName'),
        consentStatus: form.get('consentStatus'),
        consentSource: form.get('consentSource')
      });
      contactForm.reset();
      await refresh();
    } catch (error) { setFeedback(errorText(error)); }
  });

  campaignForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(campaignForm);
    const contactIds = [...document.querySelectorAll('input[name="whatsapp-recipient"]:checked')].map((input) => input.value);
    const local = String(form.get('scheduledAt') ?? '');
    const scheduledAt = local ? new Date(local).toISOString() : '';
    try {
      await createWhatsAppCampaign({
        name: form.get('name'),
        templateId: form.get('templateId'),
        contactIds,
        scheduledAt,
        templateComponents: []
      });
      campaignForm.reset();
      await refresh();
    } catch (error) { setFeedback(errorText(error)); }
  });

  syncButton?.addEventListener('click', async () => {
    syncButton.disabled = true;
    try {
      await syncWhatsAppTemplates();
      await refresh();
    } catch (error) { setFeedback(errorText(error)); }
    finally { syncButton.disabled = false; }
  });

  refresh();
}
