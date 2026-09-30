chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "AUS_TOGGLE_PANEL" });
  } catch (_) {
    // Desteklenmeyen sayfalarda sessizce geç.
  }
});
