export default function Footer() {
  return (
    <footer className="border-t border-border-subtle px-6 py-12 md:px-12">
      <div className="mx-auto max-w-[1200px] text-center text-sm text-text-muted">
        Broomy &mdash; Open source desktop app for managing AI coding agents.
        <br className="sm:hidden" />{' '}
        <a
          href="https://github.com/robennals/broomer/blob/main/LICENSE"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-text-body"
        >
          MIT License
        </a>{' '}
        &middot;{' '}
        <a
          href="https://github.com/robennals/broomer"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-text-body"
        >
          GitHub
        </a>{' '}
        &middot; Built with Electron, React, and TypeScript.
      </div>
    </footer>
  )
}
