import { useEffect, useState } from 'react';
import type { PronounPair, StudentProfile } from '../../types';
import { PronounBar } from '../PronounBar';

interface Props {
  student: StudentProfile;
  pronouns: PronounPair;
  onPronounsChange: (pair: PronounPair) => void;
  notes: string;
  memories: string[];
  customFields: Array<{ id: string; name: string; type: 'text' | 'number' | 'select'; value: string; options?: string[]; useInSuggestions: boolean }>;
  onSaveNotes: (value: string) => Promise<void>;
  onAddMemory: (value: string) => Promise<void>;
  onCustomFieldChange: (id: string, value: string) => Promise<void>;
}

export function StudentTab({
  student,
  pronouns,
  onPronounsChange,
  notes,
  memories,
  customFields,
  onSaveNotes,
  onAddMemory,
  onCustomFieldChange,
}: Props) {
  const [notesDraft, setNotesDraft] = useState(notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setNotesDraft(notes), [notes]);

  const run = async (action: () => Promise<void>) => {
    setSaving(true);
    setError('');
    try {
      await action();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không lưu được dữ liệu.');
    } finally {
      setSaving(false);
    }
  };

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
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          placeholder="Ghi chú nội bộ về học viên…"
        />
        <button type="button" className="btn btn-primary" disabled={saving || notesDraft === notes} onClick={() => void run(() => onSaveNotes(notesDraft))}>
          {saving ? 'Đang lưu…' : 'Lưu ghi chú'}
        </button>
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
          disabled={saving}
          onClick={() => {
            const next = window.prompt('Thêm ghi nhớ');
            if (next && next.trim()) void run(() => onAddMemory(next.trim()));
          }}
        >
          Thêm ghi nhớ
        </button>
      </div>

      {customFields.length > 0 && (
        <div className="field-block">
          <div className="field-label">Thông tin tùy chỉnh</div>
          {customFields.map((field) => (
            <CustomValueEditor key={field.id} field={field} disabled={saving} onSave={(value) => run(() => onCustomFieldChange(field.id, value))} />
          ))}
        </div>
      )}
      {error && <div className="inline-error" role="alert">{error}</div>}
    </div>
  );
}

function CustomValueEditor({
  field,
  disabled,
  onSave,
}: {
  field: Props['customFields'][number];
  disabled: boolean;
  onSave: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(field.value);
  useEffect(() => setValue(field.value), [field.value]);
  return (
    <div className="custom-value-editor">
      <label>{field.name}{field.useInSuggestions ? ' · dùng cho AI' : ''}</label>
      {field.type === 'select' ? (
        <select value={value} onChange={(event) => setValue(event.target.value)}>
          <option value="">Chưa chọn</option>
          {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input type={field.type === 'number' ? 'number' : 'text'} value={value} onChange={(event) => setValue(event.target.value)} />
      )}
      <button type="button" className="btn btn-secondary" disabled={disabled || value === field.value} onClick={() => void onSave(value)}>Lưu</button>
    </div>
  );
}
