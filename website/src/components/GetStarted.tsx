import DownloadButton from './DownloadButton'
import CodeBlock from './CodeBlock'

const buildFromSource = `git clone https://github.com/robennals/broomer.git
cd broomer/main
pnpm install
pnpm dev`

export default function GetStarted() {
  return (
    <section className="px-6 py-20 md:px-12 lg:py-28">
      <div className="mx-auto max-w-[1200px] text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-text-primary md:text-4xl">
          Get started
        </h2>

        {/* Primary: download */}
        <div className="mt-10">
          <DownloadButton />
        </div>

        {/* Secondary: build from source */}
        <div className="mx-auto mt-16 max-w-lg text-left">
          <p className="mb-4 text-sm text-text-muted">Or build from source:</p>
          <CodeBlock code={buildFromSource} />
          <p className="mt-4 text-sm text-text-muted">
            Requires pnpm. See the README for full setup instructions.
          </p>
        </div>
      </div>
    </section>
  )
}
