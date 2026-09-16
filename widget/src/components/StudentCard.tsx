import type { PronounPair, StudentProfile } from '../types';
import { formatPair } from '../lib/applyPronouns';
import { PronounBar } from './PronounBar';

interface Props {
  student: StudentProfile;
  pronouns: PronounPair;
  onPronounsChange: (pair: PronounPair) => void;
}

export function StudentCard({ student, pronouns, onPronounsChange }: Props) {
  return (
    <section className="student-card" aria-label="Thông tin học viên">
      <div className="student-card-top">
        <div className="avatar" aria-hidden>
          {student.initials}
        </div>
        <div className="student-main">
          <div className="student-name-row">
            <h2 className="student-name">{student.name}</h2>
            <span className="status-chip">{student.statusLabel}</span>
          </div>
          <div className="student-course">{student.courseLabel}</div>
        </div>
      </div>
      <div className="student-meta">
        <span className="pronoun-current">{formatPair(pronouns)}</span>
        <span className="meta-sep">·</span>
        <span className="channel">
          <span className="messenger-icon" aria-hidden />
          {student.channel}
        </span>
      </div>
      <p className="student-note">{student.note}</p>
      <PronounBar value={pronouns} onChange={onPronounsChange} compact />
    </section>
  );
}
