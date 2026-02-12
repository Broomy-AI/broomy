# File Viewers

Plugin-based file viewer system that allows different renderers to handle files based on extension and content type. Each viewer implements the `FileViewerPlugin` interface with a `canHandle` predicate and a priority, so the registry can automatically select the best viewer for any file. New viewers can be added by implementing the interface and registering in `index.ts`.

## How It Connects

`FileViewer.tsx` in the parent components directory calls `getViewersForFile()` from the registry to determine which viewers are available for a given file path, then renders the selected viewer's component with the loaded content. The MonacoDiffViewer is used directly by FileViewer for diff mode rather than going through the plugin system, since diff viewing requires a separate two-pane editor. All viewers receive props defined by `FileViewerComponentProps` in `types.ts`.

## Files

| File | Description |
|------|-------------|
| `index.ts` | Viewer registry: lists all plugins, provides lookup by file path, and exports a text-detection heuristic |
| `types.ts` | TypeScript interfaces for FileViewerPlugin, FileViewerComponentProps, EditorActions, and extension helpers |
| `types.test.ts` | Unit tests for file extension matching and type utilities |
| `MonacoViewer.tsx` | Full Monaco editor with syntax highlighting, editing, save, go-to-definition, and outline support |
| `MonacoDiffViewer.tsx` | Monaco diff editor for side-by-side or inline file comparison with scroll-to-line |
| `ImageViewer.tsx` | Image renderer with zoom, pan, and base64 loading for PNG, JPEG, GIF, WebP, BMP, ICO, SVG |
| `MarkdownViewer.tsx` | Markdown preview using react-markdown with GFM support and dark-theme styled elements |
