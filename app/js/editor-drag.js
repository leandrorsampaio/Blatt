/* ================================================================
 *  EDITOR DRAG & DROP -- Reorder sections and entries
 * ================================================================ */

/* ── Reorder: sections (native drag & drop) ── */
var drag = {
  si: -1,
  indicator: null,
  indicatorPos: null,   /* cached position to avoid redundant DOM moves */
  activeZone: null,     /* currently highlighted drop zone element */
};

/* Create the drop indicator once */
drag.indicator = document.createElement('div');
drag.indicator.className = 'ed-drop-indicator';

/* ── Card-side events ── */

function onSectionDragStart(e, si) {
  drag.si = si;
  drag.indicatorPos = null;
  drag.activeZone = null;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(si));
  /* Delay adding class so the drag image captures the full card */
  setTimeout(function() {
    var el = document.querySelector('.ed-section[data-si="' + si + '"]');
    if (el) el.classList.add('--dragging');
  }, 0);
}

function onSectionDragEnd(e) {
  /* Restore dragged card */
  var el = document.querySelector('.ed-section.--dragging');
  if (el) el.classList.remove('--dragging');
  /* Clean up all zones */
  document.querySelectorAll('.--dragOver').forEach(function(z) { z.classList.remove('--dragOver'); });
  /* Remove indicator */
  if (drag.indicator.parentNode) drag.indicator.remove();
  drag.indicatorPos = null;
  drag.activeZone = null;
  drag.si = -1;
}

/* ── Drop zone resolution ── */

function getValidDropZones() {
  if (drag.si === -1) return [];
  var dragType = state.editorData.sections[drag.si].type;
  var zones = [];

  if (dragType === 'sidebar') {
    var col = document.querySelector('.ed-page-column[data-group="sidebar"]');
    if (col) zones.push({ el: col, group: 'sidebar', pageIdx: 0 });
  } else {
    var mainCol = document.querySelector('.ed-page-column[data-group="main"]');
    if (mainCol) zones.push({ el: mainCol, group: 'main', pageIdx: 0 });
    document.querySelectorAll('.ed-page-container').forEach(function(c) {
      var pi = parseInt(c.dataset.page);
      if (pi > 0) zones.push({ el: c, group: 'main', pageIdx: pi });
    });
  }
  return zones;
}

function findZoneForElement(el) {
  var zones = getValidDropZones();
  for (var i = 0; i < zones.length; i++) {
    if (zones[i].el.contains(el)) return zones[i];
  }
  return null;
}

/* ── Position calculation (midpoint algorithm) ── */

function getDropPosition(container, clientY) {
  var sections = Array.from(container.querySelectorAll('.ed-section:not(.--dragging)'));
  var position = sections.length;
  for (var i = 0; i < sections.length; i++) {
    var rect = sections[i].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      position = i;
      break;
    }
  }
  return { index: position, sections: sections };
}

function calcTargetDataIdx(zone, dropPos) {
  if (dropPos.sections.length > 0 && dropPos.index < dropPos.sections.length) {
    return parseInt(dropPos.sections[dropPos.index].dataset.si);
  } else if (dropPos.sections.length > 0) {
    var lastSi = parseInt(dropPos.sections[dropPos.sections.length - 1].dataset.si);
    return lastSi + 1;
  } else {
    /* Empty zone */
    if (zone.pageIdx === 0) {
      if (zone.group === 'sidebar') {
        var idx = 0;
        for (var i = 0; i < state.editorData.sections.length; i++) {
          if (state.editorData.sections[i].type === 'sidebar') idx = i + 1;
          else break;
        }
        return idx;
      } else {
        for (var i = 0; i < state.editorData.sections.length; i++) {
          if (state.editorData.sections[i].type === 'page') return i;
        }
        return state.editorData.sections.length;
      }
    } else {
      var count = 0;
      for (var i = 0; i < state.editorData.sections.length; i++) {
        if (state.editorData.sections[i].type === 'page') {
          count++;
          if (count === zone.pageIdx) return i + 1;
        }
      }
      return state.editorData.sections.length;
    }
  }
}

/* ── Indicator management (cached to avoid layout thrashing) ── */

