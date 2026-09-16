import type { IntentCategory, StudentProfile, Suggestion } from '../types';

export const INTENT_CATEGORIES: IntentCategory[] = [
  'Tâm sự',
  'Lịch học',
  'Chấm bài',
  'Học phí',
  'Tuyển sinh',
  'Kỹ thuật',
  'Khiếu nại',
  'Khác',
];

export const MOCK_STUDENT: StudentProfile = {
  id: 'hv-minh-anh',
  initials: 'MA',
  name: 'Nguyễn Minh Anh',
  statusLabel: 'BÌNH THƯỜNG',
  courseLabel: 'Piano Cơ Bản #12',
  pronouns: 'Thầy - Em',
  channel: 'Facebook Messenger',
  note: 'Lưu ý: Phụ huynh hay gọi trực tiếp, ưu tiên nhắn lịch sử.',
  profileFields: [
    { label: 'Lớp', value: 'Piano Cơ Bản #12' },
    { label: 'Buổi học', value: 'Thứ 5 · 19:30' },
    { label: 'Giáo viên', value: 'Thầy Minh' },
    { label: 'Kênh', value: 'Facebook Messenger' },
    { label: 'Học phí', value: 'Đã hoàn thành' },
  ],
  notes: 'Em hay bị trễ lịch khi tuần bận thi. Ưu tiên nhắc lịch sớm.',
  memories: [
    'Thích bài Canon in D',
    'Phụ huynh thường gọi trực tiếp',
    'Đã khen nhịp tay ổn định buổi trước',
  ],
};

export const MOCK_CONTEXT_INTENTS: IntentCategory[] = ['Lịch học', 'Tâm sự'];

export const MOCK_CONTEXT_QUOTE =
  'Em đang không sắp xếp được lịch học tuần này.';

const RAW_SUGGESTIONS: Array<Omit<Suggestion, 'baseText' | 'text'> & { text: string }> = [
  {
    id: 'sg-1',
    label: 'Nhắc lịch học',
    category: 'Lịch học',
    text:
      'Em ơi, lịch học tuần này của em vẫn là 19:30 thứ Năm nhé. Em nhớ sắp xếp thời gian và ôn bài Canon in D trước buổi học giúp thầy nhé.',
  },
  {
    id: 'sg-2',
    label: 'Động viên',
    category: 'Tâm sự',
    text:
      'Thầy hiểu tuần này em đang bận. Em cứ nhắn thầy lịch nào em rảnh, mình linh hoạt đổi ca cho phù hợp. Em giữ nhịp luyện mỗi ngày một chút là tiến bộ rất nhanh đó.',
  },
  {
    id: 'sg-3',
    label: 'Học phí',
    category: 'Học phí',
    text:
      'Em nhờ phụ huynh kiểm tra giúp thông tin học phí khóa Piano Cơ Bản #12 giúp thầy nhé. Nếu cần mình gửi lại biên lai ngay.',
  },
];

/** baseText authored in Thầy/Em; text starts identical */
export const MOCK_SUGGESTIONS: Suggestion[] = RAW_SUGGESTIONS.map((s) => ({
  ...s,
  baseText: s.text,
}));
