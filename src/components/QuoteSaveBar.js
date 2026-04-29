// QuoteSaveBar — shared save / send-for-review block used across all quote types.
//
// Extracted v3.5.25 from QuotePage / MultiSiteQuotePage / VoiceQuotePage /
// BundleQuotePage / FlexITQuotePage. Each of those pages had near-identical
// JSX for the save button, status messaging, and send-for-review affordance,
// with cosmetic differences (label text, button color, message placement,
// FlexIT's distinctive larger orange button).
//
// Centralizing into one component means changes to the save workflow happen
// in one place. Cosmetic variations are exposed as props rather than fixed
// in the component, so each page keeps its existing visual identity.
//
// What's NOT in here: the actual save handler (each page builds its own DB
// payload). This is just the UI wrapper.

import React from 'react';
import { SendForReviewButton } from './SendForReview';

/**
 * Required props:
 *   onSave              — function called when the save button is clicked
 *   existingQuote       — the loaded quote object (or null on a brand-new quote)
 *   quoteStatus         — current status string ('draft', 'in_review', etc.)
 *   setQuoteStatus      — setter (passed through to SendForReviewButton)
 *   quoteType           — string passed to SendForReviewButton
 *
 * Optional behavior props:
 *   saving              — boolean, disables the button + shows "Saving..." label
 *   saveMsg             — string displayed near the save button when present
 *   saveDisabled        — extra disabled condition (e.g. !recipientBiz.trim())
 *   saveLabelNew        — text for new-quote save button (default: "Save Quote")
 *   saveLabelExisting   — text for existing-quote save button (default: "Update Quote")
 *   reviewQuote         — override the quote object passed to SendForReviewButton.
 *                         Some pages inject extra `inputs` shape into what reviewers see.
 *                         Defaults to { ...existingQuote, status: quoteStatus }.
 *   extraButtons        — JSX rendered alongside SendForReviewButton (only when existingQuote)
 *   leadingButtons      — JSX rendered in the same row as the save button, after it
 *   showWrapper         — boolean (default true). Set false to drop the gray-bg
 *                         wrapper card and render the buttons inline (FlexIT)
 *   wrapperStyle        — style overrides for the outer container
 *
 * Optional styling props (added to keep per-page visual identity):
 *   saveButtonColor     — bg color for save button (default: navy "#0f1e3c")
 *   saveButtonPadding   — padding (default: "7px 10px")
 *   saveButtonRadius    — border-radius in px (default: 4)
 *   saveButtonFontSize  — font-size in px (default: 11)
 *   saveButtonFontWeight — font-weight (default: 600)
 *   saveMsgPlacement    — "below" (default) or "inline" (next to button, FlexIT-style)
 *   reviewRowMarginTop  — margin between save row and review row (default: 6)
 */
export default function QuoteSaveBar({
  onSave,
  existingQuote,
  quoteStatus,
  setQuoteStatus,
  quoteType,

  saving = false,
  saveMsg = '',
  saveDisabled = false,
  saveLabelNew = 'Save Quote',
  saveLabelExisting = 'Update Quote',
  reviewQuote,
  extraButtons,
  leadingButtons,
  showWrapper = true,
  wrapperStyle,

  saveButtonColor = '#0f1e3c',
  saveButtonPadding = '7px 10px',
  saveButtonRadius = 4,
  saveButtonFontSize = 11,
  saveButtonFontWeight = 600,
  saveMsgPlacement = 'below',
  reviewRowMarginTop = 6,
}) {
  const buttonLabel = saving
    ? 'Saving...'
    : (existingQuote ? saveLabelExisting : saveLabelNew);

  const isDisabled = saving || saveDisabled;

  const reviewQuoteFinal = reviewQuote || (existingQuote
    ? { ...existingQuote, status: quoteStatus }
    : null);

  // Save button gets flex:1 when there are leading buttons sharing its row,
  // OR when the wrapper is hidden (FlexIT inline mode).
  // Otherwise it takes full width inside the wrapper.
  const saveButtonFlex = leadingButtons || !showWrapper ? 1 : undefined;
  const saveButtonWidth = !leadingButtons && showWrapper ? '100%' : undefined;

  const saveButton = (
    <button
      onClick={onSave}
      disabled={isDisabled}
      style={{
        flex: saveButtonFlex,
        width: saveButtonWidth,
        padding: saveButtonPadding,
        background: saveButtonColor,
        color: 'white',
        border: 'none',
        borderRadius: saveButtonRadius,
        fontSize: saveButtonFontSize,
        fontWeight: saveButtonFontWeight,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.6 : 1,
      }}
    >
      {buttonLabel}
    </button>
  );

  const inlineSaveMsg = saveMsg && saveMsgPlacement === 'inline' ? (
    <span style={{
      fontSize: 11,
      fontWeight: 600,
      color: saveMsg.startsWith('✓') || saveMsg.startsWith('Saved') ? '#166534'
           : saveMsg.startsWith('Error') || saveMsg.startsWith('✗') ? '#dc2626'
           : '#0f1e3c',
    }}>
      {saveMsg}
    </span>
  ) : null;

  const belowSaveMsg = saveMsg && saveMsgPlacement === 'below' ? (
    <div style={{
      fontSize: 11,
      fontWeight: 600,
      marginTop: 4,
      color: saveMsg.startsWith('Error') || saveMsg.startsWith('✗') ? '#dc2626' : '#166534',
    }}>
      {saveMsg}
    </div>
  ) : null;

  const saveRow = (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {saveButton}
      {leadingButtons}
      {inlineSaveMsg}
    </div>
  );

  const reviewRow = existingQuote ? (
    <div style={{ marginTop: reviewRowMarginTop, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {reviewQuoteFinal && (
        <SendForReviewButton
          quote={reviewQuoteFinal}
          quoteType={quoteType}
          onStatusChange={s => setQuoteStatus(s)}
        />
      )}
      {extraButtons}
    </div>
  ) : null;

  const innerContent = (
    <>
      {saveRow}
      {reviewRow}
      {belowSaveMsg}
    </>
  );

  if (!showWrapper) {
    return innerContent;
  }

  return (
    <div style={{
      padding: 8,
      background: '#f8fafc',
      borderRadius: 5,
      border: '1px solid #e5e7eb',
      marginTop: 4,
      ...wrapperStyle,
    }}>
      {innerContent}
    </div>
  );
}
