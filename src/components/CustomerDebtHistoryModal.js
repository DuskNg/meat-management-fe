// meat-management-fe/src/components/CustomerDebtHistoryModal.js
import React, { useState, forwardRef, useImperativeHandle, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import SmoothModal from './SmoothModal';
import { useResourceLock } from '../hooks/useResourceLock';
import { showGlobalToast } from '../store/toastStore';

// Kích hoạt tính năng LayoutAnimation trên thiết bị Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import DailyDebtTile from './DailyDebtTile';
import MoneyInput from './MoneyInput';
import DatePickerInput from './DatePickerInput';
import { allocateDebtFIFO } from '../utils/debtAllocationHelper';

// ─── Các hàm tiện ích tính toán ngày hiển thị nhanh ───
const formatDateToDisplay = (dateObj) => {
  if (!dateObj) return '';
  const d = new Date(dateObj);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
};

const getTodayDisplay = () => {
  const today = new Date();
  const d = String(today.getDate()).padStart(2, '0');
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const y = today.getFullYear();
  return `${d}/${m}/${y}`;
};

const getDaysAgoDisplay = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
};

const getStartOfWeekDisplay = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Thứ 2 đầu tuần
  const monday = new Date(d.setDate(diff));
  const dd = String(monday.getDate()).padStart(2, '0');
  const mm = String(monday.getMonth() + 1).padStart(2, '0');
  const yy = monday.getFullYear();
  return `${dd}/${mm}/${yy}`;
};

const getStartOfMonthDisplay = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `01/${mm}/${yy}`;
};

// Helper nhận diện thanh toán trả lại hàng
const isReturnPayment = (p) => {
  if (!p || !p.note) return false;
  const trimNote = p.note.trim();
  return (
    trimNote.includes('[Trả lại hàng]') ||
    trimNote.includes('[Trả hàng nhanh]') ||
    trimNote.includes('[Trả hàng]') ||
    trimNote.includes('Trả hàng') ||
    trimNote.includes('Trả lại')
  );
};

// Helper phân tích danh sách các món thịt trả lại từ ghi chú
const parseReturnItems = (note, defaultAmount) => {
  if (!note) return [{ type: 'RETURN', name: 'TRẢ HÀNG', quantity: null, price: null, amount: defaultAmount }];

  const isNoteLevelImport = /\b(nhập hàng|nhập thịt|nhập kho|nhập lô|mua thịt|mua hàng|nhap hang|nhap thit)\b/i.test(note || '');

  let text = note
    .replace(/[-–—:\s]*\[[^\]]*(?:dọn dẹp|cloudinary|không xem được|ảnh\/video|đã xóa)[^\]]*\]/gi, '')
    .replace(/\[Trả lại hàng\]|\[Trả hàng nhanh\]|\[Trả hàng\]|\[Nhập hàng\]/gi, '')
    .trim();
  text = text.replace(/^(?:Trả hàng nhanh|Trả lại hàng|Trả hàng|Nhập hàng)\s*[:-]?\s*/gi, '').trim();
  if (!text) {
    return [{
      type: 'RETURN',
      name: isNoteLevelImport ? 'NHẬP HÀNG' : 'TRẢ HÀNG',
      quantity: null,
      price: null,
      amount: defaultAmount,
    }];
  }

  const formatReturnItemName = (rawName, isPartImport) => {
    let clean = (rawName || '').trim();
    clean = clean.replace(/\(\s*[\d.,]+\s*[đ₫kKVND]?\s*\)/gi, ' ').trim();
    clean = clean.replace(/^(TRẢ HÀNG NHANH|TRẢ LẠI HÀNG|TRẢ HÀNG|TRẢ LẠI|TRẢ|NHẬP HÀNG|NHẬP THỊT|NHẬP)\s*[:-]?\s*/gi, ' ').trim();
    clean = clean.replace(/[-–—:]*\s*(?:NHẬP HÀNG|NHẬP THỊT|NHẬP TÁI(?:\s*\d+)?|NHẬP GẦU(?:\s*\d+)?|NHẬP\s+[a-zA-ZÀ-ỹ]+(?:\s*\d+)?)\s*$/gi, ' ').trim();
    clean = clean.replace(/[-–—:]*\s*\d+(?:[.,]\d+)?\s*(?:kg|kilo)?\s+[a-zA-ZÀ-ỹ\s()]+\s*$/gi, ' ').trim();
    clean = clean.replace(/^[-–—:\s]+|[-–—:\s]+$/g, '').trim().toUpperCase();

    if (isPartImport || isNoteLevelImport) {
      return clean ? `NHẬP: ${clean}` : 'NHẬP HÀNG';
    }
    return clean ? `TRẢ: ${clean}` : 'TRẢ HÀNG';
  };

  const parts = text.split(/,\s*(?=[a-zA-Z\d\u00C0-\u1EF9])/);
  const results = [];

  for (let part of parts) {
    part = part.trim();
    if (!part) continue;

    const isPartImport = /\b(nhập hàng|nhập thịt|nhập tái|nhập gầu|nhập kho|nhập lô|mua thịt|mua hàng|nhap hang|nhap thit|nhap)\b/i.test(part) || isNoteLevelImport;

    const oldFormatRegex = /^(\d+(?:[.,]\d+)?)\s*(?:kg|kilo)?\s+(.+?)(?:\s*\(\s*([\d.,]+)[\s\u00a0]*[đ₫VND]?\s*\))?(?:\s*[-–—:]\s*(.*))?$/i;
    const oldMatch = part.match(oldFormatRegex);
    if (oldMatch) {
      const tokenAfter = oldMatch[2].trim();
      const startsWithNumber = /^\d+/.test(tokenAfter);
      if (!startsWithNumber) {
        const qty = parseFloat(oldMatch[1].replace(',', '.'));
        let rawProdName = oldMatch[2].trim();
        const amtStr = oldMatch[3] ? oldMatch[3].replace(/\./g, '').replace(/,/g, '') : null;
        let amt = amtStr ? parseFloat(amtStr) : 0;
        if (!amt) {
          const innerParen = part.match(/\(\s*([\d.,]+)[\s\u00a0]*[đ₫kKVND]?\s*\)/i);
          if (innerParen) amt = parseFloat(innerParen[1].replace(/\./g, '').replace(/,/g, ''));
        }
        if (!amt && parts.length === 1) amt = defaultAmount;
        const price = (qty && qty > 0 && amt > 0) ? Math.round(amt / qty) : null;
        results.push({
          type: 'RETURN',
          name: formatReturnItemName(rawProdName, isPartImport),
          quantity: !isNaN(qty) ? qty : null,
          price: price,
          amount: amt,
        });
        continue;
      }
    }

    const nameQtyMatch = part.match(/^([a-zA-ZÀ-ỹ\s()+-]+?)\s+(\d+(?:[.,]\d+)?)\s*(?:kg|kilo)\s*(\([a-zA-Z0-9\s]+\))?$/i);
    if (nameQtyMatch) {
      let rawProdName = nameQtyMatch[1].trim();
      if (nameQtyMatch[3]) rawProdName += ` ${nameQtyMatch[3].trim()}`;
      const qty = parseFloat(nameQtyMatch[2].replace(',', '.'));
      let amt = 0;
      const innerParen = part.match(/\(\s*([\d.,]+)[\s\u00a0]*[đ₫kKVND]?\s*\)/i);
      if (innerParen) amt = parseFloat(innerParen[1].replace(/\./g, '').replace(/,/g, ''));
      if (!amt && parts.length === 1) amt = defaultAmount;
      const price = (qty && qty > 0 && amt > 0) ? Math.round(amt / qty) : null;
      results.push({
        type: 'RETURN',
        name: formatReturnItemName(rawProdName, isPartImport),
        quantity: !isNaN(qty) ? qty : null,
        price: price,
        amount: amt || 0,
      });
      continue;
    }

    results.push({
      type: 'RETURN',
      name: formatReturnItemName(part, isPartImport),
      quantity: null,
      price: null,
      amount: parts.length === 1 ? defaultAmount : 0,
    });
  }

  return results.length > 0 ? results : [{
    type: 'RETURN',
    name: isNoteLevelImport ? 'NHẬP HÀNG' : 'TRẢ HÀNG',
    quantity: null,
    price: null,
    amount: defaultAmount,
  }];
};

