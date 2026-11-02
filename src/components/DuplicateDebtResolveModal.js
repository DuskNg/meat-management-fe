// meat-management-fe/src/components/DuplicateDebtResolveModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import SmoothModal from './SmoothModal';
import PopupModal from './PopupModal';
import InvoiceImageViewerModal from './InvoiceImageViewerModal';
import { api } from '../api/client';
import { COLORS } from '../theme';
import { showGlobalToast } from '../store/toastStore';
import {
  addConfirmedValidDuplicateKeys,
  buildDuplicateKeysFromResults,
} from '../utils/debtExportAuditHelper';

/**
 * Helper: Định dạng tiền tệ VND chuẩn Việt Nam
 */
const formatCurrency = (val) => {
  const num = parseFloat(val) || 0;
  return num.toLocaleString('vi-VN') + ' đ';
};

/**
 * Helper: Trích xuất giờ:phút từ ISO date string
 */
const formatTimeOnly = (dateInput) => {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

/**
 * Component Modal: Xem chi tiết & Xóa / Sửa trực tiếp các đơn nghi trùng lặp trong ngày
 * - Giao diện thiết kế phẳng, trực quan, cô đọng chuẩn theo thiết kế danh sách chi tiết (Ảnh 2).
 * - Thanh chọn hàng loạt: "Chọn tất cả", "Tự chọn đơn trùng thừa (giữ 1)", "Xóa đã chọn".
 * - Từng dòng đơn hiển thị: Checkbox, Tên khách hàng, Badge Đơn X/Y, Nút Xem ảnh, Sửa, Xóa, Tổng tiền, Giờ tạo và Chi tiết các món thịt.
 * - Nút "BẰNG CÂN NHƯNG ĐÚNG (XÁC NHẬN TẤT CẢ)" để lưu danh sách loại trừ không cảnh báo lại nữa.
 */
const DuplicateDebtResolveModal = forwardRef(({ onEditTransaction, onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [duplicateList, setDuplicateList] = useState([]);
  const [selectedTxIds, setSelectedTxIds] = useState(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  const popupRef = useRef(null);
  const invoiceImageViewerModalRef = useRef(null);

  // Phơi bày các hàm điều khiển ra bên ngoài
  useImperativeHandle(ref, () => ({
    open: (list = []) => {
      const validList = Array.isArray(list) ? list : [];
      setDuplicateList(validList);
      setSelectedTxIds(new Set());
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
  }));

  const handleClose = () => {
    setVisible(false);
  };

  /**
   * Chuyển đổi dữ liệu từ duplicateList (dạng nhóm theo khách -> nhóm thịt)
   * thành danh sách phẳng các đơn hàng (Transactions) chuẩn xác như Ảnh 2.
   */
  const flatTransactions = useMemo(() => {
    const txMap = new Map();

    (duplicateList || []).forEach((custRes) => {
      (custRes.groups || []).forEach((grp) => {
        (grp.items || []).forEach((it) => {
          const tx = it.transaction;
          if (!tx || !tx.id) return;

          if (!txMap.has(tx.id)) {
            txMap.set(tx.id, {
              id: tx.id,
              customerId: custRes.customerId || tx.customerId,
              customerName: custRes.customerName || tx.customer?.name || 'Khách hàng',
              date: tx.date || tx.createdAt,
              createdAt: tx.createdAt,
              totalAmount: parseFloat(tx.totalAmount) || 0,
              note: tx.note || '',
              invoices: tx.invoices || [],
              items: tx.items || [],
              rawTx: tx,
              matchedMeatNames: new Set([grp.productName]),
            });
          } else {
            txMap.get(tx.id).matchedMeatNames.add(grp.productName);
          }
        });
      });
    });

    // Gom theo từng khách hàng để đánh số thứ tự đơn (Đơn 1/2, Đơn 2/2...)
    const byCustomer = new Map();
    txMap.forEach((tx) => {
      const cKey = tx.customerId || tx.customerName;
      if (!byCustomer.has(cKey)) byCustomer.set(cKey, []);
      byCustomer.get(cKey).push(tx);
    });

    const result = [];
    byCustomer.forEach((list) => {
      // Sắp xếp đơn theo thời gian tăng dần: đơn tạo sớm nhất ở đầu
      list.sort((a, b) => {
        const tA = new Date(a.createdAt || a.date || 0).getTime();
        const tB = new Date(b.createdAt || b.date || 0).getTime();
        if (tA !== tB) return tA - tB;
        return String(a.id).localeCompare(String(b.id));
      });

      const totalCustOrders = list.length;
      list.forEach((tx, idx) => {
        const seqText = `Đơn ${idx + 1}/${totalCustOrders}`;

        // Chuỗi tóm tắt món thịt giống Ảnh 2: "20kg Sườn xg" hoặc "6.75kg Tái (bò), 2.15kg Lạm..."
        let detailsStr = '';
        if (Array.isArray(tx.items) && tx.items.length > 0) {
          detailsStr = tx.items
            .map((item) => {
              const qty = item.quantity != null ? `${parseFloat(item.quantity)}kg` : '';
              const pName = item.product?.name || item.rawMeatName || item.productName || '';
              return `${qty} ${pName}`.trim();
            })
            .filter(Boolean)
            .join(', ');
        }
        if (!detailsStr && tx.note) {
          detailsStr = tx.note;
        }

        result.push({
          ...tx,
          seqText,
          custOrderIndex: idx,
          totalCustOrders,
          detailsStr,
        });
      });
    });

    return result;
  }, [duplicateList]);

  // Đếm tổng số khách hàng có từ 2 đơn nợ trở lên
  const duplicateCustomerCount = useMemo(() => {
    const custSet = new Set();
    flatTransactions.forEach((tx) => {
      if (tx.totalCustOrders >= 2) {
        custSet.add(tx.customerId || tx.customerName);
      }
    });
    return custSet.size;
  }, [flatTransactions]);

  // Tính tổng tiền các đơn đã chọn
  const selectedTotalAmount = useMemo(() => {
    return flatTransactions
      .filter((tx) => selectedTxIds.has(tx.id))
      .reduce((sum, tx) => sum + (tx.totalAmount || 0), 0);
  }, [flatTransactions, selectedTxIds]);

  // Toggle chọn 1 đơn
  const handleToggleSelectTx = (id) => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle chọn tất cả / bỏ chọn tất cả
  const handleToggleSelectAll = () => {
    if (selectedTxIds.size > 0 && selectedTxIds.size === flatTransactions.length) {
      setSelectedTxIds(new Set());
    } else {
      setSelectedTxIds(new Set(flatTransactions.map((tx) => tx.id)));
    }
  };

  // Tự động chọn thông minh các đơn trùng thừa (giữ lại 1 đơn gốc cho mỗi khách)
  const handleSmartSelect = () => {
    const newSelected = new Set();
    flatTransactions.forEach((tx) => {
      // Nếu khách có từ 2 đơn trở lên và đây là đơn thứ 2 trở đi -> chọn đơn này
      if (tx.totalCustOrders >= 2 && tx.custOrderIndex > 0) {
        newSelected.add(tx.id);
      }
    });

    setSelectedTxIds(newSelected);
    if (newSelected.size > 0) {
      showGlobalToast(`Đã tự chọn ${newSelected.size} đơn trùng thừa (giữ lại 1 đơn đầu cho mỗi khách).`, 'info');
    } else {
      showGlobalToast('Không có đơn trùng thừa để chọn tự động.', 'info');
    }
  };

  // Cập nhật lại duplicateList sau khi xóa đơn
  const removeTransactionsFromList = (deletedIds) => {
    const idSet = new Set(deletedIds);
    setDuplicateList((prevList) => {
      const updated = prevList
        .map((res) => {
          const newGroups = (res.groups || [])
            .map((grp) => {
              const newItems = (grp.items || []).filter(
                (it) => !idSet.has(it.transactionId) && !idSet.has(it.transaction?.id)
              );
              return {
                ...grp,
                items: newItems,
                quantities: newItems.map((it) => parseFloat(it.quantity)),
              };
            })
            .filter((grp) => grp.items.length >= 2);

          return {
            ...res,
            groups: newGroups,
          };
        })
        .filter((res) => (res.groups || []).length > 0);

      if (updated.length === 0) {
        setTimeout(() => {
          setVisible(false);
        }, 400);
      }

      return updated;
    });

    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      deletedIds.forEach((id) => next.delete(id));
      return next;
    });

    if (typeof onRefresh === 'function') {
      onRefresh();
    }
  };

  // Xóa đơn đơn lẻ
  const handleDeleteSingleTx = (tx) => {
    if (!tx || !tx.id) return;

    const timeStr = formatTimeOnly(tx.date || tx.createdAt);
    const timeLabel = timeStr ? ` (lúc ${timeStr})` : '';

    popupRef.current?.show({
      type: 'confirm',
      title: '🗑️ XÁC NHẬN XÓA ĐƠN HÀNG',
      message: `Bạn có chắc chắn muốn xóa đơn bán hàng này${timeLabel} của khách **${tx.customerName}** không?\n\n• Số tiền: **${formatCurrency(tx.totalAmount)}**\n• Món thịt: ${tx.detailsStr || 'Không có'}\n\n⚠️ Đơn hàng sẽ bị xóa hoàn toàn khỏi hệ thống!`,
      confirmText: 'Xác nhận xóa',
      cancelText: 'Hủy bỏ',
      onConfirm: async () => {
        try {
          setIsDeleting(true);
          await api.delete(`/transactions/${tx.id}`);
          showGlobalToast('Đã xóa đơn hàng thành công!', 'success');
          removeTransactionsFromList([tx.id]);
        } catch (err) {
          console.error('[DUPLICATE_MODAL] Lỗi xóa đơn:', err);
          showGlobalToast(err.response?.data?.message || 'Không thể xóa đơn hàng lúc này.', 'error');
        } finally {
          setIsDeleting(false);
        }
      },
    });
  };

  // Xóa hàng loạt các đơn đã chọn
  const handleBulkDelete = () => {
    const selectedList = flatTransactions.filter((tx) => selectedTxIds.has(tx.id));
    if (selectedList.length === 0) {
      showGlobalToast('Vui lòng chọn ít nhất 1 đơn trùng để xóa.', 'warning');
      return;
    }

    const count = selectedList.length;
    popupRef.current?.show({
      type: 'confirm',
      title: `🗑️ XÁC NHẬN XÓA ${count} ĐƠN TRÙNG`,
      message: `Bạn có chắc chắn muốn xóa cùng lúc **${count} đơn nợ** đã chọn không?\n\n• Tổng số tiền: **${formatCurrency(selectedTotalAmount)}**\n\n⚠️ Hành động này sẽ xóa vĩnh viễn và không thể hoàn tác.`,
      confirmText: `Xóa ${count} đơn`,
      cancelText: 'Hủy bỏ',
      onConfirm: async () => {
        try {
          setIsDeleting(true);
          const ids = selectedList.map((tx) => tx.id);
          try {
            await api.post('/transactions/bulk-delete', { ids });
          } catch (bulkErr) {
            // Fallback nếu API bulk-delete gặp sự cố thì xóa tuần tự
            await Promise.all(ids.map((id) => api.delete(`/transactions/${id}`)));
          }

          showGlobalToast(`Đã xóa thành công ${count} đơn hàng trùng lặp!`, 'success');
          removeTransactionsFromList(ids);
        } catch (err) {
          console.error('[DUPLICATE_MODAL] Lỗi xóa hàng loạt:', err);
          showGlobalToast(err.response?.data?.message || 'Không thể xóa các đơn đã chọn.', 'error');
        } finally {
          setIsDeleting(false);
        }
      },
    });
  };

  // Mở modal sửa đơn hàng
  const handleEditTx = (tx) => {
    if (!tx || !tx.rawTx) return;
    setVisible(false);
    if (typeof onEditTransaction === 'function') {
      onEditTransaction(tx.rawTx);
    }
  };

  // Mở xem ảnh hóa đơn
  const handleViewImages = (tx) => {
    const invoices = tx.invoices || [];
    if (invoices.length === 0) return;

    const timeStr = formatTimeOnly(tx.date || tx.createdAt);
    invoiceImageViewerModalRef.current?.open({
      images: invoices,
      initialIndex: 0,
      title: `Hóa đơn: ${tx.customerName}`,
      subtitle: `Số tiền: ${formatCurrency(tx.totalAmount)}${timeStr ? ` • ${timeStr}` : ''}`,
    });
  };

  // Xác nhận tất cả các đơn trong modal là đúng (Bằng cân nhưng đúng)
  const handleConfirmAll = () => {
    if (duplicateList.length === 0) return;

    const allKeys = buildDuplicateKeysFromResults(duplicateList);
    addConfirmedValidDuplicateKeys(allKeys);
    showGlobalToast('Đã xác nhận tất cả đơn là hợp lệ. Hệ thống sẽ không cảnh báo lại nữa!', 'success');

    setDuplicateList([]);
    setVisible(false);

    if (typeof onRefresh === 'function') {
      onRefresh();
    }
  };

  return (
    <>
      <SmoothModal visible={visible} onClose={handleClose} zIndex={9999990}>
        <View style={styles.modalContainer}>
          {/* Header chuẩn Bottom-Sheet */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>⚠️ CẢNH BÁO</Text>
              </View>
              <Text style={styles.headerTitle}>TRÙNG ĐƠN TRONG NGÀY</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Banner thông báo vàng cam giống Ảnh 2 */}
          <View style={styles.duplicateWarningBanner}>
            <Text style={styles.duplicateWarningBannerTitle}>
              ⚠️ Phát hiện {flatTransactions.length} đơn trùng ({duplicateCustomerCount} khách có từ 2 đơn nợ)
            </Text>
            <Text style={styles.duplicateWarningBannerSubtitle}>
              Kiểm tra tránh trường hợp ghi nợ 2 lần cho cùng một khách hàng
            </Text>
          </View>

          {/* Thanh chọn & thao tác hàng loạt giống Ảnh 2 */}
          {flatTransactions.length > 0 && (
            <View style={styles.duplicateBulkBar}>
              <View style={styles.duplicateBulkBarTop}>
                <Text style={styles.duplicateBulkCountText} numberOfLines={1}>
                  Đã chọn:{' '}
                  <Text style={styles.duplicateBulkCountHighlight}>{selectedTxIds.size}</Text>
                  /{flatTransactions.length} đơn
                  {selectedTxIds.size > 0 ? (
                    <Text style={styles.duplicateBulkAmountText}>
                      {' '}({formatCurrency(selectedTotalAmount)})
                    </Text>
                  ) : null}
                </Text>

                <TouchableOpacity
                  style={[
                    styles.duplicateBulkDeleteBtn,
                    selectedTxIds.size === 0 && styles.duplicateBulkDeleteBtnDisabled,
                  ]}
                  onPress={handleBulkDelete}
                  disabled={selectedTxIds.size === 0 || isDeleting}
                  activeOpacity={0.7}
                >
                  {isDeleting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.duplicateBulkDeleteBtnText}>
                      🗑️ Xóa đã chọn ({selectedTxIds.size})
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.duplicateBulkActionsRow}>
                <TouchableOpacity
                  style={styles.duplicateBulkQuickBtn}
                  onPress={handleToggleSelectAll}
                  activeOpacity={0.7}
                >
                  <Text style={styles.duplicateBulkQuickBtnText}>
                    {selectedTxIds.size > 0 && selectedTxIds.size === flatTransactions.length
                      ? '✕ Bỏ chọn tất cả'
                      : '✓ Chọn tất cả'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.duplicateBulkQuickBtn, styles.duplicateBulkSmartBtn]}
                  onPress={handleSmartSelect}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.duplicateBulkQuickBtnText, styles.duplicateBulkSmartBtnText]}>
                    ⚡ Tự chọn đơn trùng thừa (giữ 1)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Danh sách các đơn chi tiết dạng card phẳng chuẩn Ảnh 2 */}
          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {flatTransactions.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>🎉</Text>
                <Text style={styles.emptyText}>Tất cả các đơn hàng đã được kiểm tra và xử lý xong!</Text>
              </View>
            ) : (
              flatTransactions.map((tx) => {
                const isSelected = selectedTxIds.has(tx.id);
                const hasInvoices = Array.isArray(tx.invoices) && tx.invoices.length > 0;
                const timeStr = formatTimeOnly(tx.date || tx.createdAt);

                return (
                  <View
                    key={tx.id}
                    style={[
                      styles.itemCard,
                      isSelected && styles.itemCardSelected,
                    ]}
                  >
                    {/* HÀNG 1: Checkbox, Tên khách, Badge số đơn, Nút Xem ảnh, Sửa, Xóa và Tiền/Giờ */}
                    <View style={styles.itemHeader}>
                      <View style={styles.itemHeaderLeft}>
                        {/* Checkbox chọn đơn */}
                        <TouchableOpacity
                          style={[
                            styles.itemCheckbox,
                            isSelected && styles.itemCheckboxSelected,
                          ]}
                          onPress={() => handleToggleSelectTx(tx.id)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          {isSelected ? (
                            <Text style={styles.itemCheckmark}>✓</Text>
                          ) : null}
                        </TouchableOpacity>

                        {/* Tên khách hàng */}
                        <Text style={styles.customerName}>{tx.customerName}</Text>

                        {/* Tag thứ tự đơn (Đơn 1/2, Đơn 2/2...) */}
                        <View style={[styles.seqBadge, isSelected && styles.seqBadgeSelected]}>
                          <Text style={[styles.seqBadgeText, isSelected && styles.seqBadgeTextSelected]}>
                            {tx.seqText}
                          </Text>
                        </View>

                        {/* Huy hiệu Sẽ xóa khi đã tick chọn */}
                        {isSelected && (
                          <View style={styles.selectedToDeleteBadge}>
                            <Text style={styles.selectedToDeleteText}>Sẽ xóa</Text>
                          </View>
                        )}

                        {/* Nút Xem ảnh */}
                        {hasInvoices && (
                          <TouchableOpacity
                            style={[styles.itemImageBtn, styles.itemImageBtnActive]}
                            onPress={() => handleViewImages(tx)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.itemImageBtnActiveText}>
                              Xem ảnh ({tx.invoices.length})
                            </Text>
                          </TouchableOpacity>
                        )}

                        {/* Nút Sửa */}
                        <TouchableOpacity
                          style={styles.itemEditBtn}
                          onPress={() => handleEditTx(tx)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.itemEditBtnText}>Sửa</Text>
                        </TouchableOpacity>

                        {/* Nút Xóa */}
                        <TouchableOpacity
                          style={styles.itemDeleteBtn}
                          onPress={() => handleDeleteSingleTx(tx)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.itemDeleteBtnText}>Xóa</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Khối tiền và giờ bên phải */}
                      <View style={styles.itemAmountContainer}>
                        <Text style={styles.itemAmount}>
                          +{formatCurrency(tx.totalAmount)}
                        </Text>
                        {Boolean(timeStr) && (
                          <Text style={styles.itemTimeText}>
                            🕒 {timeStr}
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* HÀNG 2: Chi tiết các món thịt trong đơn */}
                    {Boolean(tx.detailsStr) && (
                      <View style={styles.itemDetailsRow}>
                        <Text style={styles.itemDetailsText} numberOfLines={2}>
                          🥩 {tx.detailsStr}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Footer chân modal: Nút BẰNG CÂN NHƯNG ĐÚNG và Nút ĐÓNG LẠI */}
          <View style={styles.footer}>
            {flatTransactions.length > 0 && (
              <TouchableOpacity
                style={styles.confirmAllBtn}
                onPress={handleConfirmAll}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmAllBtnText}>✅ BẰNG CÂN NHƯNG ĐÚNG (XÁC NHẬN TẤT CẢ)</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.closeFooterBtn} onPress={handleClose} activeOpacity={0.8}>
              <Text style={styles.closeFooterBtnText}>ĐÓNG LẠI</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SmoothModal>

      {/* Modal xem ảnh phóng to độc lập ở tầng cao nhất */}
      <InvoiceImageViewerModal ref={invoiceImageViewerModalRef} />

      {/* PopupModal xác nhận xóa đặt độc lập ở tầng cao nhất theo quy chuẩn bảo mật */}
      <PopupModal ref={popupRef} />
    </>
  );
});

const styles = StyleSheet.create({
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    paddingHorizontal: 16,
    flexDirection: 'column',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  headerBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#D97706',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#64748B',
  },

  // Banner thông báo màu vàng cam chuẩn Ảnh 2
  duplicateWarningBanner: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
    marginBottom: 6,
  },
  duplicateWarningBannerTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#92400E',
  },
  duplicateWarningBannerSubtitle: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
  },

  // Thanh chọn hàng loạt chuẩn Ảnh 2
  duplicateBulkBar: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 8,
    gap: 6,
  },
  duplicateBulkBarTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  duplicateBulkCountText: {
    fontSize: 12.5,
    color: '#92400E',
    fontWeight: '600',
    flex: 1,
  },
  duplicateBulkCountHighlight: {
    fontWeight: 'bold',
    color: '#DC2626',
  },
  duplicateBulkAmountText: {
    fontSize: 11.5,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  duplicateBulkDeleteBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
  },
  duplicateBulkDeleteBtnDisabled: {
    backgroundColor: '#CBD5E1',
  },
  duplicateBulkDeleteBtnText: {
    fontSize: 11.5,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  duplicateBulkActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  duplicateBulkQuickBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FCD34D',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  duplicateBulkQuickBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#92400E',
  },
  duplicateBulkSmartBtn: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  duplicateBulkSmartBtnText: {
    color: '#B45309',
  },

  scrollBody: {
    maxHeight: 460,
  },
  scrollContent: {
    paddingVertical: 4,
    gap: 6,
  },

  // Thẻ item đơn hàng dạng phẳng chuẩn Ảnh 2
  itemCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  itemCardSelected: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderLeftColor: '#EF4444',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  itemCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  itemCheckboxSelected: {
    backgroundColor: '#EF4444',
    borderColor: '#DC2626',
  },
  itemCheckmark: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
    lineHeight: 13,
  },
  customerName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  seqBadge: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  seqBadgeSelected: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  seqBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#475569',
  },
  seqBadgeTextSelected: {
    color: '#DC2626',
  },
  selectedToDeleteBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  selectedToDeleteText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  itemImageBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemImageBtnActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  itemImageBtnActiveText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#16A34A',
  },
  itemEditBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemEditBtnText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1D4ED8',
  },
  itemDeleteBtn: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#FECACA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemDeleteBtnText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  itemAmountContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  itemAmount: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#DC2626',
  },
  itemTimeText: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  itemDetailsRow: {
    marginTop: 4,
    paddingLeft: 22,
  },
  itemDetailsText: {
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 16,
  },

  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },

  footer: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 8,
  },
  confirmAllBtn: {
    backgroundColor: '#16A34A',
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  confirmAllBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: 'bold',
  },
  closeFooterBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFooterBtnText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },
});

export default DuplicateDebtResolveModal;
