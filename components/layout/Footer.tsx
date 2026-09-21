import './Footer.css';

const Footer = () => {
  return (
    <footer className="global-footer">
      <div className="footer-content">
        <div className="footer-brand">
          <div className="footer-logo">
            <img src="/logo.svg" alt="Convertify" className="footer-logo-img" />
            <span>Convertify</span>
          </div>
          <p className="footer-description">
            The all-in-one workspace for your digital files. Fast, secure, and completely free.
          </p>
        </div>
      </div>

      <div className="footer-bottom">
        <p>&copy; {new Date().getFullYear()} Convertify. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default Footer;
