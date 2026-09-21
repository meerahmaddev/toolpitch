import { Loader2 } from 'lucide-react';
import './ProcessingOverlay.css';

interface ProcessingOverlayProps {
  isVisible: boolean;
  text?: string;
  progress?: number;
}

const ProcessingOverlay = ({
  isVisible,
  text = 'Processing... Please wait.',
  progress,
}: ProcessingOverlayProps) => {
  if (!isVisible) return null;

  const hasProgress = typeof progress === 'number' && progress >= 0 && progress <= 100;

  return (
    <div className="processing-overlay">
      <div className="processing-content">
        <Loader2 className="processing-spinner" size={48} />
        <h3 className="processing-text">{text}</h3>
        <div className="processing-bar-container">
          {hasProgress ? (
            <div className="processing-bar-determinate" style={{ width: `${progress}%` }}></div>
          ) : (
            <div className="processing-bar"></div>
          )}
        </div>
        {hasProgress && <span className="processing-progress-percent">{Math.round(progress)}%</span>}
      </div>
    </div>
  );
};

export default ProcessingOverlay;
