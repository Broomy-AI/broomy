import DownloadButton from './DownloadButton'
import CodeBlock from './CodeBlock'

const buildFromSource = `git clone https://github.com/broomy-ai/broomy.git
cd broomy
pnpm install
pnpm dev`

export default function GetStarted() {
  return (
    <section className="px-6 py-20 md:px-12 lg:py-28">
      <div className="mx-auto max-w-[1200px] text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-text-primary md:text-4xl">
          Get started
        </h2>

        {/* Build from source - primary for OSS */}
        <div className="mx-auto mt-10 max-w-lg text-left">
          <p className="mb-4 text-sm text-text-body">Clone and run in four commands:</p>
          <CodeBlock code={buildFromSource} />
          <p className="mt-4 text-sm text-text-muted">
            Requires pnpm and Node.js. See the{' '}
            <a
              href="https://github.com/broomy-ai/broomy#readme"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              README
            </a>{' '}
            for full setup instructions.
          </p>
        </div>

        {/* Secondary: download pre-built */}
        <div className="mt-12">
          <p className="mb-4 text-sm text-text-muted">
            Or download a pre-built release for Mac, Windows, or Linux:
          </p>
          <DownloadButton />
        </div>
      </div>
    </section>
  )
}
