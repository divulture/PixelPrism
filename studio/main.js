// Starts Studio once every file has loaded.

render();
trackProductEvent('studio_opened');
restoreComments();
restoreChanges();
syncChangeUi();
checkFileSchemeAccess();
pruneAttachments();
pruneViewSnapshots();
