// Feedback is delivered after any redraw, so success cannot disappear
// with the old History DOM. Settings can also retain it beside Import.
export function wireBackupImport(input, button, { importData, feedback, onImported = () => {} }) {
  if (!input || !button) return;
  button.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Importing…';
    feedback('Importing your backup…', false, false);
    try {
      const summary = importData(JSON.parse(await file.text()), { mode: 'merge' });
      await onImported(summary);
      const added = summary.pins + summary.blocked + summary.dives;
      const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
      feedback(added
        ? `Backup imported. Added ${count(summary.pins, 'pin')}, ${count(summary.blocked, 'blocked artist')} and ${count(summary.dives, 'dive')}.`
        : 'Backup imported. No new items to add.', false, true);
    } catch (error) {
      feedback(error?.message || "Couldn't read that backup.", true, true);
    } finally {
      input.value = '';
      button.disabled = false;
      button.textContent = label;
    }
  });
}
