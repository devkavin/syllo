import React from "react";
import { GraduationCap } from "lucide-react";
import { Link } from "react-router-dom";

export default function LegalLayout({ title, summary, children }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/60">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2" aria-label="Syllo home">
            <span className="w-8 h-8 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <GraduationCap className="w-4 h-4" />
            </span>
            <span className="font-serif text-lg">Syllo</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground" aria-label="Legal pages">
            <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="mb-10 border-b border-border pb-8">
          <p className="section-title mb-3">Syllo legal</p>
          <h1 className="font-serif text-4xl sm:text-5xl tracking-tight">{title}</h1>
          <p className="mt-4 text-muted-foreground leading-relaxed max-w-2xl">{summary}</p>
          <p className="mt-4 text-xs text-muted-foreground">Effective September 29, 2026 · Updated October 5, 2026</p>
        </div>
        <article className="space-y-9 text-sm sm:text-base leading-7 legal-copy">
          {children}
        </article>
      </main>

      <footer className="border-t border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-2">
          <span>© 2026 Kavindra Senanayake, trading as Syllo (Kavin HQ)</span>
          <a href="mailto:support@syllo.kavinhq.com" className="hover:text-foreground">support@syllo.kavinhq.com</a>
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({ title, children }) {
  return (
    <section>
      <h2 className="font-serif text-2xl mb-3">{title}</h2>
      <div className="space-y-3 text-muted-foreground [&_strong]:text-foreground [&_a]:text-foreground [&_a]:underline [&_ul]:list-disc [&_ul]:pl-6 [&_li]:pl-1">
        {children}
      </div>
    </section>
  );
}
