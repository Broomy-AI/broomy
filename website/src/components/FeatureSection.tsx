interface FeatureSectionProps {
  eyebrow: string
  title: string
  description: string
  screenshot: string
  alt: string
  direction: 'left' | 'right'
}

export default function FeatureSection({
  eyebrow,
  title,
  description,
  screenshot,
  alt,
  direction,
}: FeatureSectionProps) {
  const imageBlock = (
    <div className="flex-[3]">
      <div className="overflow-hidden rounded-xl border border-border-subtle shadow-[0_25px_50px_rgba(0,0,0,0.5)] transition-transform duration-200 hover:scale-[1.01]">
        <img
          src={screenshot}
          alt={alt}
          className="w-full"
          width={900}
          height={580}
          loading="lazy"
        />
      </div>
    </div>
  )

  const textBlock = (
    <div className="flex flex-[2] flex-col justify-center">
      <span className="font-mono text-sm font-medium uppercase tracking-wider text-accent">
        {eyebrow}
      </span>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-text-primary md:text-3xl">
        {title}
      </h2>
      <p className="mt-4 max-w-md leading-relaxed text-text-body">
        {description}
      </p>
    </div>
  )

  return (
    <section className="px-6 py-16 md:px-12 lg:py-20">
      <div
        className={`mx-auto flex max-w-[1200px] flex-col gap-12 lg:flex-row lg:items-center lg:gap-16 ${
          direction === 'right' ? 'lg:flex-row-reverse' : ''
        }`}
      >
        {imageBlock}
        {textBlock}
      </div>
    </section>
  )
}
