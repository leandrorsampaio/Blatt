/* ================================================================
 *  STATE -- Single source of truth for all mutable application state
 * ================================================================ */
const state = {
  confirmCallback:  null,
  autoSaveTimer:    null,
  editorDirty:      false,
  editorData:       { header: {}, sections: [] },
  fitted:           true,
  currentPage:      1,
  totalPages:       1,
  showingTemplate:  false,
  currentMD:        '',
  currentName:      '',
  currentFormat:    {},
  formatPanelMinimized: false,
  editorAccordion: {},       /* { sectionIndex: true } = open */
  photo:            null,    /* the single stored photo record — see PHOTO module */
  photoImg:         null,    /* decoded source image, only while the Photo tab is used */
  photoDrag:        null,    /* pointer drag bookkeeping for the crop stage */
  photoCommitTimer: null,
  atsReading:       null,    /* text positions measured when the ATS tab opens -- see ATS module */
  atsReadingMode:   'columns',
  atsJobTimer:      null,
  sync:            { active: false, busy: false, blocked: false, stale: false, lastPollHash: null, dirtySince: 0,
                      failedHash: null, inflight: null, timer: null },
};
