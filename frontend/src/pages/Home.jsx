import React from "react";
import { ArrowRight, BookOpen, CalendarDays, Check, Clock3 } from "lucide-react";
import { TODAY_STARTER } from "@/lib/studyPrompts";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:block focus:p-4">Skip to content</a>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <a href="/" className="font-serif text-2xl tracking-tight" aria-label="Syllo home">syllo</a>
        <nav aria-label="Main navigation" className="flex items-center gap-4 text-sm">
          <a href="/pricing" className="text-muted-foreground hover:text-foreground">Plans</a>
          <a href="/login" className="btn btn-outline">Sign in</a>
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-5 sm:px-8">
        <section className="grid items-center gap-12 py-14 sm:py-24 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="section-title mb-5">Your personal study space</p>
            <h1 className="font-serif text-5xl leading-[1.08] tracking-tight sm:text-6xl">Make the time<br />you have count.</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">Classes, deadlines, notes and exams belong together. Syllo gives you one place to plan your day, focus on your work, and return to what you’ve learned.</p>
            <a href="/register" className="btn btn-primary mt-8">Start studying for free <ArrowRight className="h-4 w-4" /></a>
            <p className="mt-3 text-xs text-muted-foreground">Free study tools. No card required.</p>
          </div>
          <div className="border border-border bg-card p-6 sm:p-8" aria-label="An example day in Syllo">
            <div className="mb-6 flex items-center justify-between"><h2 className="font-serif text-2xl">A little direction.</h2><span className="text-xs text-muted-foreground">Example day</span></div>
            {[
              [CalendarDays, "Next class", "Mathematics · 10:30–11:30"],
              [BookOpen, "Ready to revisit", "Limits · a short review"],
              [Check, "One task to finish", "Physics worksheet · due today"],
              [Clock3, "Time to focus", "25 minutes, one thing at a time"],
            ].map(([Icon, title, detail]) => <div key={title} className="flex gap-3 border-t border-border py-4"><Icon aria-hidden="true" className="mt-1 h-4 w-4 text-primary" /><div><div className="text-sm font-medium">{title}</div><div className="mt-1 text-sm text-muted-foreground">{detail}</div></div></div>)}
          </div>
        </section>
        <section className="border-y border-border py-12 sm:py-16">
          <p className="section-title mb-4">Start with the question that matters</p>
          <h2 className="max-w-3xl font-serif text-3xl leading-snug sm:text-4xl">“{TODAY_STARTER}”</h2>
          <p className="mt-5 max-w-2xl leading-relaxed text-muted-foreground">Bring that question to your Study Companion. Get a clear next step, an explanation, or a practice question when you need one. You choose when to ask.</p>
        </section>
        <section className="grid gap-10 py-14 sm:py-20 md:grid-cols-3" aria-label="How Syllo helps you study">
          {[
            ["01", "Get your day together", "Keep subjects, notes, tasks and your weekly timetable in one place. Add what you need; you can build your curriculum gradually."],
            ["02", "Give one thing your attention", "Choose a subject and start a focus session. Your study time is recorded, so you don’t need to maintain another spreadsheet."],
            ["03", "Come back to what matters", "Review lessons you’ve learned and see your study progress. Private Circles give you a small space to share study goals with friends."],
          ].map(([number, title, text]) => <article key={number}><div className="font-mono text-xs text-muted-foreground">{number}</div><h2 className="mt-4 font-serif text-2xl">{title}</h2><p className="mt-3 leading-relaxed text-muted-foreground">{text}</p></article>)}
        </section>
        <section className="border-t border-border py-12 sm:py-16"><h2 className="font-serif text-3xl">Start with the work you have today.</h2><p className="mt-3 text-muted-foreground">Freshman is free. Explore the upcoming paid plans when you need more study helps.</p><div className="mt-6 flex flex-wrap gap-3"><a href="/register" className="btn btn-primary">Create your free account</a><a href="/pricing" className="btn btn-outline">See plans</a></div></section>
      </main>
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-border px-5 py-8 text-xs text-muted-foreground sm:px-8"><span>syllo · A personal academic workspace</span><nav aria-label="Footer" className="flex gap-5"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="mailto:support@syllo.kavinhq.com">Support</a></nav></footer>
    </div>
  );
}
