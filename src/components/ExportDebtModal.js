// meat-management-fe/src/components/ExportDebtModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  Alert,
  Image,
  Linking,
} from 'react-native';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import SmoothModal from './SmoothModal';
import UpdatePhoneModal from './UpdatePhoneModal';

const ExportDebtModal = forwardRef(({ onRefresh }, ref) => {
  const updatePhoneModalRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [availableMonths, setAvailableMonths] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [imageUri, setImageUri] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [error, setError] = useState('');

  // 1. Phơi bày các hàm điều khiển ra bên ngoài
  useImperativeHandle(ref, () => ({
    open: (c) => {
      setCustomer(c);
      setVisible(true);
      setSelectedMonth('');
      setAvailableMonths([]);
      setTransactions([]);
      setPayments([]);
      setImageUri(null);
      setError('');
      fetchData(c.id, c);
    },
    close: () => {
      setVisible(false);
    }
  }));

  // 2. Tải toàn bộ giao dịch & thu tiền để trích xuất các tháng khả dụng
  const fetchData = async (customerId, currentCust) => {
    setLoading(true);
    setError('');
    try {
      const [transRes, payRes] = await Promise.all([
        api.get(`/transactions?customerId=${customerId}`),
        api.get(`/payments?customerId=${customerId}`)
      ]);

      const transList = transRes.data?.data || [];
      const payList = payRes.data?.data || [];

      setTransactions(transList);
      setPayments(payList);

      // Trích xuất các tháng duy nhất có giao dịch phát sinh
      const monthsSet = new Set();

      transList.forEach(t => {
        const d = new Date(t.date);
        const mm = (d.getMonth() + 1).toString().padStart(2, '0');
        const yyyy = d.getFullYear();
        monthsSet.add(`${mm}/${yyyy}`);
      });

      payList.forEach(p => {
        const d = new Date(p.paidAt);
        const mm = (d.getMonth() + 1).toString().padStart(2, '0');
        const yyyy = d.getFullYear();
        monthsSet.add(`${mm}/${yyyy}`);
      });

      // Chuyển set thành mảng và sắp xếp ngược lại (tháng mới nhất lên đầu)
      const monthsArray = Array.from(monthsSet).sort((a, b) => {
        const [aM, aY] = a.split('/').map(Number);
        const [bM, bY] = b.split('/').map(Number);
        return bY - aY || bM - aM;
      });

      setAvailableMonths(monthsArray);

      // Chọn tháng mặc định là tháng gần nhất có giao dịch
      let defaultMonth = '';
      if (monthsArray.length > 0) {
        defaultMonth = monthsArray[0];
      } else {
        const d = new Date();
        const mm = (d.getMonth() + 1).toString().padStart(2, '0');
        const yyyy = d.getFullYear();
        defaultMonth = `${mm}/${yyyy}`;
      }
      setSelectedMonth(defaultMonth);

      // Tự động tạo ảnh công nợ ngay khi tải xong dữ liệu
      if (monthsArray.length > 0) {
        generateDebtImage(defaultMonth, transList, payList, currentCust);
      }

    } catch (err) {
      console.error(err);
      setError('Không thể tải lịch sử giao dịch để xuất công nợ.');
    } finally {
      setLoading(false);
    }
  };

  // Định dạng hiển thị tiền tệ VNĐ
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount).replace('₫', 'đ');
  };

  // 3. Tạo file ảnh công nợ từ dữ liệu tháng được chọn bằng HTML5 Canvas (Hàm tự động vẽ)
  const generateDebtImage = (month, transList, payList, cust) => {
    if (Platform.OS !== 'web') {
      return; // Không vẽ trên môi trường Native để tránh lỗi Canvas
    }

    if (!month || !cust) return;

    setGenerating(true);
    setImageUri(null); // Reset ảnh cũ trong khi vẽ ảnh mới

    try {
      // Lọc các giao dịch phát sinh trong tháng đã chọn
      const filteredTrans = transList.filter(t => {
        const d = new Date(t.date);
        const mm = (d.getMonth() + 1).toString().padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${mm}/${yyyy}` === month;
      });

      const filteredPays = payList.filter(p => {
        const d = new Date(p.paidAt);
        const mm = (d.getMonth() + 1).toString().padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${mm}/${yyyy}` === month;
      });

      // Nhóm giao dịch & thanh toán theo ngày (mỗi ngày chỉ 1 mảng thôi)
      const dayMap = {};
      let totalDebtInMonth = 0;
      let totalPaymentInMonth = 0;

      filteredTrans.forEach(t => {
        const d = new Date(t.date);
        const dateKey = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
        if (!dayMap[dateKey]) {
          dayMap[dateKey] = {
            date: t.date,
            dateKey,
            debtAmount: 0,
            paymentAmount: 0,
            items: [],
            notes: []
          };
        }
        const amt = parseFloat(t.totalAmount || 0);
        dayMap[dateKey].debtAmount += amt;
        totalDebtInMonth += amt;

        if (t.items && t.items.length > 0) {
          t.items.forEach(item => {
            const q = parseFloat(item.quantity);
            const p = parseFloat(item.price);
            const name = item.product?.name || 'Thịt';
            const isQuick = name === 'Tiền hàng' || name.toLowerCase().startsWith('tiền') || t.note === 'Ghi nợ nhanh';
            if (isQuick) {
              dayMap[dateKey].items.push(name);
            } else {
              dayMap[dateKey].items.push(`${q}${item.product?.unit || 'kg'} ${name} (giá ${p / 1000}k)`);
            }
          });
        }
        if (t.note && t.note !== 'Ghi nợ nhanh') {
          dayMap[dateKey].notes.push(t.note);
        }
      });

      filteredPays.forEach(p => {
        const d = new Date(p.paidAt);
        const dateKey = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
        if (!dayMap[dateKey]) {
          dayMap[dateKey] = {
            date: p.paidAt,
            dateKey,
            debtAmount: 0,
            paymentAmount: 0,
            items: [],
            notes: []
          };
        }
        const amt = parseFloat(p.amount || 0);
        dayMap[dateKey].paymentAmount += amt;
        totalPaymentInMonth += amt;

        if (p.note && !p.note.startsWith('Thanh toán nợ ngày')) {
          dayMap[dateKey].notes.push(p.note);
        }
      });

      // Sắp xếp tăng dần theo thời gian (cũ tới mới)
      const rows = Object.values(dayMap).sort((a, b) => new Date(a.date) - new Date(b.date));

      // Hàm ngắt dòng cho chữ tiếng Việt trên canvas
      const wrapText = (context, text, maxWidth) => {
        const lines = [];
        let currentLine = '';
        const words = text.split(' ');

        for (let i = 0; i < words.length; i++) {
          let word = words[i];

          // Nếu bản thân một từ dài hơn maxWidth, cần bẻ từ đó ra
          while (context.measureText(word).width > maxWidth) {
            let breakIndex = 1;
            while (context.measureText(word.substring(0, breakIndex)).width <= maxWidth && breakIndex <= word.length) {
              breakIndex++;
            }
            breakIndex--; // Lùi lại để lấy phần an toàn

            const part = word.substring(0, breakIndex);
            
            if (currentLine) {
              lines.push(currentLine);
              currentLine = '';
            }
            lines.push(part);
            word = word.substring(breakIndex);
          }

          if (!word) continue;

          const testLine = currentLine ? currentLine + ' ' + word : word;
          const metrics = context.measureText(testLine);
          
          if (metrics.width <= maxWidth) {
            currentLine = testLine;
          } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
          }
        }
        if (currentLine) {
          lines.push(currentLine);
        }
        return lines;
      };

      const width = 800;
      const startTableY = 160;
      const footerHeight = 160;

      // Tạo một canvas tạm thời để đo độ rộng chữ và tính toán chiều cao hàng
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.font = '15px Arial';

      const colDateX = 50;
      const colDescX = 125;
      const colDebtX = width - 170; // 630
      const colPayX = width - 50;   // 750
      const colDescMaxWidth = colDebtX - colDescX - 25; // 505

      const lineHeight = 20;
      const paddingY = 15;
      const minRowHeight = 55;

      // Tính toán số dòng chữ mô tả và chiều cao của từng hàng
      const rowsWithLayout = rows.map(row => {
        let descText = '';
        const parts = [];
        if (row.items && row.items.length > 0) {
          parts.push(row.items.join(', '));
        }
        if (row.notes && row.notes.length > 0) {
          parts.push(row.notes.join('; '));
        }
        descText = parts.join(' | ');

        // Sử dụng hàm wrapText để ngắt dòng chi tiết giao dịch
        const descLines = wrapText(tempCtx, descText, colDescMaxWidth);

        // Chiều cao tính toán của hàng
        const textHeight = descLines.length * lineHeight;
        const calculatedHeight = textHeight + paddingY * 2;
        const rowHeight = Math.max(minRowHeight, calculatedHeight);

        return {
          ...row,
          descLines,
          rowHeight
        };
      });

      const contentHeight = rowsWithLayout.length > 0
        ? rowsWithLayout.reduce((sum, r) => sum + r.rowHeight, 0)
        : 80;

      const canvasHeight = startTableY + 42 + contentHeight + footerHeight;

      // Tạo canvas chính thức để vẽ
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');

      // Vẽ nền trắng phẳng tinh tế
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, canvasHeight);

      // Vẽ viền bo nhẹ ngoài cùng
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 2;
      ctx.strokeRect(15, 15, width - 30, canvasHeight - 30);

      // ─── PHẦN TIÊU ĐỀ (HEADER) ───────────────────
      ctx.fillStyle = '#0F172A'; // Chữ tối màu tương phản cao
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`BẢNG CHI TIẾT CÔNG NỢ THÁNG ${month}`, width / 2, 75);

      // Vẽ đường phân cách nét mảnh
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(35, 105);
      ctx.lineTo(width - 35, 105);
      ctx.stroke();

      // Thông tin khách hàng
      ctx.textAlign = 'left';
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 16px Arial';
      ctx.fillText(`Khách hàng: ${cust?.name}`, 40, 135);

      ctx.textAlign = 'right';
      ctx.font = '16px Arial';
      ctx.fillStyle = '#475569';
      ctx.fillText(`Số ĐT: ${cust?.phone || 'Không có'}`, width - 40, 135);

      // ─── PHẦN BẢNG DỮ LIỆU (TABLE HEADER) ──────────
      ctx.fillStyle = '#10B981'; // Header bảng màu xanh lá
      ctx.fillRect(40, startTableY, width - 80, 42);
      ctx.strokeStyle = '#059669';
      ctx.lineWidth = 1;
      ctx.strokeRect(40, startTableY, width - 80, 42);

      // Chữ tiêu đề cột
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 15px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('Ngày', colDateX, startTableY + 27);
      ctx.fillText('Nội dung / Chi tiết giao dịch trong ngày', colDescX, startTableY + 27);

      ctx.textAlign = 'right';
      ctx.fillText('Tiền Nợ (+)', colDebtX, startTableY + 27);
      ctx.fillText('Đã Trả (-)', colPayX, startTableY + 27);

      // ─── VẼ CÁC DÒNG GIAO DỊCH ─────────────────────
      let currentY = startTableY + 42;
      ctx.textAlign = 'left';

      if (rowsWithLayout.length === 0) {
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(40, currentY, width - 80, 80);
        ctx.strokeStyle = '#E2E8F0';
        ctx.strokeRect(40, currentY, width - 80, 80);

        ctx.fillStyle = '#94A3B8';
        ctx.font = 'italic 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Không có giao dịch phát sinh trong tháng này', width / 2, currentY + 48);
        currentY += 80;
      } else {
        rowsWithLayout.forEach((row, idx) => {
          // Tô màu nền xen kẽ để dễ đọc dòng
          ctx.fillStyle = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
          ctx.fillRect(40, currentY, width - 80, row.rowHeight);

          ctx.strokeStyle = '#E2E8F0';
          ctx.strokeRect(40, currentY, width - 80, row.rowHeight);

          // Thiết lập textBaseline là middle để căn giữa dọc dễ dàng hơn
          ctx.textBaseline = 'middle';

          // Cột ngày
          ctx.fillStyle = '#0F172A';
          ctx.font = '15px Arial';
          ctx.textAlign = 'left';

          const [day, monthStr] = row.dateKey.split('/');
          ctx.fillText(`${day}/${monthStr}`, colDateX, currentY + row.rowHeight / 2);

          // Cột Chi tiết mô tả - vẽ nhiều dòng
          ctx.fillStyle = '#0F172A';
          ctx.textAlign = 'left';

          // Tính toán vị trí Y xuất phát sao cho toàn bộ cụm chữ được căn giữa theo chiều dọc của hàng
          const startTextY = currentY + row.rowHeight / 2 - ((row.descLines.length - 1) * lineHeight) / 2;
          row.descLines.forEach((line, lineIdx) => {
            ctx.fillText(line, colDescX, startTextY + lineIdx * lineHeight);
          });

          // Cột tiền nợ
          ctx.textAlign = 'right';
          if (row.debtAmount > 0) {
            ctx.fillStyle = '#DC2626';
            ctx.font = 'bold 15px Arial';
            ctx.fillText(formatCurrency(row.debtAmount), colDebtX, currentY + row.rowHeight / 2);
          }

          // Cột tiền trả
          if (row.paymentAmount > 0) {
            ctx.fillStyle = '#10B981';
            ctx.font = 'bold 15px Arial';
            ctx.fillText(formatCurrency(row.paymentAmount), colPayX, currentY + row.rowHeight / 2);
          }

          currentY += row.rowHeight;
          ctx.textBaseline = 'alphabetic'; // Trả về mặc định cho các phần vẽ sau
          ctx.textAlign = 'left';
        });
      }

      // ─── PHẦN TỔNG KẾT (FOOTER) ───────────────────
      currentY += 15;

      // Vẽ nét gạch ngang trước tổng kết
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(40, currentY);
      ctx.lineTo(width - 40, currentY);
      ctx.stroke();

      currentY += 30;

      // Hàng 1: Tổng tiền nợ
      ctx.textAlign = 'right';
      ctx.fillStyle = '#475569';
      ctx.font = '16px Arial';
      ctx.fillText('Tổng tiền nợ:', 560, currentY);

      ctx.fillStyle = '#DC2626';
      ctx.font = 'bold 16px Arial';
      ctx.fillText(formatCurrency(totalDebtInMonth), 760, currentY);

      // Hàng 2: Tổng tiền đã thanh toán
      currentY += 30;
      ctx.fillStyle = '#475569';
      ctx.font = '16px Arial';
      ctx.fillText('Tổng tiền đã thanh toán:', 560, currentY);

      ctx.fillStyle = '#10B981';
      ctx.font = 'bold 16px Arial';
      ctx.fillText(formatCurrency(totalPaymentInMonth), 760, currentY);

      // Hàng 3: Tiền nợ còn lại
      currentY += 35;
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 17px Arial';
      ctx.fillText('Tiền nợ còn lại:', 560, currentY);

      const overallDebt = cust?.debt || 0;
      ctx.fillStyle = overallDebt > 0 ? '#DC2626' : '#10B981';
      ctx.font = 'bold 20px Arial';
      ctx.fillText(formatCurrency(overallDebt), 760, currentY);

      // Xuất base64
      const url = canvas.toDataURL('image/png');
      setImageUri(url);

    } catch (err) {
      console.error('[GENERATE IMAGE ERROR]', err);
    } finally {
      setGenerating(false);
    }
  };

  // Chuyển đổi chuỗi base64 thành Blob để hỗ trợ tải ảnh trên trình duyệt di động (Android/Samsung)
  const base64ToBlob = (base64Data, contentType = 'image/png') => {
    const sliceSize = 512;
    const byteCharacters = atob(base64Data.split(',')[1]);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, { type: contentType });
  };

  // Chuẩn hóa số điện thoại và mở Zalo
  const proceedZalo = (phone) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length >= 9) {
      let webPhone = cleanPhone;
      if (webPhone.startsWith('84')) {
        webPhone = '0' + webPhone.slice(2);
      } else if (!webPhone.startsWith('0')) {
        webPhone = '0' + webPhone;
      }

      const zaloUrl = `https://zalo.me/${webPhone}`;

      // Mở Zalo chat của khách hàng
      Linking.openURL(zaloUrl).catch((err) => {
        console.error('Không thể mở Zalo:', err);
        Alert.alert('Lỗi', 'Không thể mở ứng dụng Zalo. Vui lòng kiểm tra lại.');
      });
    } else {
      Alert.alert('SĐT không hợp lệ', 'Số điện thoại của khách hàng không đúng định dạng.');
    }
  };

  // Kiểm tra thiết bị có phải iOS (iPhone/iPad) không
  const isIOS = () => {
    if (Platform.OS !== 'web') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  };

  // 4. Tải ảnh về máy và tự động điều hướng sang Zalo gửi cho khách hàng
  const handleDownloadAndZalo = async () => {
    const targetPhone = customer?.phone;

    // Kiểm tra SĐT trước — nếu thiếu thì mở popup nhập, không làm gì thêm
    if (!targetPhone) {
      updatePhoneModalRef.current?.open(customer, (newPhone) => {
        setCustomer(prev => ({ ...prev, phone: newPhone }));
        if (onRefresh) onRefresh();
        proceedZalo(newPhone);
      });
      return;
    }

    if (Platform.OS === 'web' && imageUri) {
      const safeName = customer?.name?.replace(/\s+/g, '_') || 'Khach';
      const safeMonth = selectedMonth.replace('/', '-');
      const fileName = `CongNo_${safeName}_Thang_${safeMonth}.png`;

      try {
        const blob = base64ToBlob(imageUri, 'image/png');

        // Trên iOS Safari: dùng Web Share API để hiện Share Sheet
        // Người dùng có thể chọn "Lưu ảnh" vào thư viện hoặc gửi thẳng qua Zalo
        if (isIOS() && navigator.canShare) {
          const imageFile = new File([blob], fileName, { type: 'image/png' });

          if (navigator.canShare({ files: [imageFile] })) {
            // Hiện iOS Share Sheet — sau khi người dùng đóng mới mở Zalo
            await navigator.share({
              files: [imageFile],
              title: `Ảnh công nợ tháng ${selectedMonth}`,
            });
            // Mở Zalo sau khi đã chia sẻ/lưu ảnh xong
            proceedZalo(targetPhone);
            return;
          }
        }

        // Android / Desktop: tải ảnh bằng Blob Object URL rồi mở Zalo sau 800ms
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Giải phóng bộ nhớ Object URL sau khi hoàn tất
        setTimeout(() => URL.revokeObjectURL(blobUrl), 200);

        // Đợi một chút để trình duyệt kịp lưu file trước khi mở Zalo
        setTimeout(() => proceedZalo(targetPhone), 800);
        return;
      } catch (err) {
        // Người dùng huỷ Share Sheet hoặc lỗi — chỉ log, không mở Zalo
        if (err?.name !== 'AbortError') {
          console.error('Lỗi khi tải / chia sẻ ảnh:', err);
        }
        return;
      }
    }

    // Không có ảnh: chỉ mở Zalo
    proceedZalo(targetPhone);
  };

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)}>
        <View style={styles.modalView}>
          <Text style={styles.modalTitle}>📊 XUẤT ẢNH CÔNG NỢ CHI TIẾT</Text>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Đang tải lịch sử công nợ...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
              <TouchableOpacity
                style={[styles.button, styles.retryButton]}
                onPress={() => fetchData(customer?.id, customer)}
              >
                <Text style={styles.retryButtonText}>TẢI LẠI DỮ LIỆU</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <View style={styles.customerBox}>
                <Text style={styles.customerText}>
                  Khách hàng: <Text style={styles.boldText}>{customer?.name}</Text>
                </Text>
                <Text style={styles.customerText}>
                  Số điện thoại: <Text style={styles.boldText}>{customer?.phone || 'Chưa ghi nhận'}</Text>
                </Text>
              </View>

              <Text style={styles.sectionLabel}>Chọn tháng cần xuất công nợ:</Text>

              {availableMonths.length === 0 ? (
                <Text style={styles.noMonthsText}>
                  Khách hàng này chưa phát sinh giao dịch nào để xuất công nợ.
                </Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.monthScroll}
                  contentContainerStyle={styles.monthScrollContent}
                >
                  {availableMonths.map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.monthItem, selectedMonth === m && styles.activeMonthItem]}
                      onPress={() => {
                        setSelectedMonth(m);
                        // Kích hoạt vẽ lại ảnh tức thì khi đổi tháng
                        generateDebtImage(m, transactions, payments, customer);
                      }}
                    >
                      <Text style={[styles.monthItemText, selectedMonth === m && styles.activeMonthItemText]}>
                        Tháng {m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* TRẠNG THÁI ĐANG VẼ ẢNH */}
              {generating && (
                <View style={styles.generatingBox}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.generatingText}>Đang vẽ ảnh công nợ...</Text>
                </View>
              )}

              {/* PHẦN HIỂN THỊ XEM TRƯỚC VÀ NÚT TẢI */}
              {imageUri && !generating && (
                <View style={styles.previewBox}>
                  <View style={styles.previewHeaderRow}>
                    <Text style={styles.sectionLabelInline}>Bảng ảnh xem trước:</Text>
                    <TouchableOpacity
                      style={[
                        styles.downloadButtonInline,
                        styles.zaloActiveColor
                      ]}
                      onPress={handleDownloadAndZalo}
                    >
                      <Text style={styles.downloadButtonInlineText}>
                        💾 Tải & Gửi Zalo
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.imageShadowFrame}>
                    <Image
                      source={{ uri: imageUri }}
                      style={styles.previewImage}
                      resizeMode="contain"
                    />
                  </View>

                  {Platform.OS !== 'web' && (
                    <Text style={styles.helperText}>
                      💡 Mẹo: Nhấn giữ vào ảnh trên để lưu vào Thư viện ảnh của thiết bị hoặc chụp màn hình để chia sẻ nhanh qua Zalo.
                    </Text>
                  )}
                </View>
              )}
            </ScrollView>
          )}

          {/* Nút đóng chân Modal */}
          <TouchableOpacity
            style={[styles.button, styles.closeButton]}
            onPress={() => setVisible(false)}
            disabled={generating}
          >
            <Text style={styles.closeButtonText}>ĐÓNG LẠI</Text>
          </TouchableOpacity>
        </View>
      </SmoothModal>
      <UpdatePhoneModal ref={updatePhoneModalRef} onUpdateSuccess={onRefresh} />
    </>
  );
});

