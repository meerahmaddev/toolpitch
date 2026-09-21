'use client';

import './Hero.css';

const Hero = () => {
  return (
    <div className="hero">
      <h1 className="hero-title">
        <span className="fade-in-up delay-1">The Smart File Workspace.</span>
      </h1>
      <p className="hero-subtitle fade-in-up delay-1">
        Convert, optimize, and edit documents, images, and voice without the usual friction.
      </p>

      <div className="hero-actions fade-in-up delay-2" style={{ marginTop: '3rem' }}>
        <button
          className="btn-start-converting"
          onClick={() => {
            window.soundManager?.playClick();
            document.getElementById('converter-section')?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          Start Converting
          <span className="arrow">&rarr;</span>
        </button>
      </div>
    </div>
  );
};

export default Hero;
