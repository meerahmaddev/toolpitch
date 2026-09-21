'use client';

import { usePathname } from 'next/navigation';
import './Background.css';

const cardsData = [
  /* LEFT SIDE */
  { id: 1, title: 'PDF Converter', top: '18%', left: '15%', blur: '3px', scale: 0.85, opacity: 0.6, delay: '0s', duration: '12s' },
  { id: 4, title: 'Image to PDF', top: '45%', left: '18%', blur: '6px', scale: 0.7, opacity: 0.4, delay: '3s', duration: '14s' },
  { id: 10, title: 'Smart Search', top: '65%', left: '10%', blur: '4px', scale: 0.8, opacity: 0.45, delay: '1s', duration: '14s' },
  { id: 3, title: 'Text to Speech', top: '80%', left: '32%', blur: '2px', scale: 0.95, opacity: 0.7, delay: '1s', duration: '10s' },
  { id: 9, title: 'Translation', top: '5%', left: '35%', blur: '7px', scale: 0.65, opacity: 0.35, delay: '3.5s', duration: '17s' },

  /* RIGHT SIDE */
  { id: 5, title: 'Doc Editor', top: '18%', right: '15%', blur: '2px', scale: 0.9, opacity: 0.65, delay: '0.5s', duration: '11s' },
  { id: 11, title: 'Data Extractor', top: '45%', right: '18%', blur: '3px', scale: 0.9, opacity: 0.55, delay: '0s', duration: '12s' },
  { id: 6, title: 'Video to Audio', top: '65%', right: '10%', blur: '5px', scale: 0.75, opacity: 0.45, delay: '2.5s', duration: '16s' },
  { id: 7, title: 'JPG to PNG', top: '80%', right: '32%', blur: '4px', scale: 0.8, opacity: 0.5, delay: '1.5s', duration: '13s' },
  { id: 8, title: 'Word to PDF', top: '5%', right: '35%', blur: '10px', scale: 0.5, opacity: 0.25, delay: '4s', duration: '18s' },

  /* CENTER AMBIENT */
  { id: 2, title: 'AI Summarizer', top: '12%', left: '48%', blur: '8px', scale: 0.6, opacity: 0.3, delay: '2s', duration: '15s' },
  { id: 12, title: 'File Merger', top: '88%', right: '45%', blur: '12px', scale: 0.45, opacity: 0.2, delay: '2s', duration: '20s' },
];

const Background = () => {
  const pathname = usePathname();
  // Hide background floating cards on the Tool upload page (e.g. /tools/all/pdf-to-word), Success page,
  // FAQ, and Account Settings — pages with dense readable content where the floating text cards behind
  // reduce legibility.
  const isCleanBackground =
    /^\/tools\/[^/]+\/[^/]+/.test(pathname) ||
    pathname.startsWith('/success') ||
    pathname.startsWith('/faq') ||
    pathname.startsWith('/account');

  return (
    <div className="background-container">
      {!isCleanBackground &&
        cardsData.map((card) => (
          <div
            key={card.id}
            className="pitch-bg-card"
            style={
              {
                top: card.top,
                left: card.left,
                right: card.right,
                filter: `blur(${card.blur})`,
                '--scale': card.scale,
                opacity: card.opacity,
                animationDelay: card.delay,
                animationDuration: card.duration,
              } as React.CSSProperties
            }
          >
            <h3>{card.title}</h3>
          </div>
        ))}
      <div className="orb orb-1"></div>
      <div className="orb orb-2"></div>
      <div className="orb orb-3"></div>
    </div>
  );
};

export default Background;