function showIndicator(container, dropPos) {
  var posKey = container.dataset.page + ':' + (container.dataset.group || '') + ':' + dropPos.index;
  if (posKey === drag.indicatorPos && drag.indicator.parentNode) return;

  if (drag.indicator.parentNode) drag.indicator.remove();

  if (dropPos.index < dropPos.sections.length) {
    dropPos.sections[dropPos.index].parentNode.insertBefore(drag.indicator, dropPos.sections[dropPos.index]);
  } else {
    var addBtns = container.querySelector('div[style]');
    if (addBtns) container.insertBefore(drag.indicator, addBtns);
    else container.appendChild(drag.indicator);
  }
  drag.indicatorPos = posKey;
}

function removeIndicator() {
  if (drag.indicator.parentNode) drag.indicator.remove();
  drag.indicatorPos = null;
}

/* ── Drop zone event setup (wired after each renderEditor) ── */

function setupDropZones() {
  var allZones = document.querySelectorAll('.ed-page-column, .ed-page-container[data-page]:not([data-page="0"])');
  allZones.forEach(function(zone) {
    zone.addEventListener('dragover', function(e) {
      if (drag.si === -1) return;
      var z = findZoneForElement(zone);
      if (!z) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      var dropPos = getDropPosition(zone, e.clientY);
      showIndicator(zone, dropPos);
    });

    zone.addEventListener('dragenter', function(e) {
      if (drag.si === -1) return;
      var z = findZoneForElement(zone);
      if (!z) return;
      e.preventDefault();
      zone.classList.add('--dragOver');
      drag.activeZone = zone;
    });

    zone.addEventListener('dragleave', function(e) {
      /* Guard: only remove tint if truly leaving, not crossing a child */
      if (!zone.contains(e.relatedTarget)) {
        zone.classList.remove('--dragOver');
        if (drag.activeZone === zone) {
          removeIndicator();
          drag.activeZone = null;
        }
      }
    });

    zone.addEventListener('drop', function(e) {
      e.preventDefault();
      zone.classList.remove('--dragOver');
      removeIndicator();

      var si = parseInt(e.dataTransfer.getData('text/plain'));
      if (isNaN(si) || si < 0) return;

      var z = findZoneForElement(zone);
      if (!z) return;

      var dropPos = getDropPosition(zone, e.clientY);
      var targetDataIdx = calcTargetDataIdx(z, dropPos);

      /* Skip no-op moves */
      if (targetDataIdx === si || targetDataIdx === si + 1) return;

      var to = targetDataIdx;
      if (si < to) to--;
      moveSectionTo(si, to);
    });
  });
}

/* Move section `from` so that it ends up at index `to`; open sections stay open */
function moveSectionTo(from, to) {
  if (from === to) return;
  var moved = state.editorData.sections.splice(from, 1)[0];
  state.editorData.sections.splice(to, 0, moved);

  var oldAcc = state.editorAccordion;
  var newAcc = {};
  for (var i = 0; i < state.editorData.sections.length; i++) {
    var origIdx;
    if (i === to) origIdx = from;
    else if (from < to) origIdx = (i >= from && i < to) ? i + 1 : i;
    else origIdx = (i > to && i <= from) ? i - 1 : i;
    if (oldAcc[origIdx]) newAcc[i] = true;
  }
  state.editorAccordion = newAcc;

  renderEditor();
  markDirty();
}

/* ── Reorder with buttons (touch screens and phones, where dragging is unreliable) ── */

/* The ▲▼ pair; `call` is the start of the handler call, e.g. "moveSection(3,", and the
   direction completes it. CSS shows the pair only where the drag handles are hidden. */
function moveButtons(call, canUp, canDown, what) {
  return '<button class="ed-move-btn ed-touch-only" onclick="' + call + '-1)" title="Move ' + what + ' up"' + (canUp ? '' : ' disabled') + '>&#x25B2;</button>' +
    '<button class="ed-move-btn ed-touch-only" onclick="' + call + '1)" title="Move ' + what + ' down"' + (canDown ? '' : ' disabled') + '>&#x25BC;</button>';
}

/* Where section si goes one step up (dir -1) or down (dir 1), or -1 if it can't.
   A sidebar section swaps with its neighbour in the sidebar on the same page. A main
   section swaps with the next main section, or crosses a page break: up from the
   top of a page it goes to the end of the page before, down from the end to the
   top of the page after. Sidebar sections in between are skipped. */
function sectionMoveTarget(si, dir) {
  var secs = state.editorData.sections;
  var type = secs[si].type;
  for (var j = si + dir; j >= 0 && j < secs.length; j += dir) {
    if (secs[j].type === 'page') return type === 'main' ? j : -1;
    if (secs[j].type === type) return j;
  }
  return -1;
}