// Helper tính toán tổng hợp sản lượng thịt theo từng loại trong tháng
const computeMeatVolumeSummary = (filteredTrans, filteredPays) => {
  const map = {};
  let grandTotalQty = 0;

  (filteredTrans || []).forEach(t => {
    if (t.items && t.items.length > 0) {
      t.items.forEach(item => {
        const rawName = (item.product?.name || item.productName || 'Thịt').trim();
        const isQuick = rawName === 'Tiền hàng' || rawName.toLowerCase().startsWith('tiền') || t.note === 'Ghi nợ nhanh';
        if (isQuick) return;

        const q = parseFloat(item.quantity);
        if (!isNaN(q) && q > 0) {
          const upperName = rawName.toUpperCase();
          if (!map[upperName]) {
            map[upperName] = {
              name: upperName,
              quantity: 0,
              unit: item.product?.unit || 'kg',
            };
          }
          map[upperName].quantity += q;
          grandTotalQty += q;
        }
      });
    }
  });

  (filteredPays || []).forEach(p => {
    const isReturn = isReturnPayment(p);

    if (isReturn) {
      const returnItems = parseReturnItems(p.note, parseFloat(p.amount || 0));
      returnItems.forEach(ritem => {
        if (ritem.quantity && ritem.quantity > 0) {
          const cleanReturnName = ritem.name.replace(/\[TRẢ HÀNG\]|\[TRẢ LẠI HÀNG\]|\[NHẬP HÀNG\]/gi, '').trim().toUpperCase();
          for (const key of Object.keys(map)) {
            if (key.includes(cleanReturnName) || cleanReturnName.includes(key)) {
              map[key].quantity = Math.max(0, map[key].quantity - ritem.quantity);
              grandTotalQty = Math.max(0, grandTotalQty - ritem.quantity);
              break;
            }
          }
        }
      });
    }
  });

  const items = Object.values(map)
    .filter(it => it.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity);

  return {
    items,
    grandTotalQty: Math.round(grandTotalQty * 100) / 100,
  };
};

// Helper định dạng văn bản tổng hợp sản lượng thịt để gửi Zalo / SMS
const buildMonthlyMeatSummaryText = (summary, custName, monthStr) => {
  if (!summary || !summary.items || summary.items.length === 0) return '';
  const lines = [
    `🥩 TỔNG HỢP SẢN LƯỢNG THỊT THÁNG ${monthStr || ''}${custName ? ` - ${custName}` : ''} (không tính tiền hàng):`,
  ];
  summary.items.forEach(it => {
    const qtyFormatted = Number(it.quantity.toFixed(2)).toLocaleString('vi-VN');
    lines.push(`• ${it.name}: ${qtyFormatted} ${it.unit}`);
  });
  const totalFormatted = Number(summary.grandTotalQty.toFixed(2)).toLocaleString('vi-VN');
  lines.push(`➡️ TỔNG CỘNG: ${totalFormatted} kg thịt`);
  return lines.join('\n');
};

