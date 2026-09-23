export async function openExternal(url: string) {
  try {
    const { open } = await import('@tauri-apps/api/shell');
    await open(url);
  } catch {
    globalThis.open(url, '_blank', 'noopener,noreferrer');
  }
}
