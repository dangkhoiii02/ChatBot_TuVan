import { Conversation } from '../types';

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
        tone: 'Chi tiết & Sư phạm',
        sensitivity: 'xanh',
        content: 'Thầy xem clip rồi nè em! Bắt bệnh ngay ô nhịp 16 từ 0:37: ngón 2 tay phải bị vướng cạnh phím đen (Rê#) do cổ tay hạ quá thấp. Em thả lỏng cổ tay, dùng lực xoay nhẹ (rotation) từ cẳng tay chứ đừng gồng ngón ấn xuống nhen. Em tập riêng đoạn 0:35 - 0:42 này 10 lần với tempo chậm 50 thôi, tay sẽ lướt êm ngay á!'
      },
      {
        id: 'sug-1-2',
        tone: 'Khích lệ & Thực hành',
        sensitivity: 'xanh',
        content: 'Quân đánh tiến bộ rõ rệt á em, tiếng đàn sáng hơn tuần trước rồi! Chỉ vướng nhẹ chút xíu chỗ ô nhịp 16: do mình chưa áp dụng kỹ thuật rotation nên chuyển ngón bị nấc cụt. Thầy có chụp màn hình và khoanh đỏ trên app CollaNote gửi qua zalo cho em rồi nè. Cứ tập chậm lại từng nốt, thả lỏng vai nghen e 🥰'
      },
      {
        id: 'sug-1-3',
        tone: 'Ngắn gọn & Súc tích',
        sensitivity: 'xanh',
        content: 'Đoạn ô nhịp 16 em nhớ xoay nhẹ cổ tay (rotation) để đưa ngón 2 luồn vào phím đen mượt hơn, tránh chĩa ngón nha. Tập lặp lại đoạn ngắn này 5-7 phút là thông tay liền nè!'
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
        tone: 'Cờ đỏ - Đồng cảm chân thành & Hoàn tiền ngay theo Policy',
        sensitivity: 'do',
        content: 'Dạ chị Lan ơi, thầy vừa báo gấp bộ phận kế toán xong rồi ạ. Theo chính sách của lớp với các trường hợp sức khỏe bất khả kháng đặc biệt như chị, trung tâm sẽ hỗ trợ hoàn 100% học phí khóa mới là 2.800.000đ để chị an tâm điều trị bệnh. Chị nhắn giúp thầy Số tài khoản (STK) và Tên ngân hàng, kế toán sẽ làm lệnh chuyển khoản hoàn tiền ngay trong ngày làm việc hôm nay cho chị nhen. Thầy và cả lớp cầu chúc chị ca mổ thật thành công và bình an mau hồi phục. Khi nào sức khỏe ổn định, cánh cửa lớp nhạc luôn rộng mở đón chị quay lại hengg! Chị cố gắng lên nha chị ❤️'
      },
      {
        id: 'sug-2-2',
        tone: 'Ân cần & Hướng dẫn hoàn tiền 2.800.000đ',
        sensitivity: 'do',
        content: 'Chị Lan ơi, sức khỏe và tính mạng là quan trọng nhất, tiền bạc hay khóa học chỉ là phụ thôi chị ạ. Thầy Minh duyệt hoàn lại số tiền 2.800.000đ của khóa học theo chính sách hỗ trợ bệnh hiểm nghèo rồi chị nha. Chị gửi thầy STK chính chủ của chị nhé, kế toán sẽ giải ngân ngay hôm nay. Giờ chị an tâm dưỡng sức, giữ tinh thần thật lạc quan để chiến đấu với đợt phẫu thuật và hóa trị sắp tới nhé chị. Mong tin chị bình an!'
      },
      {
        id: 'sug-2-3',
        tone: 'Trang trọng & Đầy nghĩa tình',
        sensitivity: 'do',
        content: 'Dạ thưa chị Mai Lan, thầy rất thấu hiểu và sẻ chia sâu sắc hoàn cảnh ngặt nghèo này cùng chị. Về học phí 2.800.000đ, trung tâm thực hiện lệnh hoàn lại ngay trong ngày, chị gửi STK cho thầy nhé. Thầy chúc chị ca phẫu thuật thuận lợi, kiên cường vượt qua hóa trị. Bất cứ khi nào chị khỏe mạnh trở lại, thầy luôn sẵn sàng đồng hành cùng chị trên phím đàn!'
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
        tone: 'Thấu cảm & Kê đơn 15 phút tập',
        sensitivity: 'xanh',
        content: 'Thầy hiểu mà anh Nam ơi! Cuộc sống người đi làm nhiều khi có những giai đoạn công việc nó "chiếm sóng" hết thời gian quý báu của mình á. Anh đừng tự tạo áp lực nhen! Nếu hôm nào về nhà mà "lỡ" dư ra được... 15 phút rảnh thì anh chỉ cần lướt ngón nhẹ nhàng 1 bài hợp âm thôi (có tập 15p vẫn hơn là ko tập kk 🥰). Khi nào bận quá trên 7 ngày liên tục, anh cứ nhắn thầy kích hoạt bảo lưu (mình có tối đa 90 ngày bảo lưu lận đó), không lo mất bài đâu anh hengg!'
      },
      {
        id: 'sug-3-2',
        tone: 'Nhắc chính sách bảo lưu & Giảm tải',
        sensitivity: 'vang',
        content: 'Dạ không sao đâu anh Nam ơi! Đừng lo quên bài, cơ bắp ngón tay có trí nhớ tốt lắm, khi quay lại chỉ cần 2 hôm là quen ngay. Nếu đợt kiểm toán này còn kéo dài cả tuần nữa, anh báo thầy để thầy lưu ý kích hoạt bảo lưu theo policy 90 ngày cho anh an tâm làm việc nha. Còn nếu rảnh tay 10-15 phút thì cứ ngồi vào đàn bấm vài nốt xả stress thôi anh nghen!'
      },
      {
        id: 'sug-3-3',
        tone: 'Ngắn gọn & Khích lệ tinh thần',
        sensitivity: 'xanh',
        content: 'Hi anh Nam, công việc là ưu tiên số 1 lúc này, anh nhớ giữ gìn sức khỏe nhen! Đàn piano là để giải tỏa căng thẳng chứ không phải gánh nặng đâu nè. Mỗi tối chỉ cần 10-15 phút thư giãn bên phím đàn là đủ rồi anh ha, chúc anh sớm vượt qua đợt kiểm toán kk!'
      }
    ]
  }
];
