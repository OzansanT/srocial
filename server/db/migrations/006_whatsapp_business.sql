ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS template_components jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE provider_status
  DROP CONSTRAINT IF EXISTS provider_status_provider_check;

ALTER TABLE provider_status
  ADD CONSTRAINT provider_status_provider_check
  CHECK (provider IN ('instagram', 'facebook', 'threads', 'tiktok', 'whatsapp'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_contacts_single_admin_phone
  ON contacts(phone_number)
  WHERE user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_templates_provider_template_id
  ON whatsapp_templates(provider_template_id)
  WHERE provider_template_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_messages_provider_message_id
  ON whatsapp_messages(provider_message_id)
  WHERE provider_message_id IS NOT NULL;