function moveSection(si, dir) {
  var j = sectionMoveTarget(si, dir);
  if (j === -1) return;
  var secs = state.editorData.sections;
  if (secs[j].type === 'page' || secs[si].type === 'main') moveSectionTo(si, j);
  else {
    /* Sidebar sections swap places, so the main sections between them stay put */
    var a = secs[si]; secs[si] = secs[j]; secs[j] = a;
    var acc = state.editorAccordion, open = acc[si];
    if (acc[j]) acc[si] = true; else delete acc[si];
    if (open) acc[j] = true; else delete acc[j];
    renderEditor();
    markDirty();
  }
}

/* An entry and the roles that follow it as "(same)" form one group */
function entryGroupEnd(entries, ei) {
  var e = ei + 1;
  while (e < entries.length && entries[e].title === '(same)') e++;
  return e;
}

/* The first entry of the group before ei's, or -1 if ei's is the first */
function prevEntryGroup(entries, ei) {
  for (var p = ei - 1; p >= 0; p--) {
    if (entries[p].title !== '(same)') return p;
  }
  return -1;
}

/* Move the group that starts at `from` to just before index `before` (entries.length = the end) */
function moveEntryGroupTo(si, from, before) {
  var entries = state.editorData.sections[si].entries;
  var end = entryGroupEnd(entries, from);
  if (before >= from && before <= end) return;
  var group = entries.splice(from, end - from);
  if (before > from) before -= group.length;
  Array.prototype.splice.apply(entries, [before, 0].concat(group));
  refreshSection(si); markDirty();
}

function moveEntry(si, ei, dir) {
  var entries = state.editorData.sections[si].entries;
  if (dir < 0) {
    var p = prevEntryGroup(entries, ei);
    if (p !== -1) moveEntryGroupTo(si, ei, p);
  } else {
    var next = entryGroupEnd(entries, ei);
    if (next < entries.length) moveEntryGroupTo(si, ei, entryGroupEnd(entries, next));
  }
}

/* A role moves within its organisation only */
function moveSubEntry(si, ei, dir) {
  var entries = state.editorData.sections[si].entries;
  var j = ei + dir;
  if (entries[ei].title !== '(same)' || j < 0 || j >= entries.length || entries[j].title !== '(same)') return;
  var a = entries[ei]; entries[ei] = entries[j]; entries[j] = a;
  refreshSection(si); markDirty();
}

/* ── Reorder: entries via drag & drop ── */
var entryDrag = { si: -1, ei: -1, scope: '', parentEi: -1, indicator: null, indicatorPos: null };
entryDrag.indicator = document.createElement('div');
entryDrag.indicator.className = 'ed-drop-indicator';

function onEntryDragStart(e, si, ei) {
  e.stopPropagation();
  entryDrag.si = si;
  entryDrag.ei = ei;
  entryDrag.scope = 'entry';
  entryDrag.indicatorPos = null;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'entry:' + si + ':' + ei);
  setTimeout(function() {
    var el = document.querySelector('.ed-entry[data-si="' + si + '"][data-ei="' + ei + '"]');
    if (el) el.classList.add('--dragging');
  }, 0);
}

function onEntryDragEnd(e) {
  document.querySelectorAll('.ed-entry.--dragging').forEach(function(el) { el.classList.remove('--dragging'); });
  document.querySelectorAll('.--dragOver').forEach(function(el) { el.classList.remove('--dragOver'); });
  if (entryDrag.indicator.parentNode) entryDrag.indicator.remove();
  entryDrag.si = -1; entryDrag.ei = -1; entryDrag.indicatorPos = null;
}

function onSubEntryDragStart(e, si, ei, parentEi) {
  e.stopPropagation();
  entryDrag.si = si;
  entryDrag.ei = ei;
  entryDrag.scope = 'sub-entry';
  entryDrag.parentEi = parentEi;
  entryDrag.indicatorPos = null;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'sub:' + si + ':' + ei);
  setTimeout(function() {
    var el = document.querySelector('.ed-sub-entry[data-si="' + si + '"][data-ei="' + ei + '"]');
    if (el) el.classList.add('--dragging');
  }, 0);
}