export default ExportDebtModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 15,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  errorContainer: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.dangerDark,
    backgroundColor: COLORS.dangerLight,
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 15,
    width: '100%',
  },
  scrollContent: {
    marginBottom: 15,
  },
  customerBox: {
    backgroundColor: COLORS.inputBg,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  customerText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  boldText: {
    fontWeight: 'bold',
    color: COLORS.text,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 10,
  },
  noMonthsText: {
    fontSize: 14,
    color: COLORS.textLight,
    fontStyle: 'italic',
    marginBottom: 16,
  },
  monthScroll: {
    marginBottom: 16,
    flexDirection: 'row',
  },
  monthScrollContent: {
    gap: 8,
    paddingRight: 10,
  },
  monthItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  activeMonthItem: {
    borderColor: COLORS.primary,
    backgroundColor: '#ECFDF5',
  },
  monthItemText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  activeMonthItemText: {
    color: COLORS.primaryDark,
    fontWeight: 'bold',
  },
  generatingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  generatingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  actionButton: {
    backgroundColor: COLORS.primary,
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  previewBox: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 16,
  },
  // Khung tiêu đề hiển thị song song nhãn và nút tải
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionLabelInline: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  // Nút tải ảnh dạng inline nằm góc phải
  downloadButtonInline: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  downloadButtonInlineText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  // Nền màu xanh Zalo khi khách hàng có SĐT
  zaloActiveColor: {
    backgroundColor: '#0068FF',
    shadowColor: '#0068FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  // Nền màu xanh lá thông thường khi khách hàng không có SĐT
  normalActiveColor: {
    backgroundColor: COLORS.primaryDark,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  imageShadowFrame: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    ...SHADOWS.card,
  },
  previewImage: {
    width: '100%',
    height: 380,
  },
  noImagePlaceholder: {
    height: 150,
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  placeholderText: {
    color: COLORS.textLight,
    fontSize: 14,
  },
  downloadButton: {
    backgroundColor: COLORS.primaryDark,
    shadowColor: COLORS.primaryDark,
  },
  helperText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 18,
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  button: {
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    height: 40,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  closeButton: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  closeButtonText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: 'bold',
  },
});
