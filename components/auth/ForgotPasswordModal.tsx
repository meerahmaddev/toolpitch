'use client';

import { useState, useEffect, useRef } from 'react';
import { Form, Input, Button } from 'antd';
import { message } from '@/utils/message';
import { LockOutlined, MailOutlined, KeyOutlined, ArrowLeftOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { soundManager } from '@/utils/soundManager';
import { api } from '@/utils/apiClient';
import { useAuthModal } from '@/context/AuthModalContext';
import './ForgotPasswordModal.css';
import './AuthModal.css'; // Reuse input and button styles

type Step = 'email' | 'otp' | 'new_password' | 'success';
type OtpStatus = 'typing' | 'verifying' | 'error' | 'success';

const ForgotPasswordModal = () => {
  const { isForgotModalOpen, closeForgotModal, backToLogin, forgotModalMode: mode, verifyEmail: initialEmail } = useAuthModal();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>('email');
  const [otp, setOtp] = useState(['', '', '', '']);
  const [otpStatus, setOtpStatus] = useState<OtpStatus>('typing');
  const [form] = Form.useForm();

  const inputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  useEffect(() => {
    if (isForgotModalOpen) {
      if (mode === 'verify') {
        setStep('otp');
        form.setFieldsValue({ email: initialEmail });
        setTimeout(() => inputRefs[0].current?.focus(), 100);
      } else {
        setStep('email');
        form.resetFields();
      }
      setOtp(['', '', '', '']);
      setOtpStatus('typing');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isForgotModalOpen, mode, initialEmail, form]);

  if (!isForgotModalOpen) return null;

  const onFinishEmail = async (values: { email: string }) => {
    setLoading(true);
    try {
      await api.auth.forgotPassword(values.email);
      soundManager.playSuccess();
      soundManager.speak('Enter the code sent to your email.');
      setStep('otp');
      setTimeout(() => inputRefs[0].current?.focus(), 100);
    } catch (error) {
      soundManager.playError();
      soundManager.speak('Account not found');
      message.error((error instanceof Error && error.message) || 'No account found with this email address.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (otpStatus === 'verifying' || otpStatus === 'success') return;
    if (value && !/^\d+$/.test(value)) return;

    const newOtp = [...otp];
    if (value.length > 1) {
      const pasted = value.slice(0, 4).split('');
      for (let i = 0; i < pasted.length; i++) {
        if (index + i < 4) newOtp[index + i] = pasted[i];
      }
      setOtp(newOtp);
      const nextIndex = Math.min(index + pasted.length, 3);
      inputRefs[nextIndex].current?.focus();

      if (newOtp.every((d) => d !== '')) handleVerifyOrReset(newOtp.join(''));
      return;
    }

    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 3) {
      inputRefs[index + 1].current?.focus();
    }

    if (index === 3 && value) {
      handleVerifyOrReset(newOtp.join(''));
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs[index - 1].current?.focus();
    }
  };

  const handleVerifyOrReset = async (code: string) => {
    setOtpStatus('verifying');
    soundManager.playClick();

    try {
      const email = form.getFieldValue('email');

      if (mode === 'verify') {
        await api.auth.verifyOtp(email, code);
        soundManager.playSuccess();
        setOtpStatus('success');
        setTimeout(() => setStep('success'), 1000);
      } else {
        await api.auth.checkOtp(email, code);
        soundManager.playSuccess();
        setOtpStatus('success');
        setTimeout(() => setStep('new_password'), 1000);
      }
    } catch (error) {
      soundManager.playError();
      setOtpStatus('error');
      message.error((error instanceof Error && error.message) || 'Invalid or expired OTP');
      setTimeout(() => {
        setOtp(['', '', '', '']);
        setOtpStatus('typing');
        inputRefs[0].current?.focus();
      }, 1000);
    }
  };

  const onFinishNewPassword = async (values: { newPassword: string }) => {
    setLoading(true);
    try {
      const email = form.getFieldValue('email');
      const code = otp.join('');
      await api.auth.resetPassword(email, code, values.newPassword);
      soundManager.playSuccess();
      setStep('success');
    } catch (error) {
      soundManager.playError();
      message.error((error instanceof Error && error.message) || 'Invalid or expired OTP. Please try again.');
      setStep('otp');
      setOtp(['', '', '', '']);
      setOtpStatus('typing');
      setTimeout(() => inputRefs[0].current?.focus(), 100);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    soundManager.playClick();
    backToLogin();
  };

  return (
    <div className="forgot-modal-backdrop" onClick={closeForgotModal}>
      <div className="forgot-container" onClick={(e) => e.stopPropagation()}>
        {step === 'email' && (
          <div className="forgot-step email-step active">
            <div className="forgot-icon-container">
              <KeyOutlined className="forgot-icon" />
            </div>
            <h1 className="auth-title">{mode === 'verify' ? 'Verify Your Account' : 'Forgot Password?'}</h1>
            <p className="auth-subtitle">
              {mode === 'verify'
                ? 'Please enter the email associated with your account to verify.'
                : "No worries, we'll send you reset instructions. Please enter your registered email address."}
            </p>

            <Form form={form} layout="vertical" onFinish={onFinishEmail} size="large">
              <Form.Item
                name="email"
                rules={[
                  { required: true, message: 'Please enter your email address' },
                  { type: 'email', message: 'Please enter a valid email address', transform: (value) => (value ? value.trim() : value) },
                ]}
              >
                <div className="floating-input">
                  <Input prefix={<MailOutlined />} placeholder=" " />
                  <label>Email address</label>
                </div>
              </Form.Item>

              <Form.Item style={{ marginTop: 24, marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" loading={loading} className="auth-btn solid-btn antd-btn-override" block>
                  Send OTP Code
                </Button>
              </Form.Item>
            </Form>
          </div>
        )}

        {step === 'otp' && (
          <div className={`otp-container ${otpStatus}`}>
            <h2 className="otp-title">Let&apos;s verify your email</h2>
            <p className="otp-subtitle">
              We&apos;ve sent a 4-digit code to your email.
              <br />
              It&apos;ll auto-verify once entered.
            </p>

            <div className={`otp-inputs ${otpStatus}`}>
              {otp.map((digit, index) => (
                <div key={index} className="otp-input-wrapper">
                  <input
                    ref={inputRefs[index]}
                    type="text"
                    maxLength={4}
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    className="otp-input"
                    disabled={otpStatus === 'verifying' || otpStatus === 'success'}
                  />
                </div>
              ))}

              <div className="success-checkmark-box">
                <CheckCircleOutlined style={{ fontSize: '32px', color: '#10b981' }} />
              </div>
            </div>

            <p className="resend-text">
              Didn&apos;t receive the code? <span>Resend</span>
            </p>
          </div>
        )}

        {step === 'new_password' && (
          <div className="forgot-step email-step active">
            <div className="forgot-icon-container">
              <LockOutlined className="forgot-icon" />
            </div>
            <h1 className="auth-title">Set New Password</h1>
            <p className="auth-subtitle">Please enter a strong new password.</p>

            <Form form={form} layout="vertical" onFinish={onFinishNewPassword} size="large">
              <Form.Item name="newPassword" rules={[{ required: true, message: 'Please enter a new password' }]}>
                <div className="floating-input">
                  <Input.Password prefix={<LockOutlined />} placeholder=" " />
                  <label>New Password</label>
                </div>
              </Form.Item>

              <Form.Item style={{ marginTop: 24, marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" loading={loading} className="auth-btn solid-btn antd-btn-override" block>
                  Reset Password
                </Button>
              </Form.Item>
            </Form>
          </div>
        )}

        {step === 'success' && (
          <div className="forgot-step success-step active">
            <div className="success-icon-container">
              <CheckCircleOutlined className="success-check-icon" />
            </div>
            <h2 className="success-title">{mode === 'verify' ? 'Account Verified!' : 'Password Reset!'}</h2>
            <p className="success-subtitle">
              {mode === 'verify'
                ? 'Your email has been verified successfully. You can now log in.'
                : 'Your password has been successfully reset. Click below to log in magically.'}
            </p>

            <Button
              type="primary"
              size="large"
              className="auth-btn solid-btn"
              block
              onClick={() => {
                soundManager.playClick();
                backToLogin();
              }}
            >
              Continue
            </Button>
          </div>
        )}

        {step === 'email' && (
          <div className="forgot-back" onClick={handleBack}>
            <ArrowLeftOutlined style={{ marginRight: 6 }} /> Back to Log In
          </div>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordModal;
