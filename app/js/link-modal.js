/* ================================================================
 *  LINK MODAL -- Insert links into richtext fields
 * ================================================================ */
var linkModalRange = null; /* saved selection so we can restore it after modal */

function openLinkModal() {
  /* Save current selection */
  var sel = window.getSelection();
  if (sel.rangeCount) {
    linkModalRange = sel.getRangeAt(0).cloneRange();
    /* Pre-fill display text from selection */
    var selectedText = sel.toString();
    document.getElementById('link-text').value = selectedText || '';
  } else {
    linkModalRange = null;
    document.getElementById('link-text').value = '';
  }
  document.getElementById('link-url').value = '';
  document.getElementById('link-modal').classList.add('open');
  document.getElementById('link-url').focus();
}

function closeLinkModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('link-modal').classList.remove('open');
  linkModalRange = null;
}

function confirmInsertLink() {
  var text = document.getElementById('link-text').value.trim();
  var url = document.getElementById('link-url').value.trim();
  if (!url) return;
  /* Add protocol if missing */
  if (!/^https?:\/\/|^mailto:/i.test(url)) url = 'https://' + url;
  if (!text) text = url;

  /* Save range before closing modal (closeLinkModal clears it) */
  var savedRange = linkModalRange;
  closeLinkModal();

  /* Restore selection and insert the link */
  if (savedRange) {
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
    /* Delete selected text if any */
    savedRange.deleteContents();
    var a = document.createElement('a');
    a.href = url;
    a.textContent = text;
    savedRange.insertNode(a);
    /* Move cursor after the link */
    sel.collapseToEnd();
    /* Trigger sync on the richtext field */
    var rt = a.closest('.ed-richtext');
    if (rt) { syncRichText(rt); markDirty(); }
  }
}

/* Link modal keyboard shortcuts */
document.addEventListener('keydown', function(e) {
  var modal = document.getElementById('link-modal');
  if (!modal.classList.contains('open')) return;
  if (e.key === 'Escape') closeLinkModal();
  if (e.key === 'Enter') { e.preventDefault(); confirmInsertLink(); }
});