// ─── Component con: Thu nợ theo cụm ngày trong từng tháng ───
const MonthRangeDebtPaySection = ({
  month,
  onPay,
  detailModalRef,
  customerName,
  formatCurrency,
  formatAmountShort,
  formatShortDate,
}) => {
  const [mm, yyyy] = month.monthKey.split('/');
  const lastDayNum = new Date(Number(yyyy), Number(mm), 0).getDate();
  const minDateStr = `01/${mm}/${yyyy}`;
  const maxDateStr = `${String(lastDayNum).padStart(2, '0')}/${mm}/${yyyy}`;

  const [fromDate, setFromDate] = useState(() => `01/${month.monthKey}`);
  const [toDate, setToDate] = useState(() => {
    const today = new Date();
    if (today.getMonth() === Number(mm) - 1 && today.getFullYear() === Number(yyyy)) {
      return getTodayDisplay();
    }
    return maxDateStr;
  });
  const [isExpanded, setIsExpanded] = useState(false);

  // Danh sách các ngày nợ trong tháng này
  const monthDebtDays = useMemo(() => {
    return (month.days || []).filter((g) => (g.remainingDebt || 0) > 0);
  }, [month.days]);

  // Chọn nhanh toàn bộ ngày nợ trong tháng
  const handleSelectAllMonthDebtDays = () => {
    if (monthDebtDays.length === 0) {
      showGlobalToast(`Tháng ${month.monthKey} không còn ngày nào nợ!`, 'info');
      return;
    }
    const sorted = [...monthDebtDays].sort((a, b) => new Date(a.date) - new Date(b.date));
    const oldest = sorted[0];
    const newest = sorted[sorted.length - 1];
    setFromDate(formatDateToDisplay(oldest.date));
    setToDate(formatDateToDisplay(newest.date));
    showGlobalToast(`Đã chọn ${monthDebtDays.length} ngày còn nợ của Tháng ${month.monthKey}!`, 'success');
  };

  // Tính toán số liệu của cụm ngày đã chọn trong tháng
  const rangeData = useMemo(() => {
    if (!fromDate || !toDate) {
      return { matchedDays: [], debtDays: [], totalDebt: 0, remainingDebt: 0, totalReturn: 0, totalPaid: 0, validationError: 'Vui lòng chọn Từ ngày và Đến ngày.' };
    }
    const fromParts = fromDate.split('/').map(Number);
    const toParts = toDate.split('/').map(Number);
    if (fromParts.length !== 3 || toParts.length !== 3 || isNaN(fromParts[0]) || isNaN(toParts[0])) {
      return { matchedDays: [], debtDays: [], totalDebt: 0, remainingDebt: 0, totalReturn: 0, totalPaid: 0, validationError: 'Định dạng ngày không hợp lệ.' };
    }

    const fromDateObj = new Date(fromParts[2], fromParts[1] - 1, fromParts[0], 0, 0, 0, 0);
    const toDateObj = new Date(toParts[2], toParts[1] - 1, toParts[0], 23, 59, 59, 999);

    if (fromDateObj.getTime() > toDateObj.getTime()) {
      return { matchedDays: [], debtDays: [], totalDebt: 0, remainingDebt: 0, totalReturn: 0, totalPaid: 0, validationError: 'Từ ngày không thể sau Đến ngày!' };
    }

    const matchedDays = (month.days || [])
      .filter((g) => {
        const gDate = new Date(g.date);
        return gDate >= fromDateObj && gDate <= toDateObj;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const debtDays = matchedDays.filter((g) => (g.remainingDebt || 0) > 0);
    const totalDebt = matchedDays.reduce((sum, g) => sum + (g.totalDebt || 0), 0);
    const remainingDebt = matchedDays.reduce((sum, g) => sum + (g.remainingDebt || 0), 0);
    const totalReturn = matchedDays.reduce((sum, g) => sum + (g.totalReturn || 0), 0);
    const totalDeducted = Math.max(0, totalDebt - remainingDebt);
    const totalPaid = Math.max(0, totalDeducted - totalReturn);

    return {
      matchedDays,
      debtDays,
      totalDebt,
      remainingDebt,
      totalReturn,
      totalPaid,
      validationError: null,
    };
  }, [fromDate, toDate, month.days]);

  const handlePayRange = () => {
    if (rangeData.validationError) {
      showGlobalToast(rangeData.validationError, 'error');
      return;
    }
    if (rangeData.matchedDays.length === 0) {
      showGlobalToast(`Không có đơn nợ nào từ ngày ${fromDate} đến ${toDate}!`, 'warning');
      return;
    }
    if (rangeData.debtDays.length === 0 || rangeData.remainingDebt <= 0) {
      showGlobalToast(`Tất cả các ngày từ ${fromDate} đến ${toDate} đều đã thanh toán hết nợ!`, 'info');
      return;
    }
    onPay(
      rangeData.remainingDebt,
      `Thanh toán nợ Tháng ${month.monthKey} từ ngày ${fromDate} đến ngày ${toDate} (${rangeData.debtDays.length} ngày nợ)`
    );
  };

  return (
    <View style={styles.monthRangeSection}>
      <TouchableOpacity
        style={styles.monthRangeToggleBtn}
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setIsExpanded(!isExpanded);
        }}
        activeOpacity={0.75}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <Text style={{ fontSize: 13 }}>📅</Text>
          <Text style={styles.monthRangeToggleTitle}>
            Thu nợ theo cụm ngày trong {month.monthLabel}
          </Text>
        </View>
        <Text style={styles.monthRangeToggleArrow}>
          {isExpanded ? '▲ Thu gọn' : '▼ Chọn khoảng ngày'}
        </Text>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.monthRangeContent}>
          {/* Hai ô chọn ngày giới hạn trong tháng */}
          <View style={styles.rangePickersRow}>
            <View style={styles.rangePickerCol}>
              <Text style={styles.rangePickerLabel}>Từ ngày:</Text>
              <DatePickerInput
                value={fromDate}
                onChange={setFromDate}
                minDate={minDateStr}
                maxDate={maxDateStr}
                compact={true}
                showIcon={true}
              />
            </View>
            <Text style={styles.rangeToArrowText}>➜</Text>
            <View style={styles.rangePickerCol}>
              <Text style={styles.rangePickerLabel}>Đến ngày:</Text>
              <DatePickerInput
                value={toDate}
                onChange={setToDate}
                minDate={minDateStr}
                maxDate={maxDateStr}
                compact={true}
                showIcon={true}
              />
            </View>
          </View>

          {/* Phím chọn nhanh */}
          <View style={styles.quickChipsWrap}>
            {monthDebtDays.length > 0 && (
              <TouchableOpacity
                style={[styles.quickChip, styles.quickChipDebtHighlight]}
                onPress={handleSelectAllMonthDebtDays}
                activeOpacity={0.7}
              >
                <Text style={styles.quickChipDebtHighlightText}>
                  ⚡ {monthDebtDays.length} ngày nợ
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.quickChip}
              onPress={() => {
                setFromDate(`01/${mm}/${yyyy}`);
                setToDate(`15/${mm}/${yyyy}`);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.quickChipText}>1 - 15</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickChip}
              onPress={() => {
                setFromDate(`16/${mm}/${yyyy}`);
                setToDate(maxDateStr);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.quickChipText}>16 - Hết tháng</Text>
            </TouchableOpacity>
          </View>

          {/* Kết quả xác thực & tính toán của cụm ngày trong tháng */}
          <View style={styles.rangeResultBox}>
            {rangeData.validationError ? (
              <Text style={styles.rangeValidationErrorText}>
                ⚠️ {rangeData.validationError}
              </Text>
            ) : rangeData.matchedDays.length === 0 ? (
              <Text style={styles.rangeEmptyHint}>
                🔍 Không có đơn nợ nào từ ngày {fromDate} đến {toDate}.
              </Text>
            ) : (
              <>
                <View style={styles.rangeCompactStatsRow}>
                  <View style={styles.rangeCompactStatCol}>
                    <Text style={styles.rangeCompactStatLabel}>Mua nợ ({rangeData.matchedDays.length}n):</Text>
                    <Text style={styles.rangeCompactStatVal}>{formatCurrency(rangeData.totalDebt)}</Text>
                  </View>
                  <View style={styles.rangeCompactDivider} />
                  {rangeData.totalReturn > 0 && (
                    <>
                      <View style={styles.rangeCompactStatCol}>
                        <Text style={styles.rangeCompactStatLabel}>Trả hàng:</Text>
                        <Text style={[styles.rangeCompactStatVal, { color: '#D97706' }]}>
                          {formatCurrency(rangeData.totalReturn)}
                        </Text>
                      </View>
                      <View style={styles.rangeCompactDivider} />
                    </>
                  )}
                  <View style={styles.rangeCompactStatCol}>
                    <Text style={styles.rangeCompactStatLabel}>Đã trả:</Text>
                    <Text style={[styles.rangeCompactStatVal, { color: '#059669' }]}>
                      {formatCurrency(rangeData.totalPaid)}
                    </Text>
                  </View>
                  <View style={styles.rangeCompactDivider} />
                  <View style={styles.rangeCompactStatCol}>
                    <Text style={styles.rangeCompactStatLabelBold}>Còn nợ ({rangeData.debtDays.length}n):</Text>
                    <Text
                      style={[
                        styles.rangeCompactStatValBold,
                        rangeData.remainingDebt > 0 ? styles.textDebt : styles.textSuccessBold,
                      ]}
                    >
                      {rangeData.remainingDebt > 0 ? formatCurrency(rangeData.remainingDebt) : '0 đ'}
                    </Text>
                  </View>
                </View>

                {rangeData.debtDays.length > 0 && (
                  <View style={styles.rangeCompactChipsWrap}>
                    <Text style={styles.rangeCompactChipsTitle}>
                      {rangeData.debtDays.length} ngày nợ:
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.rangeCompactChipsScroll}
                    >
                      {rangeData.debtDays.map((g) => (
                        <TouchableOpacity
                          key={g.dateKey}
                          style={styles.rangeDayChipCompact}
                          onPress={() => detailModalRef?.current?.open({ ...g, customerName })}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.rangeDayChipDateCompact}>{formatShortDate(g.date)}</Text>
                          <Text style={styles.rangeDayChipAmtCompact}>{formatAmountShort(g.remainingDebt)}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {rangeData.remainingDebt > 0 ? (
                  <TouchableOpacity
                    style={styles.rangePayActionBtnCompact}
                    onPress={handlePayRange}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.rangePayActionBtnTextCompact}>
                      💵 THU NỢ CỤM NGÀY ({formatCurrency(rangeData.remainingDebt)})
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.rangePaidOffBannerCompact}>
                    <Text style={styles.rangePaidOffTextCompact}>🎉 Các ngày trong khoảng này đã hết nợ!</Text>
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const CustomerDebtHistoryModal = forwardRef(({
  paymentModalRef,
  detailModalRef,
  debtModalRef,
  onRefresh,
}, ref) => {
  const [visible, setVisible] = useState(false);
  const [customer, setCustomer] = useState(null);

  // Khóa khách hàng khi mở xem lịch sử nợ
  useResourceLock('CUSTOMER', customer?.id, visible, () => setVisible(false));
  const [loading, setLoading] = useState(false);
  const [monthGroups, setMonthGroups] = useState([]);
  const [allDaysList, setAllDaysList] = useState([]); // Danh sách toàn bộ các nhóm ngày nợ
  const [gridWidth, setGridWidth] = useState(0);
  const [expandedMonth, setExpandedMonth] = useState(null); // Lưu trữ khóa của tháng đang mở rộng
  const [payInputAmount, setPayInputAmount] = useState(0); // Số tiền trả nợ mô phỏng cho tổng các tháng
  const [copiedMonthKey, setCopiedMonthKey] = useState(null);

  // Xử lý sao chép văn bản tóm tắt sản lượng thịt theo tháng
  const handleCopyMeatSummary = async (month) => {
    if (!month?.meatSummary || !month.meatSummary.items?.length) return;
    const text = buildMonthlyMeatSummaryText(month.meatSummary, customer?.name, month.monthKey);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedMonthKey(month.monthKey);
      showGlobalToast(`Đã sao chép tổng hợp sản lượng thịt Tháng ${month.monthKey}!`, 'success');
      setTimeout(() => setCopiedMonthKey(null), 2500);
    } catch (err) {
      console.error('Lỗi khi sao chép tóm tắt thịt:', err);
      showGlobalToast('Không thể sao chép tóm tắt thịt.', 'error');
    }
  };

  // 1. Phơi bày các hàm điều khiển (open, close, refresh) ra bên ngoài
  useImperativeHandle(ref, () => ({
    open: (customerData) => {
      setCustomer(customerData);
      setVisible(true);
      setExpandedMonth(null);
      setMonthGroups([]);
      setAllDaysList([]);
      setPayInputAmount(0);
      fetchDebtHistory(customerData.id);
    },
    close: () => {
      setVisible(false);
    },
    refresh: () => {
      if (customer?.id) {
        fetchDebtHistory(customer.id);
      }
    },
  }));

  // Định dạng hiển thị tiền VNĐ
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount).replace('₫', 'đ');
  };

  // Tiền rút gọn hiển thị trên các ô ngày (Ví dụ: 150.000 -> 150k, 1.200.000 -> 1.2tr)
  const formatAmountShort = (amount) => {
    if (amount >= 1_000_000) {
      const v = (amount / 1_000_000).toFixed(1).replace(/\.0$/, '');
      return `${v}tr`;
    }
    return `${Math.round(amount / 1_000)}k`;
  };

  // Định dạng ngày ngắn (Ví dụ: 2026-06-23 -> 23/06)
  const formatShortDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  };

  // Lấy thứ trong tuần viết tắt tiếng Việt
  const getWeekday = (dateStr) => {
    return ['C.Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][new Date(dateStr).getDay()];
  };

  // Helper chuyển đổi chuỗi ngày ISO thành dạng khóa "DD/MM/YYYY"
  const toDateKey = (dateStr) => {
    const d = new Date(dateStr);
    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  // 2. Tải lịch sử giao dịch và thanh toán, tính toán nợ theo thuật toán FIFO
  const fetchDebtHistory = async (customerId) => {
    setLoading(true);
    try {
      const [transRes, payRes] = await Promise.all([
        api.get(`/transactions?customerId=${customerId}`),
        api.get(`/payments?customerId=${customerId}`)
      ]);

      const transactions = transRes.data?.data || [];
      const payments = payRes.data?.data || [];

      // Phân bổ nợ - trả theo chuẩn FIFO từ utility dùng chung
      const {
        remainingDebtMap,
        remainingPayMap,
        transAllocations,
        payAllocations,
      } = allocateDebtFIFO(transactions, payments);

      const map = new Map();

      // 1. Duyệt qua tất cả giao dịch (nợ) để tạo các nhóm ngày nợ
      transactions.forEach((t) => {
        const key = toDateKey(t.date);
        if (!map.has(key)) {
          map.set(key, {
            dateKey: key,
            date: t.date,
            transactions: [],
            payments: [],
            totalDebt: 0,
            remainingDebt: 0,
            totalPayment: 0,
            totalReturn: 0,
          });
        }
        const g = map.get(key);
        const originalAmt = parseFloat(t.totalAmount);
        const remainingAmt = remainingDebtMap[t.id] !== undefined ? remainingDebtMap[t.id] : originalAmt;

        g.transactions.push({
          id: t.id,
          customerId: t.customerId || customerId,
          totalAmount: t.totalAmount || originalAmt,
          profitPercent: t.profitPercent,
          source: t.source,
          type: 'debt',
          date: t.date,
          amount: originalAmt,
          remainingAmount: remainingAmt,
          note: t.note,
          items: t.items || [],
          invoices: t.invoices || [], // Danh sách ảnh hóa đơn đính kèm đơn nợ
          allocations: transAllocations[t.id] || [], // Truyền thông tin phân bổ thanh toán
        });
        if (t.invoices && t.invoices.length > 0) {
          g.invoices = g.invoices || [];
          g.invoices.push(...t.invoices);
        }
        g.totalDebt += originalAmt;
        g.remainingDebt += remainingAmt;
      });

      // 2. Phân bổ các lượt thanh toán (payment) vào các nhóm ngày của hóa đơn nợ được khấu trừ tương ứng
      payments.forEach((p) => {
        const allocations = payAllocations[p.id] || [];

        if (allocations.length > 0) {
          // Lượt thanh toán này đã được phân bổ để khấu trừ nợ
          // Gộp nó vào các ngày nợ tương ứng
          allocations.forEach((alloc) => {
            const transDateKey = toDateKey(alloc.date);
            if (map.has(transDateKey)) {
              const g = map.get(transDateKey);
              const isReturn = isReturnPayment(p);
              // Kiểm tra xem lượt trả này đã được thêm vào ngày nợ này chưa (tránh nhân đôi)
              if (!g.payments.some((existingPay) => existingPay.id === p.id)) {
                g.payments.push({
                  id: p.id,
                  type: 'payment',
                  date: p.paidAt,
                  paidAt: p.paidAt,
                  amount: alloc.amount, // Số tiền được phân bổ cho ngày nợ này
                  note: p.note,
                  isReturn,
                  invoices: p.invoices || [],
                  allocations: [alloc],
                });
                if (p.invoices && p.invoices.length > 0) {
                  g.invoices = g.invoices || [];
                  g.invoices.push(...p.invoices);
                }
                if (isReturn) {
                  g.totalReturn = (g.totalReturn || 0) + alloc.amount;
                } else {
                  g.totalPayment += alloc.amount;
                }
              } else {
                const existingPay = g.payments.find((existingPay) => existingPay.id === p.id);
                existingPay.amount += alloc.amount;
                existingPay.allocations.push(alloc);
                if (p.invoices && p.invoices.length > 0) {
                  existingPay.invoices = existingPay.invoices || [];
                  p.invoices.forEach((inv) => {
                    if (!existingPay.invoices.some((i) => i.imageUrl === inv.imageUrl)) {
                      existingPay.invoices.push(inv);
                    }
                  });
                  g.invoices = g.invoices || [];
                  p.invoices.forEach((inv) => {
                    if (!g.invoices.some((i) => i.imageUrl === inv.imageUrl)) {
                      g.invoices.push(inv);
                    }
                  });
                }
                if (isReturn) {
                  g.totalReturn = (g.totalReturn || 0) + alloc.amount;
                } else {
                  g.totalPayment += alloc.amount;
                }
              }
            }
          });
        }

        // 3. Nếu payment còn dư chưa phân bổ hết (tiền trả trước / dư)
        // Tạo nhóm ngày riêng cho ngày nạp tiền đó
        const prepayAmt = remainingPayMap[p.id];
        if (prepayAmt > 0) {
          const isReturn = isReturnPayment(p);
          const payDateKey = toDateKey(p.paidAt);
          if (!map.has(payDateKey)) {
            map.set(payDateKey, {
              dateKey: payDateKey,
              date: p.paidAt,
              transactions: [],
              payments: [],
              totalDebt: 0,
              remainingDebt: 0,
              totalPayment: 0,
              totalReturn: 0,
            });
          }
          const g = map.get(payDateKey);
          g.payments.push({
            id: p.id,
            type: 'payment',
            date: p.paidAt,
            paidAt: p.paidAt,
            amount: prepayAmt,
            note: p.note || (isReturn ? 'Trả lại hàng (dư)' : 'Trả trước (dư)'),
            isReturn,
            invoices: p.invoices || [],
            allocations: [],
          });
          if (p.invoices && p.invoices.length > 0) {
            g.invoices = g.invoices || [];
            g.invoices.push(...p.invoices);
          }
          if (isReturn) {
            g.totalReturn = (g.totalReturn || 0) + prepayAmt;
          } else {
            g.totalPayment += prepayAmt;
          }
        }
      });

      const dayGroupsVal = Array.from(map.values()).sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      );

      const groups = {};
      dayGroupsVal.forEach((group) => {
        const d = new Date(group.date);
        const mm = (d.getMonth() + 1).toString().padStart(2, '0');
        const yyyy = d.getFullYear();
        const monthKey = `${mm}/${yyyy}`;

        if (!groups[monthKey]) {
          groups[monthKey] = {
            monthKey,
            monthLabel: `Tháng ${mm}/${yyyy}`,
            days: [],
            totalDebt: 0,
            remainingDebt: 0,
            totalPayment: 0,
            totalReturn: 0,
          };
        }
        groups[monthKey].days.push(group);
        groups[monthKey].totalDebt += group.totalDebt;
        groups[monthKey].remainingDebt += group.remainingDebt;
        groups[monthKey].totalReturn += (group.totalReturn || 0);
      });

      Object.values(groups).forEach((m) => {
        const totalDeducted = Math.max(0, m.totalDebt - m.remainingDebt);
        m.totalReturn = groups[m.monthKey].totalReturn || 0;
        m.totalPayment = Math.max(0, totalDeducted - m.totalReturn);

        // Gom toàn bộ transactions và payments của tháng để tính tổng sản lượng thịt
        const allTransInMonth = [];
        const allPaysInMonth = [];
        (m.days || []).forEach((dayGroup) => {
          if (dayGroup.transactions && dayGroup.transactions.length > 0) {
            allTransInMonth.push(...dayGroup.transactions);
          }
          if (dayGroup.payments && dayGroup.payments.length > 0) {
            allPaysInMonth.push(...dayGroup.payments);
          }
        });
        m.meatSummary = computeMeatVolumeSummary(allTransInMonth, allPaysInMonth);
      });

      const sortedMonths = Object.values(groups).sort((a, b) => {
        const [aM, aY] = a.monthKey.split('/').map(Number);
        const [bM, bY] = b.monthKey.split('/').map(Number);
        return bY - aY || bM - aM;
      });

      setMonthGroups(sortedMonths);
      setAllDaysList(dayGroupsVal);

      // Không tự động mở rộng tháng đầu tiên khi hiển thị chi tiết nợ
    } catch (err) {
      console.error('Lỗi tải lịch sử công nợ:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    if (customer) {
      fetchDebtHistory(customer.id);
    }
    if (onRefresh) {
      onRefresh();
    }
  };

  // 3. Tính toán kích cỡ ô vuông của ngày cho khớp 4 cột
  const NUM_COLS = 4;
  const TILE_GAP = 8;
  const tileSize = Math.max(0, Math.floor((gridWidth - TILE_GAP * (NUM_COLS - 1)) / NUM_COLS));

  // 4. Tổng nợ còn lại của tất cả các tháng
  const totalAllRemainingDebt = monthGroups.reduce((sum, m) => sum + (m.remainingDebt || 0), 0);

  // 5. Phân bổ số tiền trả nợ mô phỏng: trừ dần từ tháng cũ nhất có nợ đến tháng mới nhất (FIFO)
  const getSimulatedAllocation = (amount) => {
    if (!amount || amount <= 0) return { monthAllocMap: {}, remainingSurplus: 0, totalAllocated: 0 };

    // Sắp xếp các tháng theo thứ tự thời gian tăng dần (cũ nhất trước)
    const chronologicalMonths = [...monthGroups].sort((a, b) => {
      const [aM, aY] = a.monthKey.split('/').map(Number);
      const [bM, bY] = b.monthKey.split('/').map(Number);
      return aY - bY || aM - bM;
    });

    let remainingToAllocate = amount;
    const monthAllocMap = {}; // monthKey -> { allocated, originalDebt, newRemaining, isPaidOff }

    for (const month of chronologicalMonths) {
      const debt = month.remainingDebt || 0;
      if (debt <= 0) {
        monthAllocMap[month.monthKey] = {
          allocated: 0,
          originalDebt: 0,
          newRemaining: 0,
          isPaidOff: true,
        };
        continue;
      }

      if (remainingToAllocate <= 0) {
        monthAllocMap[month.monthKey] = {
          allocated: 0,
          originalDebt: debt,
          newRemaining: debt,
          isPaidOff: false,
        };
        continue;
      }

      const alloc = Math.min(debt, remainingToAllocate);
      const newRemaining = Math.max(0, debt - alloc);
      remainingToAllocate -= alloc;

      monthAllocMap[month.monthKey] = {
        allocated: alloc,
        originalDebt: debt,
        newRemaining,
        isPaidOff: newRemaining === 0,
      };
    }

    const totalAllocated = amount - remainingToAllocate;
    return {
      monthAllocMap,
      remainingSurplus: remainingToAllocate,
      totalAllocated,
    };
  };

  const simAllocation = getSimulatedAllocation(payInputAmount);



  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        <View style={styles.dragBar} />
        <Text style={styles.modalTitle}>📊 LỊCH SỬ NỢ CHI TIẾT</Text>

        {customer && (
          <View style={styles.compactHeaderCard}>
            <View style={styles.compactCustomerCol}>
              <Text style={styles.compactCustomerName} numberOfLines={1}>{customer.name}</Text>
              {customer.phone ? (
                <Text style={styles.compactCustomerPhone}>📞 {customer.phone}</Text>
              ) : null}
            </View>
            <View style={styles.compactDebtCol}>
              <Text style={styles.compactDebtLabel}>Tổng nợ:</Text>
              <Text style={styles.compactDebtValue}>
                {formatCurrency(totalAllRemainingDebt)}
              </Text>
            </View>
          </View>
        )}

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Đang tính toán lịch sử nợ...</Text>
          </View>
        ) : monthGroups.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>📋 Khách hàng này chưa phát sinh giao dịch nào.</Text>
          </View>
        ) : (
          <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
            {/* Thanh nhập trả nợ nhanh theo số tiền (Luôn hiển thị sẵn sàng) */}
            <View style={styles.quickPayAmountCard}>
              <View style={styles.quickPayHeaderRow}>
                <View style={styles.quickPayTitleGroup}>
                  <Text style={styles.quickPayIcon}>⚡</Text>
                  <Text style={styles.quickPayTitle}>Thu nợ theo số tiền:</Text>
                </View>
                {totalAllRemainingDebt > 0 && (
                  <Text style={styles.quickPayTotalDebtText}>
                    Tổng nợ: <Text style={styles.quickPayTotalDebtBold}>{formatCurrency(totalAllRemainingDebt)}</Text>
                  </Text>
                )}
              </View>

              <View style={styles.quickPayInputRow}>
                <View style={{ flex: 1 }}>
                  <MoneyInput
                    value={payInputAmount}
                    onChangeValue={(val) => setPayInputAmount(val)}
                    placeholder="Nhập số tiền trả (VD: 10.000.000)..."
                    style={styles.paymentSimMoneyInput}
                    inputStyle={styles.paymentSimMoneyTextInput}
                  />
                </View>
                {payInputAmount > 0 && (
                  <TouchableOpacity
                    style={styles.paymentSimClearBtn}
                    onPress={() => setPayInputAmount(0)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.paymentSimClearText}>✕ Xóa</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Phím gợi ý chọn nhanh */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickChipsScrollContainer}
                style={styles.quickChipsScrollView}
              >
                <TouchableOpacity
                  style={styles.quickChip}
                  onPress={() => setPayInputAmount(10_000_000)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickChipText}>10tr</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickChip}
                  onPress={() => setPayInputAmount(20_000_000)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickChipText}>20tr</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickChip}
                  onPress={() => setPayInputAmount(50_000_000)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickChipText}>50tr</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickChip}
                  onPress={() => setPayInputAmount(100_000_000)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickChipText}>100tr</Text>
                </TouchableOpacity>
                {totalAllRemainingDebt > 0 && (
                  <TouchableOpacity
                    style={[styles.quickChip, styles.quickChipFull]}
                    onPress={() => setPayInputAmount(totalAllRemainingDebt)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.quickChipText, styles.quickChipFullText]}>
                      Trả hết ({formatAmountShort(totalAllRemainingDebt)})
                    </Text>
                  </TouchableOpacity>
                )}
              </ScrollView>

              {/* Kết quả phân bổ khi nhập số tiền > 0 */}
              {payInputAmount > 0 && (
                <View style={styles.simResultBanner}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.simResultText}>
                      {simAllocation.remainingSurplus > 0 ? (
                        <>
                          Đã trừ hết <Text style={styles.boldText}>{formatCurrency(simAllocation.totalAllocated)}</Text> nợ. Thừa: <Text style={[styles.boldText, { color: '#059669' }]}>+{formatCurrency(simAllocation.remainingSurplus)}</Text> (trả trước)
                        </>
                      ) : (
                        <>
                          Đã trừ: <Text style={[styles.boldText, { color: '#059669' }]}>{formatCurrency(simAllocation.totalAllocated)}</Text> (Còn nợ: <Text style={[styles.boldText, { color: '#DC2626' }]}>{formatCurrency(Math.max(0, totalAllRemainingDebt - payInputAmount))}</Text>)
                        </>
                      )}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.simSubmitBtn}
                    onPress={() => {
                      setVisible(false);
                      paymentModalRef?.current?.open(payInputAmount);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.simSubmitBtnText}>Thu tiền ngay 💵</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <Text style={styles.helperText}>• Bấm vào từng tháng để xem chi tiết</Text>
            {monthGroups.map((month) => {
              const isExpanded = expandedMonth === month.monthKey;
              const hasDebt = month.remainingDebt > 0;
              const allocInfo = simAllocation.monthAllocMap[month.monthKey];
              const isSimActive = payInputAmount > 0 && allocInfo;
              const isDeducted = isSimActive && allocInfo.allocated > 0;
              const isSimPaidOff = isSimActive && allocInfo.isPaidOff && hasDebt;

              return (
                <View key={month.monthKey} style={styles.monthSection}>
                  {/* Tiêu đề tháng dạng Accordion */}
                  <TouchableOpacity
                    style={[
                      styles.monthHeader,
                      isExpanded && styles.monthHeaderExpanded,
                      hasDebt ? styles.monthHeaderDebt : styles.monthHeaderNoDebt,
                      isSimPaidOff && styles.monthHeaderSimPaidOff,
                      isDeducted && !isSimPaidOff && styles.monthHeaderSimDeducted,
                    ]}
                    onPress={() => {
                      // Kích hoạt hiệu ứng mở rộng/thu gọn mượt mà
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setExpandedMonth(isExpanded ? null : month.monthKey);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.monthHeaderLeft}>
                      <Text style={styles.chevronIcon}>{isExpanded ? '▼' : '▶'}</Text>
                      <Text style={styles.monthTitleText}>{month.monthLabel}</Text>
                      {month.meatSummary && month.meatSummary.grandTotalQty > 0 && (
                        <View style={styles.monthMeatBadge}>
                          <Text style={styles.monthMeatBadgeText}>
                            🥩 {Number(month.meatSummary.grandTotalQty.toFixed(1)).toLocaleString('vi-VN')} kg
                          </Text>
                        </View>
                      )}
                    </View>

                    {isSimActive && hasDebt ? (
                      <View style={styles.monthStatusSimWrap}>
                        <View style={styles.monthStatusSimRow}>
                          <Text style={styles.monthOriginalDebtStriked}>
                            {formatAmountShort(month.remainingDebt)}
                          </Text>
                          <Text style={[styles.monthNewDebtText, isSimPaidOff ? styles.textSuccessBold : styles.textDebt]}>
                            ➜ {isSimPaidOff ? 'Hết nợ ✅' : `Còn: ${formatAmountShort(allocInfo.newRemaining)}`}
                          </Text>
                        </View>
                        {allocInfo.allocated > 0 && (
                          <Text style={styles.monthDeductBadge}>
                            (-{formatAmountShort(allocInfo.allocated)})
                          </Text>
                        )}
                      </View>
                    ) : (
                      <Text style={[styles.monthDebtStatus, hasDebt ? styles.textDebt : styles.textNoDebt]}>
                        {hasDebt ? `Còn nợ: ${formatAmountShort(month.remainingDebt)}` : 'Hết nợ ✅'}
                      </Text>
                    )}
                  </TouchableOpacity>

                  {/* Phần hiển thị chi tiết khi mở rộng tháng */}
                  {isExpanded && (
                    <View style={styles.expandedContent}>
                      {/* Bảng tổng hợp tháng */}
                      <View style={styles.summaryCard}>
                        <View style={styles.summaryRow}>
                          <Text style={styles.summaryLabel}>Mua nợ:</Text>
                          <Text style={styles.summaryValue}>{formatCurrency(month.totalDebt)}</Text>
                        </View>
                        <View style={styles.summaryRow}>
                          <Text style={styles.summaryLabel}>Trả hàng:</Text>
                          <Text style={[styles.summaryValue, { color: '#D97706', fontWeight: '600' }]}>
                            {formatCurrency(month.totalReturn || 0)}
                          </Text>
                        </View>
                        <View style={styles.summaryRow}>
                          <Text style={styles.summaryLabel}>Đã trả:</Text>
                          <Text style={[styles.summaryValue, { color: COLORS.primaryDark }]}>
                            {formatCurrency(month.totalPayment)}
                          </Text>
                        </View>
                        <View style={[styles.summaryRow, styles.debtRowBorder]}>
                          <Text style={styles.summaryLabelBold}>Còn nợ:</Text>
                          <Text style={[styles.summaryValueBold, hasDebt ? styles.textDebt : styles.textNoDebt]}>
                            {formatCurrency(month.remainingDebt)}
                          </Text>
                        </View>

                        {/* Dự kiến trừ mô phỏng nếu đang có số tiền trả */}
                        {isDeducted && (
                          <View style={styles.simSummaryBox}>
                            <Text style={styles.simSummaryTitle}>Dự kiến trừ khi trả {formatCurrency(payInputAmount)}:</Text>
                            <View style={styles.summaryRow}>
                              <Text style={styles.summaryLabel}>Trừ vào tháng này:</Text>
                              <Text style={[styles.summaryValue, { color: '#059669', fontWeight: 'bold' }]}>
                                -{formatCurrency(allocInfo.allocated)}
                              </Text>
                            </View>
                            <View style={styles.summaryRow}>
                              <Text style={styles.summaryLabelBold}>Còn lại sau trừ:</Text>
                              <Text style={[styles.summaryValueBold, allocInfo.newRemaining > 0 ? styles.textDebt : styles.textNoDebt]}>
                                {allocInfo.newRemaining > 0 ? formatCurrency(allocInfo.newRemaining) : '0 đ (Hết nợ ✅)'}
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>

                      {/* KHỐI TỔNG HỢP SẢN LƯỢNG THỊT TRONG THÁNG (VỊ TRÍ 1) */}
                      {month.meatSummary && month.meatSummary.items && month.meatSummary.items.length > 0 && (
                        <View style={styles.meatSummaryCard}>
                          <View style={styles.meatSummaryHeader}>
                            <View style={styles.meatSummaryTitleGroup}>
                              <Text style={styles.meatSummaryHeaderIcon}>🥩</Text>
                              <Text style={styles.meatSummaryHeaderTitle}>
                                Sản lượng thịt {month.monthLabel} (không tính tiền hàng):
                              </Text>
                            </View>
                            <TouchableOpacity
                              style={[
                                styles.copyMeatTextBtn,
                                copiedMonthKey === month.monthKey && styles.copyMeatTextBtnActive
                              ]}
                              onPress={() => handleCopyMeatSummary(month)}
                              activeOpacity={0.8}
                            >
                              <Text style={styles.copyMeatTextBtnLabel}>
                                {copiedMonthKey === month.monthKey ? '✓ Đã chép' : '📋 Sao chép text'}
                              </Text>
                            </TouchableOpacity>
                          </View>

                          <View style={styles.meatSummaryTable}>
                            <View style={styles.meatSummaryGrid}>
                              {month.meatSummary.items.map((item, idx) => {
                                const isLeft = idx % 2 === 0;
                                return (
                                  <View
                                    key={idx}
                                    style={[
                                      styles.meatSummaryGridCell,
                                      isLeft ? styles.meatSummaryGridCellLeft : styles.meatSummaryGridCellRight,
                                    ]}
                                  >
                                    <Text style={styles.meatSummaryItemName} numberOfLines={1}>
                                      • {item.name}
                                    </Text>
                                    <Text style={styles.meatSummaryItemQty}>
                                      {Number(item.quantity.toFixed(2)).toLocaleString('vi-VN')} {item.unit}
                                    </Text>
                                  </View>
                                );
                              })}
                            </View>

                            <View style={styles.meatSummaryTotalRow}>
                              <Text style={styles.meatSummaryTotalLabel}>TỔNG CỘNG:</Text>
                              <Text style={styles.meatSummaryTotalValue}>
                                {Number(month.meatSummary.grandTotalQty.toFixed(2)).toLocaleString('vi-VN')} kg thịt
                              </Text>
                            </View>
                          </View>
                        </View>
                      )}

                      {/* Các nút thao tác nhanh: Ghi nợ / Thu tiền */}
                      <View style={styles.actionsRow}>
                        {hasDebt && (
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.paymentBtn]}
                            onPress={() => {
                              setVisible(false);
                              paymentModalRef?.current?.open(month.remainingDebt, month.monthKey);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.paymentBtnText}>Thu tiền 💵</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={[
                            styles.actionBtn,
                            styles.debtBtn,
                            !hasDebt && { flex: 1 }
                          ]}
                          onPress={() => {
                            setVisible(false);
                            const [mm, yyyy] = month.monthKey.split('/');
                            const targetMonth = parseInt(mm, 10) - 1;
                            const targetYear = parseInt(yyyy, 10);
                            const today = new Date();
                            let initialDate = `01/${mm}/${yyyy}`;

                            if (today.getMonth() === targetMonth && today.getFullYear() === targetYear) {
                              const dd = String(today.getDate()).padStart(2, '0');
                              initialDate = `${dd}/${mm}/${yyyy}`;
                            }

                            const firstDay = `01/${mm}/${yyyy}`;
                            const lastDayNum = new Date(targetYear, targetMonth + 1, 0).getDate();
                            const lastDay = `${String(lastDayNum).padStart(2, '0')}/${mm}/${yyyy}`;

                            debtModalRef?.current?.open({
                              initialDate,
                              disableDate: false,
                              minDate: firstDay,
                              maxDate: lastDay,
                              note: `Ghi nợ tự động trong Tháng ${mm}/${yyyy}`
                            });
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.debtBtnText}>Ghi nợ mới 🔴</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Khối thu nợ theo cụm ngày trong tháng */}
                      {hasDebt && (
                        <MonthRangeDebtPaySection
                          month={month}
                          onPay={(amount, note) => {
                            setVisible(false);
                            paymentModalRef?.current?.open(amount, month.monthKey, note);
                          }}
                          detailModalRef={detailModalRef}
                          customerName={customer?.name}
                          formatCurrency={formatCurrency}
                          formatAmountShort={formatAmountShort}
                          formatShortDate={formatShortDate}
                        />
                      )}

                      {/* Tiêu đề phần ngày */}
                      <Text style={styles.daysHeader}>Lịch sử ghi nhận theo ngày:</Text>

                      {/* Grid các ngày của tháng */}
                      <View
                        style={styles.grid}
                        onLayout={({ nativeEvent }) => setGridWidth(nativeEvent.layout.width)}
                      >
                        {month.days.map((group) => (
                          <DailyDebtTile
                            key={group.dateKey}
                            group={group}
                            tileSize={tileSize}
                            onPress={() => detailModalRef?.current?.open({ ...group, customerName: customer?.name })}
                          />
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}

        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => setVisible(false)}
        >
          <Text style={styles.closeButtonText}>ĐÓNG LẠI</Text>
        </TouchableOpacity>
      </View>
    </SmoothModal>
  );
});

export default CustomerDebtHistoryModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    height: '92%',
    maxHeight: '94%',
    display: 'flex',
    flexDirection: 'column',
  },
  dragBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  customerBox: {
    backgroundColor: COLORS.inputBg,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  customerName: {
    fontSize: 15,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  boldText: {
    fontWeight: 'bold',
    color: COLORS.text,
  },
  customerPhone: {
    fontSize: 14,
    color: COLORS.textSecondary,
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
  emptyContainer: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textLight,
    fontStyle: 'italic',
    fontSize: 14,
  },
  scrollContainer: {
    flex: 1,
    marginBottom: 10,
  },
  monthSection: {
    marginBottom: 8,
    borderRadius: 10,
    overflow: 'hidden',
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderRadius: 10,
  },
  monthHeaderExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  monthHeaderDebt: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  monthHeaderNoDebt: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  monthHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chevronIcon: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  monthTitleText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  monthDebtStatus: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  textDebt: {
    color: COLORS.dangerDark,
  },
  textNoDebt: {
    color: COLORS.primaryDark,
  },
  expandedContent: {
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    padding: 12,
    backgroundColor: COLORS.card,
  },
  summaryCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  debtRowBorder: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 4,
    paddingTop: 6,
  },
  summaryLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  summaryLabelBold: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  summaryValueBold: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  actionBtn: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  paymentBtn: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  paymentBtnText: {
    color: '#047857',
    fontWeight: 'bold',
    fontSize: 13,
  },
  debtBtn: {
    backgroundColor: '#FFF1F1',
    borderColor: '#FECACA',
  },
  debtBtnText: {
    color: COLORS.danger,
    fontWeight: 'bold',
    fontSize: 13,
  },
  daysHeader: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  grid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tile: {
    borderRadius: 10,
    borderWidth: 1.5,
    padding: 4,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    ...SHADOWS.card,
  },
  tileWeekday: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  tileDate: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text,
  },
  tileAmount: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  closeButton: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    width: '100%',
  },
  closeButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
  helperText: {
    fontSize: 13,
    color: COLORS.textLight,
    fontStyle: 'italic',
    marginBottom: 8,
    paddingHorizontal: 4,
  },

  // ─── STYLES KHỐI NHẬP TRẢ NỢ VÀ TRỪ DẦN CÁC THÁNG ───
  paymentSimCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 10,
    marginBottom: 10,
  },
  paymentSimHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 4,
  },
  paymentSimTitle: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  paymentSimTotalDebt: {
    fontSize: 12,
    color: '#475569',
  },
  paymentSimTotalDebtBold: {
    fontWeight: 'bold',
    color: '#DC2626',
  },
  paymentSimInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paymentSimMoneyInput: {
    height: 38,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
  },
  paymentSimMoneyTextInput: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  paymentSimClearBtn: {
    height: 38,
    paddingHorizontal: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentSimClearText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  quickChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 6,
  },
  quickChip: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  quickChipFull: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  quickChipFullText: {
    color: '#1D4ED8',
    fontWeight: 'bold',
  },
  simResultBanner: {
    marginTop: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  simResultText: {
    fontSize: 11.5,
    color: '#065F46',
    lineHeight: 16,
  },
  simSubmitBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  simSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: 'bold',
  },
  monthHeaderSimPaidOff: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  monthHeaderSimDeducted: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  monthStatusSimWrap: {
    alignItems: 'flex-end',
  },
  monthStatusSimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  monthOriginalDebtStriked: {
    fontSize: 11,
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  monthNewDebtText: {
    fontSize: 12.5,
    fontWeight: 'bold',
  },
  textSuccessBold: {
    color: '#059669',
    fontWeight: 'bold',
  },
  monthDeductBadge: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '600',
  },
  simSummaryBox: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  simSummaryTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#065F46',
    marginBottom: 4,
  },

  // ─── STYLES TAB TRẢ NỢ THEO CỤM NGÀY ───
  payModeTabsWrap: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 3,
    marginBottom: 10,
    gap: 4,
  },
  payModeTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  payModeTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  payModeTabText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  payModeTabTextActive: {
    color: '#0F172A',
    fontWeight: 'bold',
  },
  rangeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 4,
  },
  rangePickersRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  rangePickerCol: {
    flex: 1,
  },
  rangePickerLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 3,
  },
  rangeToArrowText: {
    fontSize: 14,
    color: '#94A3B8',
    paddingBottom: 10,
    fontWeight: 'bold',
  },
  rangeResultBox: {
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
  },
  rangeEmptyHint: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },
  rangeStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rangeStatCell: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rangeStatCellHighlight: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  rangeStatLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 2,
  },
  rangeStatLabelBold: {
    fontSize: 11.5,
    fontWeight: 'bold',
    color: '#991B1B',
    marginBottom: 2,
  },
  rangeStatValue: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  rangeStatValueBold: {
    fontSize: 13.5,
    fontWeight: 'bold',
  },
  rangeDaysListWrap: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  rangeDaysListTitle: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  rangeDaysChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  rangeDayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  rangeDayChipDebt: {
    backgroundColor: '#FFF1F1',
    borderColor: '#FECACA',
  },
  rangeDayChipPaid: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  rangeDayChipDate: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#334155',
  },
  rangeDayChipAmt: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  rangeMoreDaysHint: {
    fontSize: 11,
    color: '#64748B',
    alignSelf: 'center',
    fontStyle: 'italic',
  },
  rangePayActionBtn: {
    marginTop: 12,
    backgroundColor: '#059669',
    height: 42,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  rangePayActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  rangePaidOffBanner: {
    marginTop: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  rangePaidOffText: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#065F46',
  },

  // ─── STYLES XÁC THỰC NGÀY NỢ & BỘ LỌC CHI TIẾT ───
  quickChipDebtHighlight: {
    backgroundColor: '#FEF2F2',
    borderColor: '#F87171',
  },
  quickChipDebtHighlightText: {
    color: '#DC2626',
    fontWeight: 'bold',
    fontSize: 11,
  },
  rangeValidationErrorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
  },
  rangeValidationErrorText: {
    color: '#DC2626',
    fontSize: 12.5,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  rangeValidationStatusWarn: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  rangeValidationStatusWarnText: {
    color: '#92400E',
    fontSize: 12,
    lineHeight: 17,
  },
  rangeValidationStatusSuccess: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  rangeValidationStatusSuccessText: {
    color: '#065F46',
    fontSize: 12,
    lineHeight: 17,
  },
  rangeFilterTabsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  rangeFilterSubTabsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  rangeFilterSubTab: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  rangeFilterSubTabActive: {
    backgroundColor: '#334155',
    borderColor: '#334155',
  },
  rangeFilterSubTabActiveDebt: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  rangeFilterSubTabActivePaid: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  rangeFilterSubTabText: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
  },
  rangeFilterSubTabTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  rangeFilterSubTabTextActiveDebt: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  rangeFilterSubTabTextActivePaid: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  rangeFilterEmptyText: {
    fontSize: 11.5,
    color: '#64748B',
    fontStyle: 'italic',
    paddingVertical: 6,
  },
  monthMeatBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginLeft: 6,
  },
  monthMeatBadgeText: {
    fontSize: 11,
    color: '#047857',
    fontWeight: 'bold',
  },
  meatSummaryCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 12,
    marginBottom: 12,
    ...SHADOWS.card,
  },
  meatSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  meatSummaryTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  meatSummaryHeaderIcon: {
    fontSize: 15,
  },
  meatSummaryHeaderTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  copyMeatTextBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  copyMeatTextBtnActive: {
    backgroundColor: '#047857',
  },
  copyMeatTextBtnLabel: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  meatSummaryTable: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  meatSummaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  meatSummaryGridCell: {
    width: '50%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6.5,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  meatSummaryGridCellLeft: {
    borderRightWidth: 1,
    borderRightColor: '#F1F5F9',
  },
  meatSummaryGridCellRight: {},
  meatSummaryItemName: {
    fontSize: 11.5,
    color: '#334155',
    fontWeight: '600',
    flex: 1,
    marginRight: 4,
  },
  meatSummaryItemQty: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: 'bold',
  },
  meatSummaryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#EFF6FF',
    borderTopWidth: 1.5,
    borderTopColor: '#BFDBFE',
  },
  meatSummaryTotalLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1E40AF',
  },
  meatSummaryTotalValue: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#1D4ED8',
  },
  compactHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    gap: 12,
  },
  compactCustomerCol: {
    flex: 1,
  },
  compactCustomerName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  compactCustomerPhone: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  compactDebtCol: {
    alignItems: 'flex-end',
  },
  compactDebtLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  compactDebtValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  payToolsToggleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
  },
  payToolsToggleBarActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  payToolsToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  payToolsToggleIcon: {
    fontSize: 14,
  },
  payToolsToggleText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#4338CA',
  },
  payToolsToggleChevron: {
    fontSize: 11.5,
    fontWeight: 'bold',
    color: '#6366F1',
  },
  payToolsWrapper: {
    marginBottom: 12,
  },
  quickChipsScrollView: {
    marginTop: 6,
    marginBottom: 4,
  },
  quickChipsScrollContainer: {
    flexDirection: 'row',
    gap: 6,
    paddingRight: 10,
  },
  rangeCompactStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 6,
    marginBottom: 8,
  },
  rangeCompactStatCol: {
    flex: 1,
    alignItems: 'center',
  },
  rangeCompactStatLabel: {
    fontSize: 10.5,
    color: '#64748B',
    marginBottom: 1,
  },
  rangeCompactStatVal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  rangeCompactDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 4,
  },
  rangeCompactStatLabelBold: {
    fontSize: 10.5,
    color: '#991B1B',
    fontWeight: 'bold',
    marginBottom: 1,
  },
  rangeCompactStatValBold: {
    fontSize: 12.5,
    fontWeight: 'bold',
  },
  rangeCompactChipsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  rangeCompactChipsTitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  rangeCompactChipsScroll: {
    flexDirection: 'row',
    gap: 5,
    paddingRight: 10,
  },
  rangeDayChipCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF1F1',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  rangeDayChipDateCompact: {
    fontSize: 10.5,
    color: '#334155',
    fontWeight: '600',
  },
  rangeDayChipAmtCompact: {
    fontSize: 10.5,
    color: '#DC2626',
    fontWeight: 'bold',
  },
  rangePayActionBtnCompact: {
    backgroundColor: '#059669',
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  rangePayActionBtnTextCompact: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: 'bold',
  },
  rangePaidOffBannerCompact: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  rangePaidOffTextCompact: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#065F46',
  },

  // ─── STYLES KHỐI NHẬP TRẢ NỢ THEO SỐ TIỀN MỚI ───
  quickPayAmountCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 10,
  },
  quickPayHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickPayTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  quickPayIcon: {
    fontSize: 14,
  },
  quickPayTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  quickPayTotalDebtText: {
    fontSize: 11.5,
    color: COLORS.textSecondary,
  },
  quickPayTotalDebtBold: {
    fontWeight: 'bold',
    color: '#DC2626',
  },
  quickPayInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },

  // ─── STYLES KHỐI TRẢ NỢ THEO CỤM NGÀY TRONG THÁNG ───
  monthRangeSection: {
    marginTop: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  monthRangeToggleBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: '#F1F5F9',
  },
  monthRangeToggleTitle: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  monthRangeToggleArrow: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#0284C7',
  },
  monthRangeContent: {
    padding: 10,
  },
});
