import type { Metadata } from 'next';
import './LegalPage.css';

export const metadata: Metadata = { title: 'Terms of Service | Convertify' };

export default function TermsOfService() {
  return (
    <div className="legal-page-container">
      <div className="legal-header">
        <h1>Terms of Service</h1>
        <p>Last updated: August 2026</p>
      </div>

      <div className="legal-content">
        <h2>1. Acceptance of Terms</h2>
        <p>By accessing or using Convertify, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.</p>

        <h2>2. Service Description</h2>
        <p>Convertify provides digital file conversion, compression, and editing tools. We strive for 100% uptime, but the service is provided &quot;as is&quot; without any warranties of uninterrupted operation.</p>

        <h2>3. Acceptable Use</h2>
        <p>You agree not to use Convertify to:</p>
        <ul>
          <li>Process illegal, copyrighted, or malicious files.</li>
          <li>Attempt to breach or bypass our security measures.</li>
          <li>Use automated scripts (bots/scrapers) to abuse the service limits.</li>
        </ul>

        <h2>4. Data Privacy and File Deletion</h2>
        <div className="legal-highlight">
          <p>
            We respect your ownership of your files. You retain all rights to the files you process through Convertify.{' '}
            <strong>All files are automatically deleted from our servers within 24 hours of processing.</strong> We are not responsible for
            storing or backing up your files.
          </p>
        </div>

        <h2>5. Limitation of Liability</h2>
        <p>
          Convertify shall not be liable for any indirect, incidental, or consequential damages resulting from the use or inability to use our
          services, including data loss or corruption during conversion.
        </p>
      </div>
    </div>
  );
}
