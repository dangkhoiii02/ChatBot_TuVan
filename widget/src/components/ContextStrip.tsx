import type { IntentCategory } from '../types';

interface Props {
  intents: IntentCategory[];
  quote: string;
}

export function ContextStrip({ intents, quote }: Props) {
  return (
    <section className="context-strip" aria-label="Ngữ cảnh hội thoại">
      <div className="intent-chips">
        {intents.map((intent) => (
          <span key={intent} className={`intent-chip intent-${intent === 'Tâm sự' ? 'purple' : 'blue'}`}>
            {intent}
          </span>
        ))}
      </div>
      <p className="context-quote">“{quote}”</p>
    </section>
  );
}
