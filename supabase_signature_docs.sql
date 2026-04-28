-- ─────────────────────────────────────────────────────────────────────────────
-- Signature Documents (FlexIT direct-send) — v3.5.17
-- No new tables; we extend the existing quotes.inputs.signwellDocuments JSONB
-- array with new entries of type='flexit_quote'. Each entry's shape:
--
--   {
--     id:                    "<signwell-document-id>",
--     type:                  "flexit_quote",
--     status:                "sent" | "viewed" | "signed" | "completed" | "cancelled" | "declined",
--     created_at:            "<ISO timestamp>",
--     created_by:            "<user_id>",
--     client_email:          "<email>",
--     client_name:           "<name>",
--     countersign_required:  boolean,
--     countersigned:         boolean,                  -- true once company sig done
--     signed_at:             "<ISO timestamp>" | null, -- when client signed
--     completed_at:          "<ISO timestamp>" | null, -- when ALL parties done
--     completed_pdf_url:     "<url>" | null,
--     legal_terms_version:   "<hash>",                 -- hash of legal HTML at send time
--     payment_id:            null  -- v3.5.18 will populate this when auto-payment fires
--   }
--
-- This mirrors the existing LOA / IntlDialingWaiver pattern.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Pricing settings: legal page content ────────────────────────────────────
insert into public.pricing_settings (key, value, description) values
  ('legal_acceptance_terms_html',
   '<h1>Acceptance Terms</h1>
<h2>Acceptance and Incorporation by Reference</h2>
<p>This Order together with the Master Services Agreement and Service Attachments and other terms and conditions identified on Exhibit A, all of which are incorporated herein by reference (collectively, the &ldquo;Agreement&rdquo;) is between Ferrum Technology Services, LLC (sometimes referred to as &ldquo;we,&rdquo; &ldquo;us,&rdquo; &ldquo;our,&rdquo; or &ldquo;Provider&rdquo;), and the customer identified on the Order (sometimes referred to as &ldquo;you,&rdquo; &ldquo;your,&rdquo; or &ldquo;Client&rdquo;). This Agreement is effective as of the date the Client accepts the Order (the &ldquo;Effective Date&rdquo;).</p>
<p>By signing or accepting this Order, Client acknowledges, represents, and warrants that it has read and agrees to the terms and conditions identified on Exhibit A to this Order which are incorporated as if fully set forth herein.</p>
<p>The parties hereby agree that electronic signatures to this Order shall be relied upon and will bind them to the obligations stated herein. Each party hereby warrants and represents that it has the express authority to execute this Agreement(s).</p>
<p>Provider may make changes to the Agreement at any time. If there are changes, Provider will revise the date at the top of the document. Provider may or may not provide Client with additional notice regarding such changes. Client should review the terms and conditions regularly. Unless otherwise noted, the amended terms and conditions will be effective immediately, and your continued use of the Services thereafter constitutes your acceptance of the changes. If you do not agree to the amended terms and conditions, you must stop using the Services immediately. Please note, you may incur a termination fee or other third-party fees, if applicable. You may access the current version of the terms and conditions at any time by visiting <a href="https://ferrumit.com/legal">https://ferrumit.com/legal</a>.</p>
<h2>Exhibit A</h2>
<ul>
  <li><a href="https://ferrumit.com/legal/master-services-agreement">Master Services Agreement</a></li>
  <li><a href="https://ferrumit.com/legal/service-attachment-managed-services">Service Attachment for Managed Services</a></li>
  <li><a href="https://ferrumit.com/legal/service-attachment-managed-video-surveillance">Service Attachment for Managed Video Surveillance Services</a></li>
  <li><a href="https://ferrumit.com/legal/service-attachment-managed-access-control">Service Attachment for Managed Access Control Services</a></li>
  <li><a href="https://ferrumit.com/legal/service-attachment-managed-compliance">Service Attachment for Managed Compliance Services</a></li>
  <li><a href="https://ferrumit.com/legal/service-attachment-managed-database-administration">Service Attachment for Managed Database Administration</a></li>
  <li><a href="https://ferrumit.com/legal/service-attachment-penetration-testing">Service Attachment for Penetration Testing</a></li>
  <li><a href="https://ferrumit.com/legal/service-attachment-artificial-intelligence">Service Attachment for Artificial Intelligence Services</a></li>
  <li><a href="https://ferrumit.com/legal/service-attachment-co-managed-services">Service Attachment for Co-Managed Services</a></li>
  <li><a href="https://ferrumit.com/legal/service-attachment-application-development">Service Attachment for Application Development</a></li>
  <li><a href="https://ferrumit.com/legal/schedule-of-services">Schedule of Services</a></li>
  <li><a href="https://ferrumit.com/legal/data-processing-agreement">Data Processing Agreement</a></li>
  <li><a href="https://ferrumit.com/legal/service-level-objectives">Service Level Objectives</a></li>
</ul>',
   'Editable HTML for the Acceptance Terms / Exhibit A page that prepends every signature document. Edit links here when agreements change.'
  ),
  ('legal_countersign_threshold', '5000',
   'Dollar threshold at or above which the company countersignature checkbox defaults ON in the Send for Signature modal. Reps can override either way per document.'),
  ('legal_default_company_signer_name', 'Shaun Lang',
   'Default name for the company countersignature block.'),
  ('legal_default_company_signer_title', 'CEO',
   'Default title for the company countersignature block.'),
  ('legal_default_company_signer_email', '',
   'Default email for the company countersignature recipient (where SignWell sends the countersign request).'),

  -- v3.5.18 hooks (defined now so admin can pre-configure; no automation yet)
  ('flexit_auto_payment_after_sign', 'true',
   'When true, signing a FlexIT quote automatically generates and emails a Stripe payment link to the client. Wired up in v3.5.18.'),
  ('hubspot_stage_awaiting_payment', '',
   'HubSpot pipeline stage ID to move deals to once the client signs (awaiting payment). Leave blank to skip stage automation.'),
  ('hubspot_stage_closed_won', '',
   'HubSpot pipeline stage ID to move deals to once payment is collected. Leave blank to skip stage automation.')
on conflict (key) do nothing;
