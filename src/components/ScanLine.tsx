interface ScanLineProps {
  visible: boolean;
}

/**
 * Animated scanning line indicator
 */
const ScanLine = ({ visible }: ScanLineProps) => {
  if (!visible) return null;

  return (
    <div className="mbs-scan-line-container" aria-hidden="true">
      <div className="mbs-scan-line-trail-down" />
      <div className="mbs-scan-line" />
      <div className="mbs-scan-line-trail-up" />
    </div>
  );
};

export default ScanLine;
