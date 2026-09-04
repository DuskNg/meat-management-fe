// meat-management-fe/src/components/ExportSupplierHistoryModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef, useEffect } from 'react';
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
import { COLORS, FONTS } from '../theme';
import SmoothModal from './SmoothModal';
import CustomSelect from './CustomSelect';

// Helper chuyển đổi Base64 sang Blob
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

// Modal xuất dữ liệu nhập hàng & trả tiền của nhà cung cấp dạng ảnh
const ExportSupplierHistoryModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [supplier, setSupplier] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [availableMonths, setAvailableMonths] = useState([]);
  const [rawHistory, setRawHistory] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [imageUri, setImageUri] = useState(null);
  const [selectContainerZIndex, setSelectContainerZIndex] = useState(10);

  useImperativeHandle(ref, () => ({
    open: (supplierData, targetMonth, fullHistory = []) => {
      setSupplier(supplierData);
      setRawHistory(fullHistory);
      setImageUri(null);

      // Trích xuất danh sách tháng từ lịch sử giao dịch
      const monthsSet = new Set();
      fullHistory.forEach((item) => {
        if (item.date) {
          const d = new Date(item.date);
          if (!isNaN(d.getTime())) {
            const mStr = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
            monthsSet.add(mStr);
          }
        }
      });

      // Nếu không có giao dịch nào, lấy tháng hiện tại
      const now = new Date();
      const currentMonthStr = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
      monthsSet.add(currentMonthStr);

      const sortedMonths = Array.from(monthsSet).sort((a, b) => {
        const [mA, yA] = a.split('/').map(Number);
        const [mB, yB] = b.split('/').map(Number);
        return yB !== yA ? yB - yA : mB - mA;
      });

      setAvailableMonths(sortedMonths);
      const chosenMonth = targetMonth && targetMonth !== 'ALL' && sortedMonths.includes(targetMonth)
        ? targetMonth
        : (sortedMonths[0] || currentMonthStr);

      setSelectedMonth(chosenMonth);
      setVisible(true);

      // Tiến hành vẽ ảnh cho tháng đã chọn
      setTimeout(() => {
        generateImage(supplierData, chosenMonth, fullHistory);
      }, 100);
    },
    close: () => {
      setVisible(false);
    },
  }));

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(amount).replace('₫', 'đ');
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  };

  // Hàm ngắt dòng văn bản dài cho Canvas
  const wrapText = (context, text, maxWidth) => {
    if (!text) return [];
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = context.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  };

  // Hàm tạo ảnh bảng kê nhập hàng & thanh toán bằng Canvas
  const generateImage = (sup, month, historyList) => {
    if (Platform.OS !== 'web') {
      Alert.alert('Thông báo', 'Tính năng xuất ảnh hiện hỗ trợ tốt nhất trên nền tảng Web.');
      return;
    }

    setGenerating(true);
    setImageUri(null);

    try {
      // 1. Lọc các giao dịch thuộc tháng được chọn
      const monthItems = historyList.filter((item) => {
        if (!item.date) return false;
        const d = new Date(item.date);
        if (isNaN(d.getTime())) return false;
        const mStr = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
        return mStr === month;
      });

      // Sắp xếp theo ngày tăng dần để theo dõi trình tự giao dịch
      monthItems.sort((a, b) => new Date(a.date) - new Date(b.date));

      // Tính tổng nhập và tổng trả
      let totalDebt = 0;
      let totalPayment = 0;
      monthItems.forEach((it) => {
        const amt = parseFloat(it.amount || 0);
        if (it.type === 'DEBT') {
          totalDebt += amt;
        } else {
          totalPayment += amt;
        }
      });
      const balance = totalDebt - totalPayment;

      // 2. Thiết lập kích thước Canvas
      const width = 860;
      const colWidths = {
        stt: 45,
        date: 105,
        type: 125,
        note: 385,
        amount: 150,
      };

      const startTableY = 220;
      const rowMinHeight = 38;
      const paddingX = 25;

      // Canvas tạm để đo kích thước chữ
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.font = '13px Arial';

      // Tính chiều cao từng hàng
      const rowsLayout = monthItems.map((item, idx) => {
        const noteText = item.note ? item.note.trim() : (item.type === 'DEBT' ? 'Nhập hàng nợ' : 'Thanh toán tiền hàng');
        const lines = wrapText(tempCtx, noteText, colWidths.note - 16);
        const rowHeight = Math.max(rowMinHeight, lines.length * 18 + 14);
        return {
          ...item,
          stt: idx + 1,
          lines,
          rowHeight,
        };
      });

      const tableContentHeight = rowsLayout.length > 0
        ? rowsLayout.reduce((sum, r) => sum + r.rowHeight, 0)
        : 60; // Chiều cao hàng trống

      const footerHeight = 260; // Khu vực tổng kết và chữ ký
      const canvasHeight = startTableY + 42 + tableContentHeight + footerHeight;

      // Tạo Canvas vẽ chính
      const canvas = document.createElement('canvas');
      const scale = 1.5; // Tăng tỉ lệ scale để chữ sắc nét
      canvas.width = width * scale;
      canvas.height = canvasHeight * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);

      // Nền trắng tinh
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, canvasHeight);

      // Khung viền ngoài
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 2;
      ctx.strokeRect(12, 12, width - 24, canvasHeight - 24);

      // ─── PHẦN TIÊU ĐỀ BÁO CÁO ───
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 22px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('BẢNG KÊ NHẬP HÀNG & THANH TOÁN TIỀN HÀNG', width / 2, 55);

      ctx.fillStyle = '#475569';
      ctx.font = 'bold 15px Arial';
      ctx.fillText(`THÁNG ${month}`, width / 2, 80);

      // Đường kẻ phân cách header
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(paddingX, 100);
      ctx.lineTo(width - paddingX, 100);
      ctx.stroke();

      // Thông tin nhà cung cấp
      ctx.textAlign = 'left';
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 15px Arial';
      ctx.fillText(`Nhà cung cấp: ${sup?.name || '---'}`, paddingX, 128);

      ctx.font = '14px Arial';
      ctx.fillStyle = '#475569';
      ctx.fillText(`Số điện thoại: ${sup?.phone || 'Chưa cập nhật'}`, paddingX, 153);
      if (sup?.address) {
        ctx.fillText(`Địa chỉ: ${sup.address}`, paddingX, 178);
      }

      // Thời gian xuất báo cáo
      const now = new Date();
      const exportTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} - ${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
      ctx.textAlign = 'right';
      ctx.font = 'italic 13px Arial';
      ctx.fillStyle = '#64748B';
      ctx.fillText(`Thời gian xuất: ${exportTime}`, width - paddingX, 128);

      // ─── BẢNG DỮ LIỆU (TABLE HEADER) ───
      const tableHeadY = startTableY;
      const tableWidth = width - paddingX * 2;
      ctx.fillStyle = '#F1F5F9';
      ctx.fillRect(paddingX, tableHeadY, tableWidth, 36);

      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1;
      ctx.strokeRect(paddingX, tableHeadY, tableWidth, 36);

      ctx.fillStyle = '#1E293B';
      ctx.font = 'bold 13px Arial';
      ctx.textAlign = 'center';

      let curX = paddingX;
      ctx.fillText('STT', curX + colWidths.stt / 2, tableHeadY + 23);
      curX += colWidths.stt;

      ctx.fillText('Ngày', curX + colWidths.date / 2, tableHeadY + 23);
      curX += colWidths.date;

      ctx.fillText('Loại giao dịch', curX + colWidths.type / 2, tableHeadY + 23);
      curX += colWidths.type;

      ctx.textAlign = 'left';
      ctx.fillText('Nội dung / Ghi chú đơn hàng', curX + 10, tableHeadY + 23);
      curX += colWidths.note;

      ctx.textAlign = 'right';
      ctx.fillText('Số tiền (VND)', curX + colWidths.amount - 10, tableHeadY + 23);

      // Đường kẻ dọc cho tiêu đề bảng
      let lineX = paddingX;
      [colWidths.stt, colWidths.date, colWidths.type, colWidths.note].forEach((w) => {
        lineX += w;
        ctx.beginPath();
        ctx.moveTo(lineX, tableHeadY);
        ctx.lineTo(lineX, tableHeadY + 36);
        ctx.stroke();
      });

      // ─── DÒNG DỮ LIỆU (TABLE ROWS) ───
      let curY = tableHeadY + 36;
      if (rowsLayout.length === 0) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(paddingX, curY, tableWidth, 60);
        ctx.strokeRect(paddingX, curY, tableWidth, 60);

        ctx.fillStyle = '#94A3B8';
        ctx.font = 'italic 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Không có giao dịch nhập hàng hoặc thanh toán nào trong tháng này.', width / 2, curY + 35);
        curY += 60;
      } else {
        rowsLayout.forEach((row, idx) => {
          const isDebt = row.type === 'DEBT';
          // Màu xen kẽ dòng
          ctx.fillStyle = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
          ctx.fillRect(paddingX, curY, tableWidth, row.rowHeight);
          ctx.strokeRect(paddingX, curY, tableWidth, row.rowHeight);

          // Cột STT
          let colX = paddingX;
          ctx.fillStyle = '#475569';
          ctx.font = '13px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(row.stt.toString(), colX + colWidths.stt / 2, curY + 23);
          colX += colWidths.stt;

          // Cột Ngày
          ctx.fillText(formatDate(row.date), colX + colWidths.date / 2, curY + 23);
          colX += colWidths.date;

          // Cột Loại giao dịch (Badge)
          ctx.textAlign = 'center';
          ctx.font = 'bold 12px Arial';
          ctx.fillStyle = isDebt ? '#DC2626' : '#16A34A';
          ctx.fillText(isDebt ? '📥 Nhập hàng' : '💵 Trả tiền', colX + colWidths.type / 2, curY + 23);
          colX += colWidths.type;

          // Cột Ghi chú
          ctx.textAlign = 'left';
          ctx.font = '13px Arial';
          ctx.fillStyle = '#334155';
          row.lines.forEach((line, lineIdx) => {
            ctx.fillText(line, colX + 8, curY + 20 + lineIdx * 18);
          });
          colX += colWidths.note;

          // Cột Số tiền
          ctx.textAlign = 'right';
          ctx.font = 'bold 13px Arial';
          ctx.fillStyle = isDebt ? '#DC2626' : '#16A34A';
          const sign = isDebt ? '+' : '-';
          ctx.fillText(`${sign}${formatCurrency(row.amount)}`, colX + colWidths.amount - 10, curY + 23);

          // Kẻ đường dọc giữa các cột
          let rLineX = paddingX;
          [colWidths.stt, colWidths.date, colWidths.type, colWidths.note].forEach((w) => {
            rLineX += w;
            ctx.beginPath();
            ctx.moveTo(rLineX, curY);
            ctx.lineTo(rLineX, curY + row.rowHeight);
            ctx.stroke();
          });

          curY += row.rowHeight;
        });
      }

      // ─── TỔNG KẾT (SUMMARY FOOTER) ───
      curY += 15;
      const summaryBoxWidth = 380;
      const summaryX = width - paddingX - summaryBoxWidth;

      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(summaryX, curY, summaryBoxWidth, 105);
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.strokeRect(summaryX, curY, summaryBoxWidth, 105);

      // Tổng tiền nhập hàng
      ctx.textAlign = 'left';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#475569';
      ctx.fillText('Tổng tiền hàng nhập (+):', summaryX + 15, curY + 28);

      ctx.textAlign = 'right';
      ctx.font = 'bold 15px Arial';
      ctx.fillStyle = '#DC2626';
      ctx.fillText(`+${formatCurrency(totalDebt)}`, summaryX + summaryBoxWidth - 15, curY + 28);

      // Tổng tiền đã thanh toán
      ctx.textAlign = 'left';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#475569';
      ctx.fillText('Tổng tiền đã trả (-):', summaryX + 15, curY + 58);

      ctx.textAlign = 'right';
      ctx.font = 'bold 15px Arial';
      ctx.fillStyle = '#16A34A';
      ctx.fillText(`-${formatCurrency(totalPayment)}`, summaryX + summaryBoxWidth - 15, curY + 58);

      // Chênh lệch tháng
      ctx.textAlign = 'left';
      ctx.font = 'bold 14px Arial';
      ctx.fillStyle = '#0F172A';
      ctx.fillText('Chênh lệch nợ trong tháng:', summaryX + 15, curY + 88);

      ctx.textAlign = 'right';
      ctx.font = 'bold 16px Arial';
      ctx.fillStyle = balance > 0 ? '#DC2626' : (balance < 0 ? '#16A34A' : '#475569');
      const balanceSign = balance > 0 ? '+' : '';
      ctx.fillText(`${balanceSign}${formatCurrency(balance)}`, summaryX + summaryBoxWidth - 15, curY + 88);

      // ─── KHU VỰC CHỮ KÝ ───
      const signY = curY + 130;
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';

      ctx.fillText('ĐẠI DIỆN BÊN BÁN (NCC)', paddingX + 130, signY);
      ctx.font = 'italic 12px Arial';
      ctx.fillStyle = '#64748B';
      ctx.fillText('(Ký và ghi rõ họ tên)', paddingX + 130, signY + 20);

      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 14px Arial';
      ctx.fillText('ĐẠI DIỆN BÊN MUA (CHỦ SẠP)', width - paddingX - 130, signY);
      ctx.font = 'italic 12px Arial';
      ctx.fillStyle = '#64748B';
      ctx.fillText('(Ký và ghi rõ họ tên)', width - paddingX - 130, signY + 20);

      // Chuyển sang Data URL
      const dataUrl = canvas.toDataURL('image/png');
      setImageUri(dataUrl);
    } catch (err) {
      console.error('[GENERATE IMAGE ERROR]', err);
      Alert.alert('Lỗi', 'Không thể tạo hình ảnh báo cáo.');
    } finally {
      setGenerating(false);
    }
  };

  // Đổi tháng lọc
  const handleSelectMonth = (monthItem) => {
    const m = monthItem.id;
    setSelectedMonth(m);
    generateImage(supplier, m, rawHistory);
  };

  // Tải ảnh về máy
  const handleDownloadImage = async () => {
    if (!imageUri) return;
    const safeSupplier = supplier?.name?.replace(/\s+/g, '_') || 'NhaCungCap';
    const safeMonth = selectedMonth.replace('/', '-');
    const fileName = `BangKe_NCC_${safeSupplier}_Thang_${safeMonth}.png`;

    if (Platform.OS === 'web') {
      try {
        const blob = base64ToBlob(imageUri, 'image/png');

        // Nếu trình duyệt hỗ trợ chia sẻ tệp qua Web Share API (di động)
        if (navigator.canShare) {
          const imageFile = new File([blob], fileName, { type: 'image/png' });
          if (navigator.canShare({ files: [imageFile] })) {
            await navigator.share({
              files: [imageFile],
              title: `Bảng kê NCC ${supplier?.name} tháng ${selectedMonth}`,
            });
            return;
          }
        }

        // Tải thông qua thẻ <a>
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 200);
      } catch (err) {
        if (err?.name !== 'AbortError') {
          console.error('Lỗi khi tải ảnh:', err);
          Alert.alert('Lỗi', 'Không thể lưu hình ảnh về máy.');
        }
      }
    } else {
      Alert.alert('Thông báo', 'Tính năng tải ảnh trực tiếp được tối ưu cho phiên bản Web.');
    }
  };

  // Mở Zalo để gửi cho nhà cung cấp
  const handleSendZalo = () => {
    if (!supplier?.phone) {
      Alert.alert('Thiếu số điện thoại', 'Nhà cung cấp này chưa có số điện thoại liên hệ.');
      return;
    }

    const cleanPhone = supplier.phone.replace(/[^0-9]/g, '');
    let webPhone = cleanPhone;
    if (webPhone.startsWith('84')) {
      webPhone = '0' + webPhone.slice(2);
    } else if (!webPhone.startsWith('0')) {
      webPhone = '0' + webPhone;
    }

    const zaloUrl = `https://zalo.me/${webPhone}`;
    Linking.openURL(zaloUrl).catch((err) => {
      console.error('Không thể mở Zalo:', err);
      Alert.alert('Lỗi', 'Không thể mở ứng dụng Zalo.');
    });
  };

  const monthOptions = availableMonths.map((m) => ({ id: m, name: `Tháng ${m}` }));
  const selectedMonthOption = monthOptions.find((opt) => opt.id === selectedMonth) || null;

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        <Text style={styles.modalTitle}>🖼️ XUẤT BẢNG KÊ TIỀN HÀNG (DẠNG ẢNH)</Text>
        <Text style={styles.supplierName}>Nhà cung cấp: {supplier?.name}</Text>

        {/* Cụm chọn tháng xuất ảnh */}
        <View style={[styles.filterContainer, { zIndex: selectContainerZIndex }]}>
          <Text style={styles.filterLabel}>Tháng xuất báo cáo:</Text>
          <View style={styles.selectWrapper}>
            <CustomSelect
              options={monthOptions}
              value={selectedMonthOption}
              placeholder="Chọn tháng..."
              onSelect={handleSelectMonth}
              renderSelected={(m) => m?.name || ''}
              zIndex={999999}
              onOpenChange={(isOpen) => setSelectContainerZIndex(isOpen ? 999999 : 10)}
            />
          </View>
        </View>

        {/* Khung xem trước ảnh Canvas */}
        <View style={styles.previewContainer}>
          {generating ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Đang vẽ bảng kê chi tiết...</Text>
            </View>
          ) : imageUri ? (
            <ScrollView style={styles.imageScroll} contentContainerStyle={styles.imageContent}>
              <Image
                source={{ uri: imageUri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            </ScrollView>
          ) : (
            <View style={styles.loadingBox}>
              <Text style={styles.emptyText}>Chưa có hình ảnh báo cáo.</Text>
            </View>
          )}
        </View>

        {/* Nhóm nút hành động */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.downloadBtn, (!imageUri || generating) && styles.btnDisabled]}
            onPress={handleDownloadImage}
            disabled={!imageUri || generating}
            activeOpacity={0.7}
          >
            <Text style={styles.downloadBtnText}>📥 TẢI ẢNH VỀ MÁY</Text>
          </TouchableOpacity>

          {supplier?.phone ? (
            <TouchableOpacity
              style={styles.zaloBtn}
              onPress={handleSendZalo}
              activeOpacity={0.7}
            >
              <Text style={styles.zaloBtnText}>💬 GỬI ZALO</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity style={styles.closeBtn} onPress={() => setVisible(false)}>
          <Text style={styles.closeBtnText}>ĐÓNG LẠI</Text>
        </TouchableOpacity>
      </View>
    </SmoothModal>
  );
});

export default ExportSupplierHistoryModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '92%',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  supplierName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 12,
  },
  filterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
    position: 'relative',
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  selectWrapper: {
    flex: 1,
  },
  previewContainer: {
    height: 380,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textLight,
  },
  imageScroll: {
    width: '100%',
    height: '100%',
  },
  imageContent: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  previewImage: {
    width: '100%',
    height: 360,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  downloadBtn: {
    flex: 1,
    backgroundColor: '#2563EB',
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  zaloBtn: {
    backgroundColor: '#0284C7',
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zaloBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  closeBtn: {
    backgroundColor: COLORS.inputBg,
    height: 42,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  closeBtnText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: 'bold',
  },
});
