import { Conversation, PancakePage } from '../types';

export const demoPages: PancakePage[] = [
  {
    id: 'demo-page',
    name: 'Demo Lớp Nhạc Thầy Minh',
    platform: 'facebook'
  }
];

export const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    pageId: 'demo-page',
    pageName: 'Demo Page',
    studentName: 'Em Minh Quân',
    avatar: 'MQ',
    lastMessage: 'Dạ chỗ 0:35 đến 0:42 đó thầy, khúc đó ngón tay em đụng vô mấy phím đen cứ bị trợt với nặng tay sao á thầy.',
    lastActiveAt: '14:20 Hôm nay',
    intent: 'assignment_feedback',
    unreadCount: 1,
    flagReason: undefined,
    profile: {
      recipientCall: 'Em',
      senderCall: 'Thầy',
      nextAction: 'Chờ giáo viên nhập nhận xét chấm bài',
      specialNotes: 'Thường bị gồng cổ tay khi qua phím đen',
      studyNotes: 'Đang tập bài Für Elise ô nhịp 15-16 đoạn B',
      dataStatus: 'saved',
      fields: [
        { key: 'recipient', label: 'Tên gọi người nhận', value: 'Em Minh Quân', source: 'confirmed' },
        { key: 'sender', label: 'Người gửi xưng', value: 'Thầy', source: 'confirmed' },
        { key: 'special', label: 'Lưu ý đặc biệt', value: 'Học viên trẻ, tiếp thu nhanh nhưng hay hấp tấp', source: 'user_input' },
        { key: 'study', label: 'Ghi chú học tập', value: 'Cần chú ý bài tập rotation cẳng tay', source: 'confirmed' },
        {
          key: 'next',
          label: 'Việc cần làm tiếp',
          value: 'Chờ giáo viên nhập nhận xét chấm bài',
          source: 'ai_suggested',
          aiSuggestion: 'Soạn lời nhận xét nhắc lỗi ngón 4-5 ô nhịp 16'
        }
      ],
      customFields: [
        { id: 'cf_1', name: 'Tuổi', type: 'number', fillMode: 'manual', useInSuggestions: false, value: '16', source: 'user_input' },
        { id: 'cf_2', name: 'Tốc độ học', type: 'select', fillMode: 'ai_evaluate', useInSuggestions: true, value: 'Khá nhanh', source: 'ai_suggested' }
      ]
    },
    memories: [
      { id: 'mem_1', content: 'Lỗi gồng ngón 4-5 tay phải ở ô nhịp 16', status: 'active', createdAt: 'Hôm qua' },
      { id: 'mem_2', content: 'Đề xuất: Nhắc học viên dùng app CollaNote xem bài đánh dấu', status: 'ai_suggested', reason: 'Thầy thường khuyên dùng CollaNote với học viên này', createdAt: 'Hôm nay' },
      { id: 'mem_3', content: 'Lỗi vấp nốt đồ rê ô nhịp 4 (Đã sửa xong)', status: 'history', createdAt: 'Tuần trước' }
    ],
    assignmentOptions: [
      {
        id: 'asg_1',
        tone: 'Sư phạm & Kỹ thuật',
        content: 'Thầy xem clip rồi nè em! Ở ô nhịp 16 em chú ý xoay nhẹ cổ tay (rotation) để đưa ngón 2 luồn vào phím đen mượt mà hơn, tránh chĩa ngón nha. Tập riêng 5 phút đoạn này là ổn á!',
        usedFacts: ['Ô nhịp 16', 'Kỹ thuật rotation', 'Tập chậm 5 phút']
      },
      {
        id: 'asg_2',
        tone: 'Nhẹ nhàng & Khích lệ',
        content: 'Tiếng đàn tuần này sáng và đều hơn nhiều rồi em nè! Chỉ cần thả lỏng cổ tay thêm một chút ở đoạn phím đen ô nhịp 16 nữa là xuất sắc luôn. Cố lên nhen!',
        usedFacts: ['Tiếng đàn sáng hơn', 'Thả lỏng cổ tay']
      },
      {
        id: 'asg_3',
        tone: 'Ngắn gọn & Trọng tâm',
        content: 'Em tập trung sửa rotation ở ô nhịp 16 nhé. Giữ vai và cổ tay thả lỏng, tập lặp lại đoạn này tempo 50 nha.',
        usedFacts: ['Rotation ô nhịp 16', 'Tempo 50']
      }
    ],
    messages: [
      {
        id: 'm-1-1',
        sender: 'staff',
        text: 'Hi Minh Quân em! Bài Für Elise tuần rồi tập đến đoạn chuyển đoạn B chưa nè? Có vướng chỗ nào thì quay clip gửi thầy xem nghen ^^',
        sentAt: '14:05'
      },
      {
        id: 'm-1-2',
        sender: 'student',
        text: 'Dạ thầy ơi, em vừa quay xong clip này ạ. Em tập tới ô nhịp 16 chỗ chuyển ngón mà cứ bị vấp hoài, tay gồng cứng ngắc luôn thầy xem giúp em với ạ!',
        sentAt: '14:15'
      },
      {
        id: 'm-1-3',
        sender: 'staff',
        text: 'Thầy nhận được clip rồi nhen, để thầy mở lên soi kỹ ngón tay xem sao kk.',
        sentAt: '14:18'
      },
      {
        id: 'm-1-4',
        sender: 'student',
        text: 'Dạ chỗ 0:35 đến 0:42 đó thầy, khúc đó ngón tay em đụng vô mấy phím đen cứ bị trợt với nặng tay sao á thầy.',
        sentAt: '14:20'
      }
    ],
    suggestions: [
      {
        id: 'sug-1-1',
        tone: 'Nhẹ nhàng & Sư phạm',
        sensitivity: 'xanh',
        content: 'Thầy xem clip rồi nè em! Bắt bệnh ngay ô nhịp 16 từ 0:37: ngón 2 tay phải bị vướng cạnh phím đen (Rê#) do cổ tay hạ quá thấp. Em thả lỏng cổ tay, dùng lực xoay nhẹ (rotation) từ cẳng tay chứ đừng gồng ngón ấn xuống nhen. Em tập riêng đoạn 0:35 - 0:42 này 10 lần với tempo chậm 50 thôi, tay sẽ lướt êm ngay á!',
        usedFacts: ['Ô nhịp 16', 'Rotation', '0:35 - 0:42', 'Tempo 50']
      },
      {
        id: 'sug-1-2',
        tone: 'Thân mật & Khích lệ',
        sensitivity: 'xanh',
        content: 'Quân đánh tiến bộ rõ rệt á em, tiếng đàn sáng hơn tuần trước rồi! Chỉ vướng nhẹ chút xíu chỗ ô nhịp 16: do mình chưa áp dụng kỹ thuật rotation nên chuyển ngón bị nấc cụt. Thầy có chụp màn hình và khoanh đỏ trên app CollaNote gửi qua zalo cho em rồi nè. Cứ tập chậm lại từng nốt, thả lỏng vai nghen e 🥰',
        usedFacts: ['Tiến bộ tuần trước', 'CollaNote khoanh đỏ']
      },
      {
        id: 'sug-1-3',
        tone: 'Rõ việc cần làm',
        sensitivity: 'xanh',
        content: 'Đoạn ô nhịp 16 em nhớ xoay nhẹ cổ tay (rotation) để đưa ngón 2 luồn vào phím đen mượt hơn, tránh chĩa ngón nha. Tập lặp lại đoạn ngắn này 5-7 phút là thông tay liền nè!',
        usedFacts: ['Xoay cổ tay', 'Tập 5-7 phút']
      }
    ]
  },
  {
    id: 'conv-2',
    pageId: 'demo-page',
    pageName: 'Demo Page',
    studentName: 'Chị Mai Lan',
    avatar: 'ML',
    lastMessage: 'Dạ cảm ơn thầy động viên, chị vừa làm xong thủ tục nhập viện. Thầy kiểm tra giúp chị chính sách xem có rút lại học phí được chút nào để trang trải thuốc men không nhé thầy.',
    lastActiveAt: '08:20 Hôm nay',
    intent: 'sensitive',
    unreadCount: 1,
    flagReason: 'Bệnh hiểm nghèo (nhập viện mổ, hóa trị) - Cờ đỏ',
    profile: {
      recipientCall: 'Chị',
      senderCall: 'Em',
      nextAction: 'Theo dõi sức khỏe & xin STK hoàn 2.800.000đ',
      specialNotes: 'Phát hiện ung thư, đang nhập viện mổ gấp',
      studyNotes: 'Khóa học 20 tuần mới bắt đầu tuần 1',
      dataStatus: 'conflict',
      fields: [
        { key: 'recipient', label: 'Tên gọi người nhận', value: 'Chị Mai Lan', source: 'confirmed' },
        { key: 'sender', label: 'Người gửi xưng', value: 'Em', source: 'confirmed' },
        {
          key: 'special',
          label: 'Lưu ý đặc biệt',
          value: 'Học viên xin bảo lưu tạm thời',
          source: 'conflict',
          aiSuggestion: 'Học viên bị ung thư, xin hủy khóa và hoàn học phí',
          conflictReason: 'Tin nhắn mới nhất học viên xin rút phí chữa bệnh'
        },
        { key: 'study', label: 'Ghi chú học tập', value: 'Tạm ngưng toàn bộ bài vở', source: 'confirmed' },
        { key: 'next', label: 'Việc cần làm tiếp', value: 'Theo dõi sức khỏe & xin STK hoàn 2.800.000đ', source: 'ai_suggested' }
      ],
      customFields: [
        { id: 'cf_2_1', name: 'Tình trạng viện phí', type: 'text', fillMode: 'ai_extract', useInSuggestions: true, value: 'Cần hoàn gấp để trang trải thuốc men', source: 'ai_suggested' }
      ]
    },
    memories: [
      { id: 'mem_2_1', content: 'Chính sách: Khóa mới được hoàn 100% (2.800.000đ) khi có biến cố sức khỏe nặng', status: 'active', createdAt: 'Hôm nay' },
      { id: 'mem_2_2', content: 'Đề xuất: Nhắc kế toán chuyển khoản trong ngày làm việc', status: 'ai_suggested', reason: 'Quy định Policy ưu tiên ca bệnh viện', createdAt: 'Hôm nay' }
    ],
    messages: [
      {
        id: 'm-2-1',
        sender: 'staff',
        text: 'Dear Mai Lan chị! Hôm nay tài liệu khóa học tuần đầu tiên đã gửi đến rồi á chị, chị xem qua có chỗ nào chưa rõ cứ nhắn thầy nhen ^^',
        sentAt: 'Hôm qua 09:30'
      },
      {
        id: 'm-2-2',
        sender: 'student',
        text: 'Thầy Minh ơi, chị nhắn cho thầy mà buồn quá... Hôm nay đi khám chuyên sâu ở bệnh viện Ung Bướu, bác sĩ báo chị có khối u ác tính, tuần sau phải nhập viện mổ gấp rồi vào phác đồ hóa trị dài ngày.',
        sentAt: 'Hôm qua 15:40'
      },
      {
        id: 'm-2-3',
        sender: 'student',
        text: 'Chắc chị không theo học đàn được nữa rồi thầy ạ. Chị mới đóng học phí tuần trước, không biết trường hợp bệnh tật bất khả kháng như chị thì trung tâm có hỗ trợ hoàn lại tiền được không thầy? Chi phí viện phí đợt này lớn quá...',
        sentAt: 'Hôm qua 15:42'
      },
      {
        id: 'm-2-4',
        sender: 'staff',
        text: 'Trời ơi chị Lan, thầy đọc tin mà thắt cả ruột gan... Chị khoan lo nghĩ chuyện học hành hay tiền bạc gì lúc này nghen chị.',
        sentAt: 'Hôm qua 15:55'
      },
      {
        id: 'm-2-5',
        sender: 'student',
        text: 'Dạ cảm ơn thầy động viên, chị vừa làm xong thủ tục nhập viện. Thầy kiểm tra giúp chị chính sách xem có rút lại học phí được chút nào để trang trải thuốc men không nhé thầy.',
        sentAt: '08:20'
      }
    ],
    suggestions: [
      {
        id: 'sug-2-1',
        tone: 'Nhẹ nhàng & Tình cảm',
        sensitivity: 'do',
        content: 'Dạ em chào chị Lan! Em nghe tin mà bàng hoàng và thương chị quá. Chuyện học đàn và bài vở chị đừng bận tâm chút nào nữa hết nha chị. Sức khỏe và tinh thần của chị lúc này là ưu tiên số một. Về khóa học, theo chính sách hỗ trợ bất khả kháng của trung tâm, thầy sẽ cho hoàn lại toàn bộ học phí 2.800.000đ cho chị ngay trong hôm nay để chị an tâm bồi dưỡng và điều trị bệnh. Chị cho em xin Số tài khoản (STK) và tên ngân hàng nhen. Em và trung tâm cầu chúc chị mọi sự bình an, ca mổ thuận lợi và nhanh chóng bình phục. Khi nào sức khỏe ổn định hẳn, lớp nhạc luôn mở cửa đón chị quay lại bất cứ lúc nào ạ! ❤️',
        usedFacts: ['Chính sách hoàn 2tr800', 'Xin STK', 'Lời chúc bình an']
      },
      {
        id: 'sug-2-2',
        tone: 'Rõ việc cần làm',
        sensitivity: 'do',
        content: 'Chị Lan ơi, sức khỏe và tính mạng là quan trọng nhất, tiền bạc hay khóa học chỉ là phụ thôi chị ạ. Em báo kế toán duyệt lệnh hoàn lại số tiền 2.800.000đ của khóa học theo chính sách hỗ trợ bệnh nặng rồi chị nha. Chị gửi em STK chính chủ của chị nhé, kế toán sẽ chuyển khoản ngay trong ngày. Giờ chị an tâm dưỡng sức, giữ tinh thần thật lạc quan để điều trị nhé chị!',
        usedFacts: ['Hoàn 2.800.000đ trong ngày', 'Yêu cầu STK']
      },
      {
        id: 'sug-2-3',
        tone: 'Thân mật & Trân trọng',
        sensitivity: 'do',
        content: 'Dạ chị Lan, em xin chia sẻ sâu sắc hoàn cảnh này cùng chị. Về học phí 2.800.000đ, trung tâm thực hiện lệnh hoàn lại ngay trong ngày, chị gửi STK cho em nhé. Chúc chị ca phẫu thuật thuận lợi, kiên cường vượt qua hóa trị. Khi nào chị khỏe mạnh trở lại, lớp nhạc luôn sẵn sàng đồng hành cùng chị!',
        usedFacts: ['Đồng cảm sâu sắc', 'Chờ STK']
      }
    ]
  },
  {
    id: 'conv-3',
    pageId: 'demo-page',
    pageName: 'Demo Page',
    studentName: 'Anh Bảo Nam',
    avatar: 'BN',
    lastMessage: 'Chào thầy, đợt này công ty em vào đợt kiểm toán cuối năm nên em đi làm từ sáng sớm tới 9-10h đêm mới về tới nhà, mệt nhoài người không chạm nổi vào đàn thầy ơi. Em sợ bỏ bê lâu quá bị mất ngón với quên sạch bài...',
    lastActiveAt: '18:30 Hôm qua',
    intent: 'check_in',
    unreadCount: 0,
    flagReason: undefined,
    profile: {
      recipientCall: 'Anh',
      senderCall: 'Thầy',
      nextAction: 'Nhắc khéo tập 15 phút & đề xuất bảo lưu nếu cần',
      specialNotes: 'Dân văn phòng bận kiểm toán cuối năm',
      studyNotes: 'Đang ở bài hợp âm rải tuần 4',
      dataStatus: 'saved',
      fields: [
        { key: 'recipient', label: 'Tên gọi người nhận', value: 'Anh Bảo Nam', source: 'confirmed' },
        { key: 'sender', label: 'Người gửi xưng', value: 'Thầy', source: 'confirmed' },
        { key: 'special', label: 'Lưu ý đặc biệt', value: 'OT nhiều, thường mệt mỏi buổi tối', source: 'user_input' },
        { key: 'study', label: 'Ghi chú học tập', value: 'Ngón tay có lực tốt, dễ bắt nhịp lại', source: 'confirmed' },
        { key: 'next', label: 'Việc cần làm tiếp', value: 'Nhắc khéo tập 15 phút & đề xuất bảo lưu nếu cần', source: 'ai_suggested' }
      ],
      customFields: [
        { id: 'cf_3_1', name: 'Số ngày chưa tập', type: 'number', fillMode: 'ai_extract', useInSuggestions: true, value: '14', source: 'ai_suggested' }
      ]
    },
    memories: [
      { id: 'mem_3_1', content: 'Chính sách bảo lưu tối đa 90 ngày cho khóa 20 tuần', status: 'active', createdAt: '2 tuần trước' },
      { id: 'mem_3_2', content: 'Bài tập 15 phút thả lỏng xả stress thay vì ép tiến độ', status: 'active', createdAt: 'Hôm qua' }
    ],
    messages: [
      {
        id: 'm-3-1',
        sender: 'staff',
        text: 'Dear Bảo Nam anh! Bài hợp âm rải tuần 4 anh tập nghe rất tình cảm luôn á, cứ phát huy nhen anh ^^',
        sentAt: '3 tuần trước'
      },
      {
        id: 'm-3-2',
        sender: 'student',
        text: 'Dạ cảm ơn thầy Minh, em sẽ ráng luyện thêm bài tiếp theo ạ.',
        sentAt: '3 tuần trước'
      },
      {
        id: 'm-3-3',
        sender: 'staff',
        text: 'Hi anh Nam! Dạo này công việc cuối quý của mình còn căng thẳng nhiều ko anh ha? Thấy anh "im hơi lặng tiếng" gần 2 tuần rồi nè kk, ngón tay có nhớ phím đàn ko anh hengg?',
        sentAt: 'Hôm qua 10:00'
      },
      {
        id: 'm-3-4',
        sender: 'student',
        text: 'Chào thầy, đợt này công ty em vào đợt kiểm toán cuối năm nên em đi làm từ sáng sớm tới 9-10h đêm mới về tới nhà, mệt nhoài người không chạm nổi vào đàn thầy ơi. Em sợ bỏ bê lâu quá bị mất ngón với quên sạch bài...',
        sentAt: 'Hôm qua 18:30'
      }
    ],
    suggestions: [
      {
        id: 'sug-3-1',
        tone: 'Thân mật & Khích lệ',
        sensitivity: 'xanh',
        content: 'Thầy hiểu mà anh Nam ơi! Cuộc sống người đi làm nhiều khi có những giai đoạn công việc nó "chiếm sóng" hết thời gian quý báu của mình á. Anh đừng tự tạo áp lực nhen! Nếu hôm nào về nhà mà "lỡ" dư ra được... 15 phút rảnh thì anh chỉ cần lướt ngón nhẹ nhàng 1 bài hợp âm thôi (có tập 15p vẫn hơn là ko tập kk 🥰). Khi nào bận quá trên 7 ngày liên tục, anh cứ nhắn thầy kích hoạt bảo lưu (mình có tối đa 90 ngày bảo lưu lận đó), không lo mất bài đâu anh hengg!',
        usedFacts: ['15 phút rảnh', 'Bảo lưu 90 ngày']
      },
      {
        id: 'sug-3-2',
        tone: 'Rõ việc cần làm',
        sensitivity: 'vang',
        content: 'Dạ không sao đâu anh Nam ơi! Đừng lo quên bài, cơ bắp ngón tay có trí nhớ tốt lắm, khi quay lại chỉ cần 2 hôm là quen ngay. Nếu đợt kiểm toán này còn kéo dài cả tuần nữa, anh báo thầy để thầy lưu ý kích hoạt bảo lưu theo policy 90 ngày cho anh an tâm làm việc nha. Còn nếu rảnh tay 10-15 phút thì cứ ngồi vào đàn bấm vài nốt xả stress thôi anh nghen!',
        usedFacts: ['Trí nhớ cơ bắp', 'Bảo lưu 90 ngày']
      },
      {
        id: 'sug-3-3',
        tone: 'Nhẹ nhàng & Động viên',
        sensitivity: 'xanh',
        content: 'Hi anh Nam, công việc là ưu tiên số 1 lúc này, anh nhớ giữ gìn sức khỏe nhen! Đàn piano là để giải tỏa căng thẳng chứ không phải gánh nặng đâu nè. Mỗi tối chỉ cần 10-15 phút thư giãn bên phím đàn là đủ rồi anh ha, chúc anh sớm vượt qua đợt kiểm toán kk!',
        usedFacts: ['Giải tỏa căng thẳng', '10-15 phút']
      }
    ]
  },
  {
    id: 'conv-4',
    pageId: 'demo-page',
    pageName: 'Demo Page',
    studentName: 'Chị Thu Hà (Mẹ bé Bo 7t)',
    avatar: 'TH',
    lastMessage: 'Dạ thầy, bé tập tới bài Twinkle Twinkle mà ngón tay cứ bị gãy khớp quẹo vô trong á thầy, mẹ nhắc thì bé quạu dỗi không chịu tập nữa...',
    lastActiveAt: '11:15 Hôm nay',
    intent: 'assignment_feedback',
    unreadCount: 1,
    flagReason: undefined,
    profile: {
      recipientCall: 'Chị',
      senderCall: 'Thầy',
      nextAction: 'Hướng dẫn mẹ mẹo ôm trứng tròn & chia nhỏ ca tập 10 phút',
      specialNotes: 'Bé Bo 7 tuổi, cơ ngón tay còn non nên hay bị sụp khớp sinh lý, mẹ dễ sốt ruột',
      studyNotes: 'Đang tập bài Twinkle Twinkle và Hanon số 1',
      dataStatus: 'saved',
      fields: [
        { key: 'recipient', label: 'Tên gọi người nhận', value: 'Chị Thu Hà', source: 'confirmed' },
        { key: 'sender', label: 'Người gửi xưng', value: 'Thầy', source: 'confirmed' },
        { key: 'special', label: 'Lưu ý đặc biệt', value: 'Bé Bo 7 tuổi, cơ tay mềm, dễ nản khi bị nhắc nhở tiêu cực', source: 'user_input' },
        { key: 'study', label: 'Ghi chú học tập', value: 'Bài Twinkle Twinkle, Hanon 1 - cần chỉnh sụp khớp ngón 2 và 5', source: 'confirmed' },
        { key: 'next', label: 'Việc cần làm tiếp', value: 'Hướng dẫn mẹ bài tập nhấp ngón và trò chơi ôm quả trứng', source: 'ai_suggested' }
      ],
      customFields: [
        { id: 'cf_1', name: 'Tuổi', type: 'number', fillMode: 'manual', useInSuggestions: true, value: '7', source: 'user_input' },
        { id: 'cf_2', name: 'Tốc độ học', type: 'select', fillMode: 'manual', useInSuggestions: false, value: 'Bình thường', source: 'user_input' }
      ]
    },
    memories: [
      { id: 'mem_4_1', content: 'Bé Bo 7 tuổi, ngón trỏ và ngón út hay bị sụp khớp (gãy ngón)', status: 'active', createdAt: 'Hôm nay' },
      { id: 'mem_4_2', content: 'Mẹ thường nhắc nhở khiến bé sinh tâm lý mè nheo dỗi không chịu tập', status: 'active', createdAt: 'Hôm nay' }
    ],
    messages: [
      {
        id: 'm-4-1',
        sender: 'staff',
        text: 'Dạ thầy chào chị Hà! Tuần này bé Bo làm quen với bài tập ngón Hanon số 1 và bài Ngôi sao nhỏ thế nào rồi chị ha?',
        sentAt: '09:00'
      },
      {
        id: 'm-4-2',
        sender: 'student',
        text: 'Thầy Minh ơi em quay clip Bo tập gửi thầy đây ạ. Cháu bấm phím ngón trỏ với ngón út cứ bị sụp khớp ngón (gãy ngón), bàn tay dẹp lép đập lên phím đàn.',
        sentAt: '10:45'
      },
      {
        id: 'm-4-3',
        sender: 'staff',
        text: 'Thầy xem clip Bo rồi nhen chị, khuôn mặt Bo lúc bấm đàn tập trung cưng xỉu luôn! Về khớp ngón thì các bé 6-7 tuổi cơ tay còn mềm nên hay bị sụp khớp sinh lý, mẹ đừng lo quá nghen ^^',
        sentAt: '11:00'
      },
      {
        id: 'm-4-4',
        sender: 'student',
        text: 'Dạ thầy, bé tập tới bài Twinkle Twinkle mà ngón tay cứ bị gãy khớp quẹo vô trong á thầy, mẹ nhắc thì bé quạu dỗi không chịu tập nữa...',
        sentAt: '11:15'
      }
    ],
    suggestions: [
      {
        id: 'sug-4-1',
        tone: 'Sư phạm & Hình tượng hoá cho trẻ em',
        sensitivity: 'xanh',
        content: 'Chị Hà ơi, với bé Bo mẹ đừng nhắc "con gãy ngón kìa" bé sẽ thấy bị chê á. Mẹ bày trò chơi này nha: bảo Bo tưởng tượng trong lòng bàn tay đang ấp một "quả trứng gà con tròn xoe", ngón tay khum lại như mái nhà bảo vệ trứng không bị bẹp. Mỗi lần bấm phím là gõ nhẹ đầu ngón thịt xuống. Mẹ khen Bo: "Hôm nay Bo giữ trứng giỏi hơn hôm qua rồi nè!" là Bo hào hứng liền à 🥰',
        usedFacts: ['Mẹo ôm quả trứng', 'Khen ngợi tạo động lực']
      },
      {
        id: 'sug-4-2',
        tone: 'Tâm lý & Chia nhỏ ca tập',
        sensitivity: 'xanh',
        content: 'Dạ chị, lứa tuổi lên 7 cơ ngón tay còn non nên tập 15-20 phút liên tục tay bé mỏi sẽ tự sụp khớp và sinh tâm lý chán nản. Mẹ chia ca tập thành 2 lần, mỗi lần đúng 10 phút thôi nhen. Mẹ làm một bảng sticker ngôi sao: cứ mỗi 10 phút tập vui vẻ là thưởng 1 sao, đủ 5 sao được xem hoạt hình. Thầy có gửi kèm video hoạt hình vui nhộn minh họa dáng tay tròn cho Bo xem thử nè!',
        usedFacts: ['Chia ca tập 10 phút', 'Bảng sticker ngôi sao']
      },
      {
        id: 'sug-4-3',
        tone: 'Ngắn gọn & Bài tập bàn tay',
        sensitivity: 'xanh',
        content: 'Chị Hà cho bé Bo tập bài "gõ ngón trên mặt bàn" 2 phút trước khi ngồi vào đàn nhé: đặt bàn tay khum tròn trên bàn rồi nhấp từng ngón như gõ kiến. Tập quen trên mặt bàn rồi vào phím đàn bé sẽ giữ form ngón tốt hơn nhiều ạ!',
        usedFacts: ['Bài tập gõ ngón mặt bàn', '2 phút khởi động']
      }
    ]
  },
  {
    id: 'conv-5',
    pageId: 'demo-page',
    pageName: 'Demo Page',
    studentName: 'Chú Thanh Tùng (56t)',
    avatar: 'TT',
    lastMessage: 'Thầy Minh xem giúp chú, chú nhìn nốt khóa Fa mỏi mắt quá hay bị lộn nốt, chú có thể bỏ qua phần xướng âm để vào bấm hợp âm đệm hát bài Bolero luôn được không thầy?',
    lastActiveAt: '16:45 Hôm qua',
    intent: 'check_in',
    unreadCount: 0,
    flagReason: 'Học viên lớn tuổi gặp khó khăn về thị tấu/nhạc lý - Cần điều chỉnh lộ trình cá nhân hóa',
    profile: {
      recipientCall: 'Chú',
      senderCall: 'Con',
      nextAction: 'Gửi clip riêng 5 phút hướng dẫn 3 hợp âm bài Bolero thế tay dễ',
      specialNotes: 'Học viên hưu trí (56t), mắt điều tiết chậm, mong muốn đệm hát giải trí, ngại lý thuyết hàn lâm',
      studyNotes: 'Chuyển hướng từ đọc nốt khóa Fa sang bấm hợp âm trực quan',
      dataStatus: 'saved',
      fields: [
        { key: 'recipient', label: 'Tên gọi người nhận', value: 'Chú Thanh Tùng', source: 'confirmed' },
        { key: 'sender', label: 'Người gửi xưng', value: 'Con', source: 'confirmed' },
        { key: 'special', label: 'Lưu ý đặc biệt', value: '56 tuổi, mắt mỏi khi nhìn khuông nhạc nhỏ, cần bảng hợp âm chữ to', source: 'user_input' },
        { key: 'study', label: 'Ghi chú học tập', value: 'Muốn đệm bài Sầu tím thiệp hồng (Bolero)', source: 'confirmed' },
        { key: 'next', label: 'Việc cần làm tiếp', value: 'Soạn hướng dẫn 3 hợp âm Am - Dm - E7 thế tay bấm gần', source: 'ai_suggested' }
      ],
      customFields: [
        { id: 'cf_1', name: 'Tuổi', type: 'number', fillMode: 'manual', useInSuggestions: true, value: '56', source: 'user_input' },
        { id: 'cf_2', name: 'Mục tiêu học', type: 'text', fillMode: 'manual', useInSuggestions: true, value: 'Đệm hát Bolero giải trí tuổi hưu', source: 'user_input' }
      ]
    },
    memories: [
      { id: 'mem_5_1', content: 'Mắt chú nhìn nốt khóa Fa hay bị lộn nốt Đồ và Mì', status: 'active', createdAt: 'Hôm kia' },
      { id: 'mem_5_2', content: 'Mục tiêu: Đệm hát bài Sầu tím thiệp hồng', status: 'active', createdAt: 'Hôm qua' }
    ],
    messages: [
      {
        id: 'm-5-1',
        sender: 'staff',
        text: 'Dạ con chào chú Tùng ạ! Tuần này chú luyện các nốt khóa Fa trên app và sách giáo trình tới bài nào rồi chú ha?',
        sentAt: 'Hôm kia 15:00'
      },
      {
        id: 'm-5-2',
        sender: 'student',
        text: 'Chào thầy Minh, chú tập đều đặn mỗi chiều mà nói thật mắt chú nhìn khuông nhạc nhỏ hơi kèm nhèm, đếm dòng kẻ khóa Fa cứ bị lẫn lộn nốt Đồ với nốt Mì hoài con ơi.',
        sentAt: 'Hôm kia 17:30'
      },
      {
        id: 'm-5-3',
        sender: 'staff',
        text: 'Dạ chú ơi, người lớn tuổi mắt hay bị điều tiết chậm nên việc đọc nốt khóa Fa lúc đầu ai cũng thấy ngợp chú ạ, chú đừng sốt ruột nhen chú ^^',
        sentAt: 'Hôm qua 08:30'
      },
      {
        id: 'm-5-4',
        sender: 'student',
        text: 'Thầy Minh xem giúp chú, chú nhìn nốt khóa Fa mỏi mắt quá hay bị lộn nốt, chú có thể bỏ qua phần xướng âm để vào bấm hợp âm đệm hát bài Bolero luôn được không thầy?',
        sentAt: 'Hôm qua 16:45'
      }
    ],
    suggestions: [
      {
        id: 'sug-5-1',
        tone: 'Tôn trọng & Lộ trình thực chiến cho người lớn tuổi',
        sensitivity: 'vang',
        content: 'Dạ hoàn toàn được chú Tùng ơi! Mục tiêu của chú là học đàn để thư giãn giải trí tuổi hưu và tự đệm hát được bài mình yêu thích, chứ không phải đi thi cử hàn lâm nên con sẽ tinh chỉnh lộ trình riêng cho chú ngay: từ tuần này chú không cần đọc từng nốt khóa Fa rời rạc nữa mà con chuyển sang dạy chú "bấm hợp âm thế tay hình học" (chỉ cần nhìn chữ cái Am, Dm, E7 là đặt cả bàn tay vào được ngay). Chú đệm bài "Sầu tím thiệp hồng" được liền luôn chú nha!',
        usedFacts: ['Đệm hát giải trí tuổi hưu', 'Hợp âm thế tay hình học']
      },
      {
        id: 'sug-5-2',
        tone: 'Mẹo thị giác & Dán nhãn trực quan',
        sensitivity: 'vang',
        content: 'Dạ chú Tùng, để mắt không bị mỏi, con vừa gửi cho chú bộ bảng bấm hợp âm khổ chữ to in màu và gợi ý chú dán 3 miếng sticker màu lên phím đàn để định vị nốt chủ. Tuần này chú chỉ cần bấm tay trái 1 nốt bass kết hợp rải điệu Bolero chậm rãi thôi, bảo đảm chú sẽ thấy nhẹ nhàng và hứng thú hơn rất nhiều ạ!',
        usedFacts: ['Bảng hợp âm chữ to', 'Sticker màu định vị phím']
      },
      {
        id: 'sug-5-3',
        tone: 'Ấm áp & Gửi clip riêng',
        sensitivity: 'xanh',
        content: 'Chú Tùng an tâm nghen, con làm riêng 1 clip ngắn 5 phút quay góc nhìn từ trên xuống hướng dẫn đúng 3 thế tay đệm bài Bolero chú thích, chú chỉ việc nhìn theo bàn tay con đặt là bấm được ngay mà không cần đọc nốt rắc rối nữa nè chú!',
        usedFacts: ['Clip góc nhìn trên xuống', 'Hướng dẫn 3 thế tay Bolero']
      }
    ]
  },
  {
    id: 'conv-6',
    pageId: 'demo-page',
    pageName: 'Demo Page',
    studentName: 'Em Gia Huy (15 tuổi)',
    avatar: 'GH',
    lastMessage: 'Nhiều lúc em chỉ muốn trốn vào phòng ngồi gõ lung tung mấy nốt đàn cho đỡ ngột ngạt á thầy, chứ giờ em thấy bế tắc quá...',
    lastActiveAt: '21:30 Tối qua',
    intent: 'check_in',
    unreadCount: 1,
    flagReason: 'Học sinh 15 tuổi tâm sự áp lực tâm lý thi cử & gia đình - Cần lắng nghe, đồng cảm, không giáo điều',
    profile: {
      recipientCall: 'Em',
      senderCall: 'Thầy',
      nextAction: 'Lắng nghe, nhắn tin động viên tinh thần, không giao bài tập',
      specialNotes: 'Học sinh 15 tuổi, đang ôn thi chuyển cấp vào lớp 10, áp lực học thêm và gia đình so sánh',
      studyNotes: 'Tạm hoãn bài tập ngón kỹ thuật, dùng piano để thư giãn giải tỏa cảm xúc',
      dataStatus: 'saved',
      fields: [
        { key: 'recipient', label: 'Tên gọi người nhận', value: 'Em Gia Huy', source: 'confirmed' },
        { key: 'sender', label: 'Người gửi xưng', value: 'Thầy', source: 'confirmed' },
        { key: 'special', label: 'Lưu ý đặc biệt', value: '15 tuổi, đang bị stress nặng do áp lực thi vào 10 và bị so sánh', source: 'user_input' },
        { key: 'study', label: 'Ghi chú học tập', value: 'Không giao bài tập kỹ thuật mới, khuyến khích chơi nhạc tự do', source: 'confirmed' },
        { key: 'next', label: 'Việc cần làm tiếp', value: 'Lắng nghe chân thành, khuyên em ngủ sớm và đi dạo thư giãn', source: 'ai_suggested' }
      ],
      customFields: [
        { id: 'cf_1', name: 'Tuổi', type: 'number', fillMode: 'manual', useInSuggestions: true, value: '15', source: 'user_input' },
        { id: 'cf_2', name: 'Tâm lý', type: 'text', fillMode: 'manual', useInSuggestions: true, value: 'Cần người lắng nghe, dễ tủi thân', source: 'user_input' }
      ]
    },
    memories: [
      { id: 'mem_6_1', content: 'Huy 15 tuổi, đang chịu áp lực lớn từ lịch học thêm và thi thử vào lớp 10', status: 'active', createdAt: 'Hôm qua' },
      { id: 'mem_6_2', content: 'Bị mẹ so sánh với anh họ khiến em buồn và thấy bế tắc', status: 'active', createdAt: 'Hôm qua' },
      { id: 'mem_6_3', content: 'Coi tiếng đàn piano là nơi trút bầu tâm sự duy nhất', status: 'active', createdAt: 'Hôm qua' }
    ],
    messages: [
      {
        id: 'm-6-1',
        sender: 'staff',
        text: 'Hi Gia Huy em! Dạo này việc học ở trường với lịch ôn thi vào lớp 10 của em thế nào rồi nè? Tuần này không thấy em gửi bài tập ngón, có bị vướng gì không em ha?',
        sentAt: 'Hôm qua 18:00'
      },
      {
        id: 'm-6-2',
        sender: 'student',
        text: 'Dạ thầy Minh ơi, em nhắn cho thầy không phải hỏi bài đàn đâu ạ... Em đang buồn quá mà không biết nói với ai hết thầy ạ.',
        sentAt: 'Hôm qua 21:15'
      },
      {
        id: 'm-6-3',
        sender: 'student',
        text: 'Đợt này trường em xếp lịch học thêm kín cả tuần từ sáng tới 9h tối, bài vở ngập đầu. Hôm qua có điểm thi thử toán em làm không tốt, về nhà mẹ mắng rồi so sánh em với anh họ suốt bữa cơm.',
        sentAt: 'Hôm qua 21:18'
      },
      {
        id: 'm-6-4',
        sender: 'staff',
        text: 'Thầy nghe đây Huy ơi. Em cứ nói hết ra với thầy cho nhẹ lòng nhen, thầy luôn ở đây nghe em nè.',
        sentAt: 'Hôm qua 21:22'
      },
      {
        id: 'm-6-5',
        sender: 'student',
        text: 'Nhiều lúc em chỉ muốn trốn vào phòng ngồi gõ lung tung mấy nốt đàn cho đỡ ngột ngạt á thầy, chứ giờ em thấy bế tắc quá...',
        sentAt: 'Hôm qua 21:30'
      }
    ],
    suggestions: [
      {
        id: 'sug-6-1',
        tone: 'Lắng nghe chân thành & Không giáo điều',
        sensitivity: 'vang',
        content: 'Thầy nghe Huy tâm sự mà thương em quá! Giai đoạn lớp 9 thi chuyển cấp này áp lực học tập thật sự rất khủng khiếp, việc em cảm thấy ngột ngạt và tủi thân khi bị so sánh là hoàn toàn dễ hiểu á em. Em đã rất cố gắng gồng gánh lịch học dày đặc mỗi ngày rồi. Đừng tự trách mình nhen Huy, thầy tin em và luôn đứng về phía em!',
        usedFacts: ['Áp lực thi lớp 9', 'Đồng cảm không phán xét']
      },
      {
        id: 'sug-6-2',
        tone: 'Âm nhạc như nơi chữa lành & Giải tỏa cảm xúc',
        sensitivity: 'vang',
        content: 'Huy ơi, bài vở hay đàn đúng sai lúc này gác lại hết đi em! Cây đàn piano sinh ra là để làm bạn với tâm hồn mình mà. Lúc nào thấy ngột ngạt, em cứ ngồi vào đàn gõ vu vơ bất kỳ phím nào em thích, đánh mạnh hay nhẹ tùy theo cảm xúc của em lúc đó, để tiếng đàn gánh bớt nỗi buồn giùm em nhen. Tiếng đàn không bao giờ chấm điểm hay phán xét em cả ❤️',
        usedFacts: ['Đàn tự do xả stress', 'Không chấm điểm đúng sai']
      },
      {
        id: 'sug-6-3',
        tone: 'Động viên nhẹ nhàng & Đi dạo hít thở',
        sensitivity: 'xanh',
        content: 'Tối nay Huy nhớ uống một ly nước ấm, rửa mặt cho tỉnh táo rồi đi ngủ sớm một hôm cho lại sức nhen em. Khi nào thấy lòng nặng trĩu hay muốn tìm người xả bớt áp lực, cứ nhắn cho thầy bất cứ lúc nào, thầy luôn là hòm thư bí mật lắng nghe Huy nghen!',
        usedFacts: ['Uống nước ấm ngủ sớm', 'Hòm thư bí mật của thầy']
      }
    ]
  }
];
