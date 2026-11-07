import React, { useId, useMemo, useState } from "react";
import IllustrationSvg from "./IllustrationSvg";
import { answerMatches, practiceLabels, practicePreview } from "./practice";
import "./practice.css";

function PracticeSession({ document, onClose }) {
  const labels = useMemo(() => practiceLabels(document), [document]);
  const preview = useMemo(() => practicePreview(document), [document]);
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState({});
  const [finished, setFinished] = useState(false);
  const inputId = useId();
  const label = labels[index];
  const response = responses[label?.id] || { answer: "", result: "" };
  const completed = Object.values(responses).filter(item => ["correct", "revealed"].includes(item.result)).length;
  const correct = Object.values(responses).filter(item => item.result === "correct").length;
  const update = patch => setResponses(current => ({ ...current, [label.id]: { ...response, ...patch } }));
  const retry = () => { setIndex(0); setResponses({}); setFinished(false); };

  return <section className="sci-practice" aria-label="Label practice" onKeyDown={event => event.stopPropagation()}>
    <header className="sci-practice-header">
      <div><h2>Label practice</h2><p>Read-only practice · zero AI credits</p></div>
      <button type="button" onClick={onClose}>Return to editor</button>
    </header>
    {!labels.length ? <div className="sci-practice-empty">
      <h3>No visible prepared labels</h3>
      <p>Return to the editor to show labels or choose a figure with prepared, independently editable labels.</p>
    </div> : <>
      <p className="sci-practice-disclosure">Only prepared labels are masked. Source artwork may contain lettering that cannot be hidden.</p>
      <div className="sci-practice-layout">
        <div className="sci-practice-figure"><IllustrationSvg document={preview} prefix={`${preview.id}-practice`} descriptiveTitles={false} /></div>
        <div className="sci-practice-card">
          <p className="sci-practice-progress">{completed} of {labels.length} completed</p>
          <progress aria-label="Completed labels" value={completed} max={labels.length} />
          {finished ? <div className="sci-practice-summary">
            <h3>Practice complete</h3>
            <p>{correct} of {labels.length} answered correctly.</p>
            <p>{completed - correct} revealed. Your illustration is unchanged.</p>
            <button type="button" onClick={retry}>Retry all labels</button>
          </div> : <form onSubmit={event => { event.preventDefault(); update({ result: answerMatches(response.answer, label.text) ? "correct" : "incorrect" }); }}>
            <h3>Identify label {index + 1}</h3>
            <p>Find <strong>{index + 1} ?</strong> in the figure.</p>
            <label htmlFor={inputId}>Answer for label {index + 1}</label>
            <input id={inputId} key={label.id} value={response.answer} onChange={event => update({ answer: event.target.value, result: "" })} autoComplete="off" spellCheck={false} aria-describedby={`${inputId}-hint ${inputId}-result`} />
            <p id={`${inputId}-hint`} className="sci-practice-hint">Case and extra spaces are ignored. Keep scientific symbols, subscripts and direction marks.</p>
            <div id={`${inputId}-result`} className="sci-practice-result" role="status">
              {response.result === "correct" && "Correct."}
              {response.result === "incorrect" && "Try again, or reveal the prepared answer."}
              {response.result === "revealed" && <>Prepared answer: <strong>{label.text}</strong></>}
            </div>
            <div className="sci-practice-actions">
              <button type="submit" disabled={!response.answer.trim() || ["correct", "revealed"].includes(response.result)}>Check answer</button>
              <button type="button" onClick={() => update({ result: "revealed" })} disabled={["correct", "revealed"].includes(response.result)}>Reveal answer</button>
              <button type="button" disabled={!["correct", "revealed"].includes(response.result)} onClick={() => { if (index + 1 === labels.length) setFinished(true); else setIndex(index + 1); }}>{index + 1 === labels.length ? "Finish practice" : "Next label"}</button>
            </div>
          </form>}
        </div>
      </div>
    </>}
  </section>;
}

export default function StudioPractice(props) {
  // A replacement document starts a fresh session; practice answers never enter its schema.
  return <PracticeSession key={JSON.stringify(props.document)} {...props} />;
}
