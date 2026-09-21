import type { Metadata } from 'next';
import './LegalPage.css';

export const metadata: Metadata = { title: 'Privacy Policy | Convertify' };

export default function PrivacyPolicy() {
  return (
    <div className="legal-page-container">
      <div className="legal-header">
        <h1>Privacy Policy</h1>
        <p>Last updated: August 2026</p>
      </div>

      <div className="legal-content">
        <h2>1. Introduction</h2>
        <p>At Convertify, we take your privacy and the security of your files seriously. This Privacy Policy explains how we collect, use, and protect your information when you use our file conversion services.</p>

        <h2>2. File Processing and Storage</h2>
        <p>
          When you upload files to Convertify for processing, they are securely transmitted using industry-standard encryption.{' '}
          <strong>We do not read, analyze, or use your files for training AI models.</strong>
        </p>

        <div className="legal-highlight">
          <p>
            <strong>Automated Deletion:</strong> All files uploaded to our servers, as well as the converted outputs, are automatically and
            permanently deleted from our systems after 24 hours. You may also manually delete them at any time from your Workspace.
          </p>
        </div>

        <h2>3. Information We Collect</h2>
        <p>We collect minimal information required to provide our service:</p>
        <ul>
          <li>
            <strong>Account Information:</strong> If you create an account, we store your email address and an encrypted password.
          </li>
          <li>
            <strong>Usage Data:</strong> We may collect anonymous analytics (such as conversion success rates) to improve our tool performance.
          </li>
        </ul>

        <h2>4. Data Sharing</h2>
        <p>We do not sell, rent, or share your personal information or files with third parties. Your data remains strictly confidential.</p>

        <h2>5. Your Rights</h2>
        <p>You have the right to access, modify, or permanently delete your account and all associated data at any time.</p>
      </div>
    </div>
  );
}
