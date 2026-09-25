'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Form, Input, Checkbox, Button } from 'antd';
import { message } from '@/utils/message';
import { UserOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { soundManager } from '@/utils/soundManager';
import { api } from '@/utils/apiClient';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { useAuthModal } from '@/context/AuthModalContext';
import './AuthModal.css';

const AuthModal = () => {
  const { isAuthModalOpen, authMode, authOptions, closeAuthModal, openForgotModal } = useAuthModal();
  const [isSignUp, setIsSignUp] = useState(authMode === 'signup');
  const [loginForm] = Form.useForm();
  const [signupForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (isAuthModalOpen) {
      setIsSignUp(authMode === 'signup');
      loginForm.resetFields();
      signupForm.resetFields();
    }
  }, [isAuthModalOpen, authMode, loginForm, signupForm]);

  const persistSession = (response: { access_token: string; refresh_token: string; user: { email: string; name: string } }) => {
    localStorage.setItem('convertify_token', response.access_token);
    localStorage.setItem('convertify_refresh_token', response.refresh_token);
    localStorage.setItem(
      'convertify_active_user',
      JSON.stringify({ email: response.user.email, username: response.user.name })
    );
    window.dispatchEvent(new Event('auth_change'));
  };

  const completeAuth = (
    response: { access_token: string; refresh_token: string; user: { email: string; name: string } },
    successMsg: string
  ) => {
    soundManager.playSuccess();
    soundManager.speak(`Welcome to Convertify, ${response.user.name}`);
    message.success(successMsg);

    persistSession(response);
    const options = authOptions;
    closeAuthModal();

    if (options?.onSuccess) {
      try {
        options.onSuccess();
      } catch (err) {
        console.error('Error executing onSuccess callback:', err);
      }
    }

    if (options?.redirectUrl === null) {
      // Stay on current page (e.g. download in progress)
      return;
    }

    if (options?.redirectUrl) {
      router.push(options.redirectUrl);
    } else {
      router.push('/workspace');
    }
  };

  const onLogin = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      const response = await api.auth.login(values.email, values.password);
      completeAuth(response, 'Successfully logged in!');
    } catch (error) {
      soundManager.playError();
      const msg = error instanceof Error ? error.message : 'Login failed';
      soundManager.speak(msg);
      message.error(msg || 'Incorrect credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onSignup = async (values: { email: string; password: string; username: string }) => {
    setLoading(true);
    try {
      const response = await api.auth.signup(values.email, values.password, values.username);
      if (response && response.access_token && response.user) {
        completeAuth(response, 'Account created successfully!');
      } else {
        soundManager.playSuccess();
        soundManager.speak('Account created successfully. Please log in.');
        message.success('Account created! Please log in to continue.');
        loginForm.setFieldsValue({ email: values.email, password: values.password });
        signupForm.resetFields();
        setIsSignUp(false);
      }
    } catch (error) {
      soundManager.playError();
      const msg = error instanceof Error ? error.message : 'Signup failed';
      soundManager.speak(msg);
      message.error(msg || 'An error occurred during sign up.');
    } finally {
      setLoading(false);
    }
  };

  const handlePanelSwitch = (isSign: boolean) => {
    soundManager.playClick();
    setIsSignUp(isSign);
  };

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) return;
    setLoading(true);
    try {
      const response = await api.auth.googleLogin(credentialResponse.credential);
      completeAuth(response, 'Successfully logged in with Google!');
    } catch (error) {
      soundManager.playError();
      message.error((error instanceof Error && error.message) || 'Google Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    message.error('Google Sign In was unsuccessful');
  };

  if (!isAuthModalOpen) return null;

  return (
    <div className="auth-modal-backdrop" onClick={closeAuthModal}>
      <div className={`auth-container ${isSignUp ? 'right-panel-active' : ''}`} onClick={(e) => e.stopPropagation()}>
        {/* Sign Up Form */}
        <div className="form-container sign-up-container">
          <div className="auth-form-wrapper">
            <div className="auth-mobile-tabs mobile-only">
              <button
                type="button"
                className={`auth-mobile-tab ${!isSignUp ? 'active' : ''}`}
                onClick={() => handlePanelSwitch(false)}
              >
                Log In
              </button>
              <button
                type="button"
                className={`auth-mobile-tab ${isSignUp ? 'active' : ''}`}
                onClick={() => handlePanelSwitch(true)}
              >
                Sign Up
              </button>
            </div>

            <h1 className="auth-title">Create Account</h1>
            <p className="auth-subtitle">Join Convertify and transform your files.</p>

            <Form form={signupForm} name="signup" onFinish={onSignup} size="large" className="antd-auth-form" scrollToFirstError>
              <Form.Item name="username" rules={[{ required: true, message: 'Please enter a username' }]}>
                <div className="floating-input">
                  <Input prefix={<UserOutlined />} placeholder=" " autoComplete="username" />
                  <label>Username</label>
                </div>
              </Form.Item>

              <Form.Item name="email" rules={[{ required: true, message: 'Please enter your email' }, { type: 'email', message: 'Valid email required', transform: (value) => (value ? value.trim() : value) }]}>
                <div className="floating-input">
                  <Input prefix={<MailOutlined />} placeholder=" " autoComplete="email" />
                  <label>Email address</label>
                </div>
              </Form.Item>

              <Form.Item name="password" rules={[{ required: true, message: 'Please enter a password' }, { min: 6, message: 'Must be at least 6 characters' }]}>
                <div className="floating-input">
                  <Input.Password prefix={<LockOutlined />} placeholder=" " autoComplete="new-password" />
                  <label>Password</label>
                </div>
              </Form.Item>

              <Form.Item
                name="confirm"
                dependencies={['password']}
                rules={[
                  { required: true, message: 'Please confirm your password' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error('Passwords do not match!'));
                    },
                  }),
                ]}
              >
                <div className="floating-input">
                  <Input.Password prefix={<LockOutlined />} placeholder=" " autoComplete="new-password" />
                  <label>Confirm Password</label>
                </div>
              </Form.Item>

              <Form.Item
                name="agreement"
                valuePropName="checked"
                rules={[{ validator: (_, value) => (value ? Promise.resolve() : Promise.reject(new Error('You must accept the terms'))) }]}
                className="terms-checkbox"
              >
                <Checkbox>
                  I agree to the <a href="#" onClick={(e) => e.preventDefault()}>Terms</a> & <a href="#" onClick={(e) => e.preventDefault()}>Privacy Policy</a>
                </Checkbox>
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} className="auth-btn solid-btn antd-btn-override" block>
                  Sign Up Now
                </Button>
              </Form.Item>

              <div className="social-divider">
                <span>Or register with</span>
              </div>

              {isSignUp && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
                  <GoogleLogin onSuccess={handleGoogleSuccess} onError={handleGoogleError} theme="outline" size="large" text="signup_with" width={300} />
                </div>
              )}
            </Form>

            <p className="auth-switch">
              Already have an account? <span onClick={() => handlePanelSwitch(false)}>Log In</span>
            </p>
          </div>
        </div>

        {/* Sign In Form */}
        <div className="form-container sign-in-container">
          <div className="auth-form-wrapper">
            <div className="auth-mobile-tabs mobile-only">
              <button
                type="button"
                className={`auth-mobile-tab ${!isSignUp ? 'active' : ''}`}
                onClick={() => handlePanelSwitch(false)}
              >
                Log In
              </button>
              <button
                type="button"
                className={`auth-mobile-tab ${isSignUp ? 'active' : ''}`}
                onClick={() => handlePanelSwitch(true)}
              >
                Sign Up
              </button>
            </div>

            <h1 className="auth-title">Welcome Back</h1>
            <p className="auth-subtitle">Please enter your credentials.</p>

            <Form form={loginForm} name="login" initialValues={{ remember: true }} onFinish={onLogin} size="large" className="antd-auth-form">
              <Form.Item name="email" rules={[{ required: true, message: 'Please enter your email' }, { type: 'email', message: 'Valid email required', transform: (value) => (value ? value.trim() : value) }]}>
                <div className="floating-input">
                  <Input prefix={<MailOutlined />} placeholder=" " autoComplete="username email" />
                  <label>Email address</label>
                </div>
              </Form.Item>

              <Form.Item name="password" rules={[{ required: true, message: 'Please enter your password' }]}>
                <div className="floating-input">
                  <Input.Password prefix={<LockOutlined />} placeholder=" " autoComplete="current-password" />
                  <label>Password</label>
                </div>
              </Form.Item>

              <div className="auth-options">
                <Form.Item name="remember" valuePropName="checked" noStyle>
                  <Checkbox>Remember me</Checkbox>
                </Form.Item>
                <a
                  className="login-form-forgot"
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    soundManager.playClick();
                    openForgotModal();
                  }}
                >
                  Forgot password?
                </a>
              </div>

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} className="auth-btn solid-btn antd-btn-override" block>
                  Log In
                </Button>
              </Form.Item>

              <div className="social-divider">
                <span>Or continue with</span>
              </div>

              {!isSignUp && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
                  <GoogleLogin onSuccess={handleGoogleSuccess} onError={handleGoogleError} theme="outline" size="large" text="signin_with" width={300} />
                </div>
              )}
            </Form>

            <p className="auth-switch">
              Don&apos;t have an account? <span onClick={() => handlePanelSwitch(true)}>Sign Up</span>
            </p>
          </div>
        </div>

        {/* Sliding Overlay */}
        <div className="overlay-container">
          <div className="auth-overlay">
            <div className="overlay-panel overlay-left">
              <div className="overlay-content">
                <h2>Welcome Back!</h2>
                <p>To keep connected with us please login with your personal info.</p>
                <button className="ghost-btn" onClick={() => setIsSignUp(false)}>
                  Log In
                </button>
              </div>
              <div className="dec-circle c-1"></div>
              <div className="dec-circle c-2"></div>
            </div>

            <div className="overlay-panel overlay-right">
              <div className="overlay-content">
                <h2>New Here?</h2>
                <p>Sign up and discover a great amount of new opportunities!</p>
                <button className="ghost-btn" onClick={() => setIsSignUp(true)}>
                  Sign Up
                </button>
              </div>
              <div className="dec-circle c-3"></div>
              <div className="dec-circle c-4"></div>
            </div>
          </div>
        </div>

        <button className="close-modal-btn" onClick={closeAuthModal}>✕</button>
      </div>
    </div>
  );
};

export default AuthModal;
