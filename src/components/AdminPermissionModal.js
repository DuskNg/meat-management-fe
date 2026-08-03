// meat-management-fe/src/components/AdminPermissionModal.js
import React, { useState, useImperativeHandle, forwardRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { api } from '../api/client';

const AdminPermissionModal = forwardRef(({ onSaveSuccess }, ref) => {
  const [visible, setVisible] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Trạng thái các quyền phân bổ
  const [isWorkspaceOwner, setIsWorkspaceOwner] = useState(false);
  const [canManageCustomers, setCanManageCustomers] = useState(false);
  const [canManageDebt, setCanManageDebt] = useState(false);
  const [canManageBadDebt, setCanManageBadDebt] = useState(false);
  const [canManageEmployees, setCanManageEmployees] = useState(false);
  const [canManageStore, setCanManageStore] = useState(false);
  const [canManageInventory, setCanManageInventory] = useState(false);
  const [canManageShop, setCanManageShop] = useState(false);

  // Phơi bày các hàm điều khiển cho component cha gọi qua ref
  useImperativeHandle(ref, () => ({
    open: (targetUser) => {
      setUser(targetUser);
      setIsWorkspaceOwner(targetUser.isWorkspaceOwner || false);
      setCanManageCustomers(targetUser.canManageCustomers);
      setCanManageDebt(targetUser.canManageDebt);
      setCanManageBadDebt(targetUser.canManageBadDebt);
      setCanManageEmployees(targetUser.canManageEmployees);
      setCanManageStore(targetUser.canManageStore);
      setCanManageInventory(targetUser.canManageInventory);
      setCanManageShop(targetUser.canManageShop);
      setErrorMsg('');
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
    submit: () => {
      handleSubmit();
    },
  }));

  // Trạng thái tính toán xem đã chọn toàn bộ quyền chưa
  const isAllSelected = 
    isWorkspaceOwner &&
    canManageCustomers && 
    canManageDebt && 
    canManageBadDebt && 
    canManageEmployees && 
    canManageStore && 
    canManageInventory &&
    canManageShop;

  // Bật hoặc tắt toàn bộ quyền
  const handleToggleAll = (value) => {
    setIsWorkspaceOwner(value);
    setCanManageCustomers(value);
    setCanManageDebt(value);
    setCanManageBadDebt(value);
    setCanManageEmployees(value);
    setCanManageStore(value);
    setCanManageInventory(value);
    setCanManageShop(value);
  };

  // Xử lý bật/tắt quyền Chủ Workspace
  const handleToggleWorkspaceOwner = (value) => {
    setIsWorkspaceOwner(value);
  };

  // Xử lý gửi cập nhật quyền lên server
  const handleSubmit = async () => {
    if (!user) return;
    setLoading(true);
    setErrorMsg('');

    try {
      const response = await api.put(`/admin/users/${user.id}/permissions`, {
        isWorkspaceOwner,
        canManageCustomers,
        canManageDebt,
        canManageBadDebt,
        canManageEmployees,
        canManageStore,
        canManageInventory,
        canManageShop,
      });

      if (response.data && response.data.success) {
        if (onSaveSuccess) {
          onSaveSuccess(response.data.data);
        }
        setVisible(false);
      } else {
        setErrorMsg(response.data.message || 'Lỗi cập nhật phân quyền.');
      }
    } catch (error) {
      console.error('Lỗi phân quyền:', error);
      setErrorMsg(error.response?.data?.message || 'Có lỗi xảy ra khi kết nối máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  if (!visible || !user) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={() => setVisible(false)}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Phân quyền tài khoản</Text>
          <Text style={styles.subtitle}>Tài khoản: {user.name} ({user.phone})</Text>

          {errorMsg ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {/* Dòng điều khiển phân quyền: Toàn bộ quyền */}
          <View style={[styles.row, { borderBottomWidth: 2, borderBottomColor: '#475569', paddingBottom: 16, marginBottom: 8 }]}>
            <View style={styles.infoCol}>
              <Text style={[styles.label, { color: '#38BDF8', fontWeight: 'bold' }]}>Toàn bộ quyền</Text>
              <Text style={styles.desc}>Bật hoặc tắt toàn bộ các quyền hạn của tài khoản.</Text>
            </View>
            <Switch
              value={isAllSelected}
              onValueChange={handleToggleAll}
              trackColor={{ false: '#334155', true: '#38BDF8' }}
              thumbColor={isAllSelected ? '#FFFFFF' : '#94A3B8'}
            />
          </View>

          {/* Dòng điều khiển phân quyền: Chủ Workspace */}
          <View style={[styles.row, { borderBottomColor: '#475569', borderBottomWidth: 1, paddingBottom: 12, marginBottom: 8 }]}>
            <View style={styles.infoCol}>
              <Text style={[styles.label, { color: '#A78BFA', fontWeight: 'bold' }]}>👑 Quyền Chủ Workspace</Text>
              <Text style={styles.desc}>Cho phép tạo Workspace, phát mã QR cho nhân viên và quản lý toàn bộ hệ thống.</Text>
            </View>
            <Switch
              value={isWorkspaceOwner}
              onValueChange={handleToggleWorkspaceOwner}
              trackColor={{ false: '#334155', true: '#8B5CF6' }}
              thumbColor={isWorkspaceOwner ? '#FFFFFF' : '#94A3B8'}
            />
          </View>

          {/* Dòng điều khiển phân quyền 1 */}
          <View style={styles.row}>
            <View style={styles.infoCol}>
              <Text style={styles.label}>Quản lý khách hàng</Text>
              <Text style={styles.desc}>Cho phép xem, thêm, sửa, xóa danh sách khách hàng thường.</Text>
            </View>
            <Switch
              value={canManageCustomers}
              onValueChange={setCanManageCustomers}
              trackColor={{ false: '#334155', true: '#0EA5E9' }}
              thumbColor={canManageCustomers ? '#FFFFFF' : '#94A3B8'}
            />
          </View>

          {/* Dòng điều khiển phân quyền 2 */}
          <View style={styles.row}>
            <View style={styles.infoCol}>
              <Text style={styles.label}>Quản lý công nợ</Text>
              <Text style={styles.desc}>Cho phép ghi đơn nợ mới, thu tiền, chỉnh sửa hoặc xóa giao dịch.</Text>
            </View>
            <Switch
              value={canManageDebt}
              onValueChange={setCanManageDebt}
              trackColor={{ false: '#334155', true: '#0EA5E9' }}
              thumbColor={canManageDebt ? '#FFFFFF' : '#94A3B8'}
            />
          </View>

          {/* Dòng điều khiển phân quyền 3 */}
          <View style={styles.row}>
            <View style={styles.infoCol}>
              <Text style={styles.label}>Quản lý nợ xấu</Text>
              <Text style={styles.desc}>Cho phép truy cập và quản lý nhóm khách hàng nợ xấu.</Text>
            </View>
            <Switch
              value={canManageBadDebt}
              onValueChange={setCanManageBadDebt}
              trackColor={{ false: '#334155', true: '#0EA5E9' }}
              thumbColor={canManageBadDebt ? '#FFFFFF' : '#94A3B8'}
            />
          </View>

          {/* Dòng điều khiển phân quyền 4 */}
          <View style={styles.row}>
            <View style={styles.infoCol}>
              <Text style={styles.label}>Quản lý nhân viên</Text>
              <Text style={styles.desc}>Cho phép quản lý nhân viên, chấm công và thanh toán lương.</Text>
            </View>
            <Switch
              value={canManageEmployees}
              onValueChange={setCanManageEmployees}
              trackColor={{ false: '#334155', true: '#0EA5E9' }}
              thumbColor={canManageEmployees ? '#FFFFFF' : '#94A3B8'}
            />
          </View>

          {/* Dòng điều khiển phân quyền 5 */}
          <View style={styles.row}>
            <View style={styles.infoCol}>
              <Text style={styles.label}>Quản lý nhà hàng</Text>
              <Text style={styles.desc}>Cho phép quản lý sơ đồ bàn ăn, thực đơn món ăn, đặt món và thanh toán nhà hàng.</Text>
            </View>
            <Switch
              value={canManageStore}
              onValueChange={setCanManageStore}
              trackColor={{ false: '#334155', true: '#0EA5E9' }}
              thumbColor={canManageStore ? '#FFFFFF' : '#94A3B8'}
            />
          </View>

          {/* Dòng điều khiển phân quyền 6 */}
          <View style={styles.row}>
            <View style={styles.infoCol}>
              <Text style={styles.label}>Quản lý kho</Text>
              <Text style={styles.desc}>Cho phép xem danh sách tồn kho, thêm sản phẩm và theo dõi tổng giá trị kho hàng.</Text>
            </View>
            <Switch
              value={canManageInventory}
              onValueChange={setCanManageInventory}
              trackColor={{ false: '#334155', true: '#0EA5E9' }}
              thumbColor={canManageInventory ? '#FFFFFF' : '#94A3B8'}
            />
          </View>

          {/* Dòng điều khiển phân quyền 7 */}
          <View style={styles.row}>
            <View style={styles.infoCol}>
              <Text style={styles.label}>Quản lý cửa hàng tính giờ</Text>
              <Text style={styles.desc}>Cho phép quản lý bàn/phòng chơi bida, karaoke, giặt đồ, tính tiền theo giờ và phụ thu...</Text>
            </View>
            <Switch
              value={canManageShop}
              onValueChange={setCanManageShop}
              trackColor={{ false: '#334155', true: '#14B8A6' }}
              thumbColor={canManageShop ? '#FFFFFF' : '#94A3B8'}
            />
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setVisible(false)}
              disabled={loading}
            >
              <Text style={styles.cancelBtnText}>Hủy</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Xác nhận</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 450,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 20,
  },
  errorBox: {
    backgroundColor: '#EF444415',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    marginBottom: 16,
  },
  errorText: {
    color: '#F87171',
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  infoCol: {
    flex: 1,
    paddingRight: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E2E8F0',
    marginBottom: 2,
  },
  desc: {
    fontSize: 11,
    color: '#94A3B8',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
    gap: 12,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#475569',
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  submitBtn: {
    backgroundColor: '#0EA5E9',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default AdminPermissionModal;
