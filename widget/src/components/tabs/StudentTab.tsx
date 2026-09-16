import type { PronounPair, StudentProfile } from '../../types';
import { PronounBar } from '../PronounBar';

interface Props {
  student: StudentProfile;
  pronouns: PronounPair;
  onPronounsChange: (pair: PronounPair) => void;
  notes: string;
  memories: string[];
  onNotesChange: (value: string) => void;
  onAddMemory: (value: string) => void;
}

export function StudentTab({
  student,
  pronouns,
  onPronounsChange,
  notes,
  memories,
  onNotesChange,
  onAddMemory,
}: Props) {
  return (
    <div className="tab-panel student-tab">
      <div className="field-block">
        <div className="field-label">Đại từ xưng hô</div>
        <PronounBar value={pronouns} onChange={onPronounsChange} />
      </div>

      <div className="field-block">
        <div className="field-label">Hồ sơ</div>
        <ul className="profile-list">
          {student.profileFields.map((f) => (
            <li key={f.label}>
              <span>{f.label}</span>
              <strong>{f.value}</strong>
            </li>
          ))}
        </ul>
      </div>

      <label className="field-block">
        <span className="field-label">Ghi chú</span>
        <textarea
          className="textarea"
          rows={3}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Ghi chú nội bộ về học viên…"
        />
      </label>

      <div className="field-block">
        <div className="field-label">Ghi nhớ</div>
        <ul className="memory-list">
          {memories.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            const next = window.prompt('Thêm ghi nhớ');
            if (next && next.trim()) onAddMemory(next.trim());
          }}
        >
          Thêm ghi nhớ
        </button>
      </div>
    </div>
  );
}
