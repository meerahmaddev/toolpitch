'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Form, Input, Button, Modal } from 'antd';
import { UserOutlined, MailOutlined, LockOutlined, ExclamationCircleFilled } from '@ant-design/icons';
import { message } from '@/utils/message';
import { soundManager } from '@/utils/soundManager';
import { api } from '@/utils/apiClient';
import { useAuth } from '@/hooks/useAuth';
import '@/components/auth/AuthModal.css';
import './AccountSettings.css';

function getPasswordStrength(password: string): { label: string; score: number } {
  if (!password) return { label: '', score: 0 };
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { label: 'Weak', score };
  if (score <= 3) return { label: 'Medium', score };
  return { label: 'Strong', score };
}

const persistUpdatedSession = (response: { access_token: string; refresh_token: string; user: { email: string; name: string } }) => {
  localStorage.setItem('convertify_token', response.access_token);
  localStorage.setItem('convertify_refresh_token', response.refresh_token);
  localStorage.setItem(
    'convertify_active_user',
    JSON.stringify({ email: response.user.email, username: response.user.name })
  );
  window.dispatchEvent(new Event('auth_change'));
};

const AccountSettings = () => {
  const { user } = useAuth();
  const router = useRouter();
  const [passwordForm] = Form.useForm();
  const [fullName, setFullName] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const newPasswordValue = Form.useWatch('newPassword', passwordForm) || '';
  const confirmPasswordValue = Form.useWatch('confirmNewPassword', passwordForm) || '';
  const passwordStrength = getPasswordStrength(newPasswordValue);
  const passwordsMatch = confirmPasswordValue.length > 0 && newPasswordValue === confirmPasswordValue;

  useEffect(() => {
    if (user) {
      setFullName(user.username);
    }
  }, [user]);

  const onSaveProfile = async () => {
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      message.error('Please enter your name');
      return;
    }
    setProfileLoading(true);
    try {
      const response = await api.account.updateProfile(trimmedName);
      persistUpdatedSession(response);
      soundManager.playSuccess();
      message.success('Profile updated successfully!');
    } catch (error) {
      soundManager.playError();
      message.error((error instanceof Error && error.message) || 'Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const onChangePassword = async (values: { currentPassword: string; newPassword: string }) => {
    setPasswordLoading(true);
    try {
      await api.account.changePassword(values.currentPassword, values.newPassword);
      soundManager.playSuccess();
      message.success('Password updated successfully!');
      passwordForm.resetFields();
    } catch (error) {
      soundManager.playError();
      message.error((error instanceof Error && error.message) || 'Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  const confirmDeleteAccount = async () => {
    setDeleteLoading(true);
    try {
      await api.account.deleteAccount();
      localStorage.removeItem('convertify_token');
      localStorage.removeItem('convertify_refresh_token');
      localStorage.removeItem('convertify_active_user');
      window.dispatchEvent(new Event('auth_change'));
      message.success('Account deleted');
      router.push('/');
    } catch (error) {
      message.error((error instanceof Error && error.message) || 'Failed to delete account');
    } finally {
      setDeleteLoading(false);
      setDeleteModalOpen(false);
      setDeleteConfirmText('');
    }
  };

  return (
    <div className="account-settings-page">
      <div className="account-settings-header">
        <h1>Account Settings</h1>
        <p>Manage your profile, password, and account.</p>
      </div>

      <div className="account-settings-cards">
        <div className="account-card">
          <h2 className="account-card-title">Profile</h2>
          <div className="antd-auth-form">
            <div className="floating-input">
              <Input
                prefix={<UserOutlined />}
                placeholder=" "
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <label>Full Name</label>
            </div>

            <div className="floating-input account-disabled-field">
              <Input prefix={<MailOutlined />} placeholder=" " value={user?.email || ''} disabled />
              <label>Email Address</label>
            </div>
            <p className="account-field-note">Email can&apos;t be changed yet.</p>

            <Button
              type="primary"
              loading={profileLoading}
              onClick={onSaveProfile}
              className="auth-btn solid-btn antd-btn-override"
              style={{ marginTop: 20 }}
            >
              Save Changes
            </Button>
          </div>
        </div>

        <div className="account-card">
          <h2 className="account-card-title">Change Password</h2>
          <Form form={passwordForm} layout="vertical" className="antd-auth-form" onFinish={onChangePassword} size="large">
            <Form.Item name="currentPassword" rules={[{ required: true, message: 'Please enter your current password' }]}>
              <div className="floating-input">
                <Input.Password prefix={<LockOutlined />} placeholder=" " autoComplete="current-password" />
                <label>Current Password</label>
              </div>
            </Form.Item>

            <Form.Item name="newPassword" rules={[{ required: true, message: 'Please enter a new password' }, { min: 6, message: 'Must be at least 6 characters' }]}>
              <div className="floating-input">
                <Input.Password prefix={<LockOutlined />} placeholder=" " autoComplete="new-password" />
                <label>New Password</label>
              </div>
            </Form.Item>
            {newPasswordValue && (
              <div className="password-strength">
                <div className="password-strength-bar">
                  <span className={`password-strength-fill strength-${passwordStrength.label.toLowerCase()}`} />
                </div>
                <span className={`password-strength-label strength-${passwordStrength.label.toLowerCase()}`}>{passwordStrength.label}</span>
              </div>
            )}

            <Form.Item
              name="confirmNewPassword"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: 'Please confirm your new password' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                    return Promise.reject(new Error('Passwords do not match!'));
                  },
                }),
              ]}
            >
              <div className="floating-input">
                <Input.Password prefix={<LockOutlined />} placeholder=" " autoComplete="new-password" />
                <label>Confirm New Password</label>
              </div>
            </Form.Item>
            {confirmPasswordValue && passwordsMatch && (
              <p className="password-match-hint match">
                ✓ Passwords match
              </p>
            )}

            <p className="account-field-note">
              Signed up with Google? Use <strong>Forgot password</strong> on the login screen instead.
            </p>

            <Form.Item style={{ marginTop: 8, marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" loading={passwordLoading} className="auth-btn solid-btn antd-btn-override">
                Update Password
              </Button>
            </Form.Item>
          </Form>
        </div>

        <div className="account-card account-danger-zone">
          <h2 className="account-card-title">Danger Zone</h2>
          <p className="account-field-note">Deleting your account permanently removes your profile and all your files. This cannot be undone.</p>
          <Button danger onClick={() => setDeleteModalOpen(true)} className="account-delete-btn">
            Delete Account
          </Button>
        </div>
      </div>

      <Modal
        title={
          <span className="delete-modal-title">
            <ExclamationCircleFilled style={{ color: '#ef4444' }} /> Delete your account?
          </span>
        }
        open={deleteModalOpen}
        onCancel={() => {
          setDeleteModalOpen(false);
          setDeleteConfirmText('');
        }}
        footer={null}
        centered
      >
        <p className="account-field-note" style={{ margin: '4px 0 16px' }}>
          This permanently deletes your account and all your files. This action cannot be undone.
        </p>
        <p className="account-field-note" style={{ margin: '0 0 8px' }}>
          Type <strong>{user?.email}</strong> to confirm:
        </p>
        <Input
          value={deleteConfirmText}
          onChange={(e) => setDeleteConfirmText(e.target.value)}
          placeholder={user?.email}
          autoComplete="off"
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <Button
            onClick={() => {
              setDeleteModalOpen(false);
              setDeleteConfirmText('');
            }}
          >
            Cancel
          </Button>
          <Button
            danger
            type="primary"
            loading={deleteLoading}
            disabled={deleteConfirmText !== user?.email}
            onClick={confirmDeleteAccount}
          >
            Confirm Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default AccountSettings;
