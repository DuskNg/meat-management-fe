// meat-management-fe/src/hooks/useGlobalDuplicateDebtAudit.js
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  auditGlobalTransactionsForDuplicates,
  buildGlobalAuditWarningMessage,
  computeDuplicatesSignature,
} from '../utils/debtExportAuditHelper';

// Chu kỳ quét trùng lặp tự động định kỳ: 30 phút (30 * 60 * 1000 ms)
const DUPLICATE_AUDIT_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Custom Hook: Kiểm tra ngầm toàn cục trùng lặp đơn hàng trong ngày (Global Background Debt Audit)
 * - Tự động quét toàn bộ giao dịch phát sinh gần đây của các khách hàng định kỳ cứ 30 phút 1 lần.
 * - Phát hiện nếu trong cùng 1 ngày có từ 2 dòng thịt cùng tên và số kg lệch < 0.2kg.
 * - Bật Pop-up cảnh báo định kỳ 30 phút khi phát hiện đơn trùng hoặc ngay sau khi người dùng vừa lưu nợ.
 * - Cung cấp danh sách trùng lặp để hiển thị thanh Banner cảnh báo ghim trên màn hình.
 * - Sử dụng Ref để lưu trữ tham chiếu, ngăn ngừa hoàn toàn vòng lặp vô hạn (Maximum update depth exceeded).
 */
export const useGlobalDuplicateDebtAudit = ({
  transactions = [],
  customers = [],
  popupModalRef = null,
  onInspectCustomer = null,
  onRefetchTransactions = null,
}) => {
  const [globalDuplicates, setGlobalDuplicates] = useState([]);

  // Dùng Ref để lưu trữ tham chiếu động, tránh trigger re-render vòng lặp
  const onInspectCustomerRef = useRef(onInspectCustomer);
  onInspectCustomerRef.current = onInspectCustomer;

  const onRefetchTransactionsRef = useRef(onRefetchTransactions);
  onRefetchTransactionsRef.current = onRefetchTransactions;

  const popupModalRefRef = useRef(popupModalRef);
  popupModalRefRef.current = popupModalRef;

  const customersRef = useRef(customers);
  customersRef.current = customers;

  const transactionsRef = useRef(transactions);
  transactionsRef.current = transactions;

  const globalDuplicatesRef = useRef([]);
  globalDuplicatesRef.current = globalDuplicates;

  const currentDuplicatesSigRef = useRef('');
  const lastAlertedSignatureRef = useRef('');
  const lastAlertTimestampRef = useRef(0);
  const isAfterSubmitRef = useRef(false);

  // Mở popup cảnh báo chi tiết các khách hàng bị trùng
  const showDuplicateAlertModal = useCallback((customList = null) => {
    // Chỉ chấp nhận customList nếu là mảng thực sự (tránh nhận nhầm SyntheticEvent / ClickEvent khi gọi từ onPress)
    const targetList = Array.isArray(customList) ? customList : globalDuplicatesRef.current;
    if (!Array.isArray(targetList) || targetList.length === 0) return;

    const popupModal = popupModalRefRef.current?.current || popupModalRefRef.current;
    if (!popupModal) return;

    popupModal.show({
      type: 'confirm',
      title: '⚠️ CẢNH BÁO TRÙNG ĐƠN TRONG NGÀY',
      message: buildGlobalAuditWarningMessage(targetList),
      confirmText: 'Kiểm tra chi tiết',
      cancelText: 'Đã hiểu / Bỏ qua',
      onConfirm: () => {
        const firstDup = targetList[0];
        if (firstDup && onInspectCustomerRef.current) {
          onInspectCustomerRef.current(firstDup.customerId, firstDup.customer);
        }
      },
    });
  }, []);

  // Hàm thực hiện kiểm tra ngầm
  const executeAudit = useCallback(
    (txList, isScheduledOrForce = false) => {
      const activeList = txList || transactionsRef.current;
      if (!activeList || activeList.length === 0) {
        if (currentDuplicatesSigRef.current !== '') {
          currentDuplicatesSigRef.current = '';
          setGlobalDuplicates([]);
        }
        return;
      }

      // Quét ngầm toàn bộ giao dịch trong vòng 7 ngày gần đây
      const duplicateResults = auditGlobalTransactionsForDuplicates({
        transactions: activeList,
        customers: customersRef.current || [],
      });

      const newSig = computeDuplicatesSignature(duplicateResults);

      // Cập nhật state nếu chữ ký trùng lặp thay đổi (ngăn re-render loop)
      if (newSig !== currentDuplicatesSigRef.current) {
        currentDuplicatesSigRef.current = newSig;
        setGlobalDuplicates(duplicateResults);
      }

      if (duplicateResults.length > 0) {
        const now = Date.now();
        const timeSinceLastAlert = now - lastAlertTimestampRef.current;
        const isNewSignature = newSig !== lastAlertedSignatureRef.current;

        // Bật pop-up nếu:
        // 1. Người dùng vừa bấm Lưu công nợ (isAfterSubmit / forceAlert)
        // 2. Định kỳ quét 30 phút kích hoạt (isScheduledOrForce && timeSinceLastAlert >= 30 phút)
        // 3. Hoặc có đơn trùng mới phát sinh chưa từng cảnh báo (isNewSignature)
        if (
          isAfterSubmitRef.current ||
          isNewSignature ||
          (isScheduledOrForce && timeSinceLastAlert >= DUPLICATE_AUDIT_INTERVAL_MS)
        ) {
          lastAlertedSignatureRef.current = newSig;
          lastAlertTimestampRef.current = now;
          isAfterSubmitRef.current = false;
          showDuplicateAlertModal(duplicateResults);
        }
      } else {
        lastAlertedSignatureRef.current = '';
      }
    },
    [showDuplicateAlertModal]
  );

  // Lắng nghe thay đổi dữ liệu giao dịch từ API (sau khi refetch hoặc tải mới)
  useEffect(() => {
    if (transactions && transactions.length > 0) {
      const forceAlert = isAfterSubmitRef.current;
      executeAudit(transactions, forceAlert);
    }
  }, [transactions, executeAudit]);

  // Bộ đếm quét định kỳ: Cứ đúng 30 phút quét 1 lần
  useEffect(() => {
    const timer = setInterval(() => {
      console.log('[DUPLICATE_AUDIT] Kích hoạt quét trùng lặp định kỳ 30 phút...');
      // Nếu có hàm refetch giao dịch thì gọi tải mới dữ liệu từ server trước khi quét
      if (typeof onRefetchTransactionsRef.current === 'function') {
        onRefetchTransactionsRef.current()
          .then((res) => {
            const freshTxs = res?.data || transactionsRef.current;
            executeAudit(freshTxs, true);
          })
          .catch(() => {
            executeAudit(transactionsRef.current, true);
          });
      } else {
        executeAudit(transactionsRef.current, true);
      }
    }, DUPLICATE_AUDIT_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [executeAudit]);

  // Hàm được gọi từ bên ngoài để đánh dấu vừa submit ghi nợ thành công
  const notifyDebtSubmitted = useCallback(() => {
    isAfterSubmitRef.current = true;
  }, []);

  return {
    globalDuplicates,
    hasDuplicates: globalDuplicates.length > 0,
    showDuplicateAlertModal,
    notifyDebtSubmitted,
    recheckDuplicates: () => executeAudit(transactionsRef.current, true),
  };
};

export default useGlobalDuplicateDebtAudit;
