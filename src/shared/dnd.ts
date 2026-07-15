/**
 * Drag-and-drop MIME types shared across the app.
 *
 * Dedicated type for dragging a file path out of Broomy's own file explorer.
 * Deliberately NOT text/plain (which the terminal-tab reorder DnD uses), so the
 * terminal drop target reacts only to real file drags, never to a tab reorder.
 */
export const FILE_PATH_MIME = 'application/x-broomy-file-path'
