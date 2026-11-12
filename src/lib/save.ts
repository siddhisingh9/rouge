// Run a write from a click handler without letting a failure pass silently.
export function save(write: Promise<unknown>): void {
  write.catch((error: unknown) => {
    console.error(error);
    window.alert('Sorry, that change could not be saved. Please try again.');
  });
}
