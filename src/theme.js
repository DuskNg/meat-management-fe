// meat-management-fe/src/theme.js

// Hệ màu sắc trực quan, độ tương phản cao, thuận tiện cho người low-tech nhận diện
export const COLORS = {
  primary: '#10B981',      // Xanh lá (Ghi nhận Thu tiền / Trả nợ xong / Thành công)
  primaryDark: '#059669',
  primaryLight: '#E6F4FE',

  danger: '#EF4444',       // Đỏ (Ghi nợ thịt mới / Số tiền nợ hiện tại)
  dangerDark: '#DC2626',
  dangerLight: '#FEE2E2',

  warning: '#F59E0B',      // Vàng cam (Cảnh báo nợ quá lâu)
  warningLight: '#FEF3C7',

  background: '#F8FAFC',   // Xám nhạt cao cấp làm nền nền (Slate 50)
  card: '#FFFFFF',         // Màu nền của các khung thông tin

  text: '#0F172A',         // Màu chữ đen đậm độ tương phản cao nhất (Slate 900)
  textSecondary: '#475569',// Chữ phụ, hướng dẫn (Slate 600)
  textLight: '#94A3B8',    // Chữ mờ hơn (Slate 400)

  border: '#E2E8F0',       // Đường kẻ ngăn cách (Slate 200)
  inputBg: '#F1F5F9',      // Nền của các ô nhập liệu (Slate 100)
};

// Cấu hình phông chữ lớn mặc định giúp mắt lớn mắt nhỏ đều đọc tốt
export const FONTS = {
  header: 28,      // Dành cho số tiền tổng nợ, tiêu đề to nhất
  title: 22,       // Tiêu đề các mục lớn, tên khách hàng
  subtitle: 18,    // Tên các mặt hàng thịt, nhãn nút bấm
  body: 16,        // Thông tin địa chỉ, ghi chú
  caption: 14,     // Thời gian giao dịch, ghi chú phụ
  
  weightBold: 'bold',
  weightMedium: '600',
  weightRegular: '400',
};

// Hiệu ứng bóng đổ nổi bật tạo chiều sâu cho khung thông tin
export const SHADOWS = {
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3, // Dành cho các thiết bị Android
  },
};