function onSubEntryDragEnd(e) {
  document.querySelectorAll('.ed-sub-entry.--dragging').forEach(function(el) { el.classList.remove('--dragging'); });
  document.querySelectorAll('.--dragOver').forEach(function(el) { el.classList.remove('--dragOver'); });
  if (entryDrag.indicator.parentNode) entryDrag.indicator.remove();
  entryDrag.si = -1; entryDrag.ei = -1; entryDrag.indicatorPos = null;
}

function setupEntryDropZones(root) {
  root = root || document;
  /* Entry reordering within a section body */
  root.querySelectorAll('.ed-section-body').forEach(function(body) {
    body.addEventListener('dragover', function(e) {
      if (entryDrag.si === -1 || entryDrag.scope !== 'entry') return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      var entries = Array.from(body.querySelectorAll(':scope > .ed-entry:not(.--dragging)'));
      var pos = entries.length;
      for (var i = 0; i < entries.length; i++) {
        var r = entries[i].getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) { pos = i; break; }
      }
      var posKey = 'entry:' + pos;
      if (posKey !== entryDrag.indicatorPos || !entryDrag.indicator.parentNode) {
        if (entryDrag.indicator.parentNode) entryDrag.indicator.remove();
        if (pos < entries.length) body.insertBefore(entryDrag.indicator, entries[pos]);
        else {
          var addBtn = body.querySelector(':scope > .ed-add-btn');
          if (addBtn) body.insertBefore(entryDrag.indicator, addBtn);
          else body.appendChild(entryDrag.indicator);
        }
        entryDrag.indicatorPos = posKey;
      }
    });

    body.addEventListener('drop', function(e) {
      if (entryDrag.si === -1 || entryDrag.scope !== 'entry') return;
      e.preventDefault();
      e.stopPropagation();
      if (entryDrag.indicator.parentNode) entryDrag.indicator.remove();

      var entries = Array.from(body.querySelectorAll(':scope > .ed-entry:not(.--dragging)'));
      var pos = entries.length;
      for (var i = 0; i < entries.length; i++) {
        var r = entries[i].getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) { pos = i; break; }
      }

      /* Map visual position to data index; the entry's roles move with it */
      var si = entryDrag.si;
      var before = pos < entries.length ? parseInt(entries[pos].dataset.ei) : state.editorData.sections[si].entries.length;
      moveEntryGroupTo(si, entryDrag.ei, before);
    });
  });

  /* Sub-entry reordering within a sub-entries container */
  root.querySelectorAll('.ed-sub-entries').forEach(function(container) {
    container.addEventListener('dragover', function(e) {
      if (entryDrag.si === -1 || entryDrag.scope !== 'sub-entry') return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      var subs = Array.from(container.querySelectorAll('.ed-sub-entry:not(.--dragging)'));
      var pos = subs.length;
      for (var i = 0; i < subs.length; i++) {
        var r = subs[i].getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) { pos = i; break; }
      }
      var posKey = 'sub:' + pos;
      if (posKey !== entryDrag.indicatorPos || !entryDrag.indicator.parentNode) {
        if (entryDrag.indicator.parentNode) entryDrag.indicator.remove();
        if (pos < subs.length) container.insertBefore(entryDrag.indicator, subs[pos]);
        else {
          var addBtn = container.querySelector('.ed-add-btn');
          if (addBtn) container.insertBefore(entryDrag.indicator, addBtn);
          else container.appendChild(entryDrag.indicator);
        }
        entryDrag.indicatorPos = posKey;
      }
    });

    container.addEventListener('drop', function(e) {
      if (entryDrag.si === -1 || entryDrag.scope !== 'sub-entry') return;
      e.preventDefault();
      e.stopPropagation();
      if (entryDrag.indicator.parentNode) entryDrag.indicator.remove();

      var subs = Array.from(container.querySelectorAll('.ed-sub-entry:not(.--dragging)'));
      var pos = subs.length;
      for (var i = 0; i < subs.length; i++) {
        var r = subs[i].getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) { pos = i; break; }
      }

      var si = entryDrag.si, from = entryDrag.ei;
      var targetEi;
      if (pos < subs.length) targetEi = parseInt(subs[pos].dataset.ei);
      else if (subs.length > 0) targetEi = parseInt(subs[subs.length - 1].dataset.ei) + 1;
      else targetEi = from;

      if (from < targetEi) targetEi--;
      if (from === targetEi) return;

      var moved = state.editorData.sections[si].entries.splice(from, 1)[0];
      state.editorData.sections[si].entries.splice(targetEi, 0, moved);
      refreshSection(si); markDirty();
    });
  });
}
